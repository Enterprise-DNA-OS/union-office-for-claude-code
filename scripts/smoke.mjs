#!/usr/bin/env node
// npm test: a temporary database, migrate twice, seed twice, then every command, with assertions.
// Uses the embedded database unless UNION_TEST_POSTGRES_URL or TEST_DATABASE_URL names a
// disposable Postgres. Never point this at a working database: it seeds demo data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { migrate } from './migrate.mjs';
import { seed } from './seed.mjs';
import { run, reads, commands, resolve } from './union.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'union-test-'));
process.env.DATABASE_URL = process.env.UNION_TEST_POSTGRES_URL || process.env.TEST_DATABASE_URL || '';
process.env.DATA_DIR = path.join(tmp, 'db');
process.env.OUTPUT_DIR = path.join(tmp, 'out');
process.env.DRAFTS_DIR = path.join(tmp, 'drafts');
process.env.UNION_ACTOR = 'Test operator';

const db = await getDb();
let checks = 0;
const ok = (v, msg) => { assert.ok(v, msg); checks++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; };
const rejects = async (args, pattern) => { await assert.rejects(() => run(db, args), pattern); checks++; };
const count = async (args) => (await run(db, args)).length;

try {
  if (db.mode === 'postgres') {
    await db.exec('drop schema public cascade; create schema public;');
  }
  eq((await migrate(db)).ran.length, 1, 'first migrate applies 0001');
  eq((await migrate(db)).ran.length, 0, 'second migrate is a no-op');
  await seed(db);
  const [{ n: before }] = await db.query('select count(*)::int n from members');
  await seed(db);
  eq((await db.query('select count(*)::int n from members'))[0].n, before, 'seed is idempotent');

  // Every read runs.
  for (const name of Object.keys(reads)) ok(Array.isArray(await run(db, [name])), name);

  // The demo's planted problems.
  eq(await count(['arrears']), 5, 'five members in arrears');
  eq((await run(db, ['remittance-gaps'])).map((r) => r.member_no).sort(), ['U1010', 'U1011']);
  const kfp = (await run(db, ['remittances'])).find((r) => r.employer === 'KFP');
  eq([kfp.expected_cents, kfp.received_cents, kfp.difference_cents], [17600, 8800, -8800]);
  ok((await run(db, ['remittances'])).find((r) => r.employer === 'BAC').days_since_period > 35, 'Bayview has gone quiet');
  eq((await run(db, ['no-delegate'])).map((r) => r.workplace).sort(), ['CL-LAV', 'SCH-TGA']);
  eq((await run(db, ['delegates'])).filter((r) => r.issue !== 'ok').length, 3);
  eq(await count(['case-deadlines']), 4);
  eq(await count(['cases']), 6, 'closed cases drop off');
  const findings = await run(db, ['compliance']);
  eq(findings.map((f) => f.rule).sort(), ['R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R06']);
  ok(findings.every((f) => f.source.includes('Act')), 'every finding cites its Act');
  eq((await run(db, ['visits'])).filter((v) => v.issue !== 'ok').map((v) => v.code).sort(), ['V-302', 'V-303']);
  eq(await count(['quiet']), 4);
  ok((await run(db, ['attention'])).length >= 15, 'attention gathers everything');
  eq((await run(db, ['members', '--workplace=kfp-ham'])).length, 6);
  eq((await run(db, ['members', '--status=lapsed']))[0].member_no, 'U1005');

  // Matching.
  eq((await resolve(db, 'member', 'u1004')).name, 'Grace Whitu');
  eq((await resolve(db, 'member', 'whitu')).code, 'U1004');
  await assert.rejects(() => resolve(db, 'member', 'an'), /Ambiguous member/); checks++;
  await assert.rejects(() => resolve(db, 'member', 'nobody-here'), /no member matches/); checks++;
  const profile = await run(db, ['member', 'Grace']);
  eq(profile.cases[0].code, 'C-201');
  eq(profile.payments.length, 2);

  // Statutory deadlines move when the facts change.
  const c201 = (await run(db, ['case-deadlines'])).find((r) => r.code === 'C-201');
  eq(c201.days_left, 10, 'NZ personal grievance: 90 days from the event');
  const c202 = (await run(db, ['case-deadlines'])).find((r) => r.code === 'C-202');
  eq(c202.limit_text, 'raise within 12 months', 'sexual harassment grievance: 12 months');
  eq((await run(db, ['case-deadlines'])).find((r) => r.code === 'C-203').days_left, 6, 'AU unfair dismissal: 21 days');
  await run(db, ['update-case', 'C-201', '--status=raised', '--raised=today']);
  ok(!(await run(db, ['case-deadlines'])).some((r) => r.code === 'C-201'), 'raised grievance clears its deadline');
  await run(db, ['update-case', 'C-204', `--challenged=${new Date().toISOString().slice(0, 10)}`]);
  ok(!(await run(db, ['compliance'])).some((r) => r.rule === 'R03'), 'a filed challenge clears R03');
  await run(db, ['update-case', 'C-205', '--next-step=Attend conciliation', '--due=2099-01-01']);
  eq((await run(db, ['cases'])).filter((r) => r.overdue).length, 0);
  await rejects(['update-case', 'C-205', '--status=won'], /must be one of/);
  await rejects(['update-case', 'C-205', '--due=31/12/2026'], /must be a date/);

  // New case gets its deadline computed on the way in.
  const added = await run(db, ['add-case', '--code=C-900', '--member=U1015', '--kind=general protections', '--jurisdiction=au', '--event=2099-01-01', '--organiser=Dana Kowalski']);
  eq(added[0].deadline_on, '2099-01-22');

  // Bargaining: starting a round clears R04.
  await run(db, ['start-round', 'Southern Care', '--code=B-SCH-2026', `--initiated=${new Date().toISOString().slice(0, 10)}`, '--claims=Pay parity with public hospitals']);
  ok(!(await run(db, ['compliance'])).some((r) => r.rule === 'R04'), 'initiated round clears R04');
  eq((await run(db, ['bargaining'])).find((b) => b.code === 'A-SCH').round_status, 'initiated');

  // Entry: notice and a current permit clear R06.
  await run(db, ['update-visit', 'V-302', `--notice=${new Date().toISOString().slice(0, 10)}`]);
  await run(db, ['add-permit', '--no=EP-26-0001', '--holder=Priya Nair', '--issued=2026-01-01', '--expires=2029-01-01']);
  await run(db, ['update-visit', 'V-303', '--permit=EP-26-0001']);
  eq((await run(db, ['visits'])).filter((v) => v.issue !== 'ok').length, 0, 'notice given and a current permit');
  await run(db, ['update-visit', 'V-303', '--done']);
  ok(!(await run(db, ['visits'])).some((v) => v.code === 'V-303'), 'done visits leave the list');
  await run(db, ['update-visit', 'V-301', '--notice=2026-01-01']);
  eq((await run(db, ['visits'])).find((v) => v.code === 'V-301').issue, 'notice more than 14 days ahead');
  const visit = await run(db, ['add-visit', '--code=V-900', '--workplace=CL-PTB', '--organiser=Dana Kowalski', '--on=2099-03-20', '--notice=2099-03-01', '--permit=EP-24-1187']);
  eq(visit[0].issue, 'permit expired before the visit');

  // Members, dues, delegates.
  await run(db, ['add-member', '--no=U2001', '--first=Te Rina', '--last=Walker', '--workplace=SCH-TGA', '--dues=8.50', '--method=direct debit']);
  eq((await resolve(db, 'member', 'te rina')).code, 'U2001');
  await rejects(['add-member', '--no=U2002', '--first=X'], /missing --last, --workplace/);
  await rejects(['add-member', '--no=U2002', '--first=X', '--last=Y', '--workplace=SCH-TGA', '--dues=-1'], /amount in dollars/);
  await run(db, ['add-payment', 'Rangi', '--amount=17.00']);
  ok(!(await run(db, ['arrears'])).some((r) => r.member_no === 'U1007'), 'payment clears arrears');
  await run(db, ['add-delegate', 'Ana Tupou', '--term-ends=2028-11-01']);
  ok(!(await run(db, ['no-delegate'])).some((r) => r.workplace === 'SCH-TGA'));
  await run(db, ['train-delegate', 'Wiremu']);
  ok(!(await run(db, ['delegates'])).some((r) => r.member_no === 'U1008' && r.issue === 'not trained'));
  await rejects(['train-delegate', 'Kate Duncan'], /no current delegate/);
  await run(db, ['log', 'Liam', '--kind=call', '--body=Rang about the bargaining report-back']);
  ok(!(await run(db, ['quiet'])).some((r) => r.member_no === 'U1019'), 'a logged call takes Liam off the quiet list');
  await run(db, ['update-member', 'Ben Carter', '--status=active']);
  eq((await resolve(db, 'member', 'U1005')).code, 'U1005');
  ok((await run(db, ['audit'])).length >= 10, 'every write is audited');

  // Import: UnionWare member export, dry run, real run, repeat skipped, bad file rolled back.
  const csv = path.join(REPO_ROOT, 'examples', 'unionware-members.csv');
  const dry = await run(db, ['import', 'unionware', csv, '--dry-run']);
  eq(dry[0].members_added, 3);
  eq((await db.query("select count(*)::int n from members where member_no like 'U300%'"))[0].n, 0, 'dry run saves nothing');
  const real = await run(db, ['import', 'unionware', csv]);
  eq([real[0].members_added, real[0].employers_added, real[0].workplaces_added], [3, 1, 2]);
  const mo = await resolve(db, 'member', 'U3003');
  eq(mo.name, 'Marie "Mo" Okoro');
  eq((await db.query("select status, dues_method, joined_on, weekly_dues_cents from members where member_no = 'U3002'"))[0], { status: 'active', dues_method: 'direct_debit', joined_on: '2019-11-02', weekly_dues_cents: 950 });
  eq((await run(db, ['import', 'unionware', csv]))[0].result, 'skipped');
  const bad = path.join(tmp, 'bad.csv');
  fs.writeFileSync(bad, 'Member Number,First Name,Last Name,Join Date\nU4001,Ok,Row,2026-01-01\nU4002,Bad,Date,yesterday\n');
  await rejects(['import', 'unionware', bad], /cannot read the date/);
  eq((await db.query("select count(*)::int n from members where member_no = 'U4001'"))[0].n, 0, 'a bad row rolls back the whole file');

  // Import: an employer's remittance file.
  const rem = await run(db, ['import', 'remittance', path.join(REPO_ROOT, 'examples', 'remittance.csv'), '--employer=KFP', '--code=KFP-R3', '--from=2099-01-01', '--to=2099-01-28']);
  eq([rem[0].matched, rem[0].unknown_members, rem[0].total_cents], [4, 'U9999', 17600]);

  // Drafts never send; they land in drafts/.
  const review = await run(db, ['weekly-review']);
  ok(fs.readFileSync(path.join(process.env.DRAFTS_DIR, path.basename(review[0].draft)), 'utf8').includes('## Dues'));
  const arrearsDraft = await run(db, ['draft-arrears', 'Kate Duncan']);
  ok(fs.readFileSync(path.join(process.env.DRAFTS_DIR, path.basename(arrearsDraft[0].draft)), 'utf8').includes('pay your dues directly'));
  await rejects(['draft-arrears', 'Grace'], /not in arrears/);
  const q = await run(db, ['draft-remittance-query', 'Bayview']);
  ok(fs.readFileSync(path.join(process.env.DRAFTS_DIR, path.basename(q[0].draft)), 'utf8').includes('nothing since'));
  const notice = await run(db, ['draft-entry-notice', 'V-900']);
  ok(notice[0].warning.includes('expires'));
  await rejects(['draft-entry-notice', 'V-304'], /not in Australia/);
  const g = await run(db, ['draft-grievance', 'C-202']);
  ok(fs.readFileSync(path.join(process.env.DRAFTS_DIR, path.basename(g[0].draft)), 'utf8').includes('Employment Relations Act 2000'));
  await rejects(['draft-grievance', 'C-203'], /NZ personal grievances/);

  // Export: every table plus a manifest, into a new folder only.
  const out = path.join(tmp, 'export');
  const manifest = await run(db, ['export', `--out=${out}`]);
  eq(manifest.length, 15);
  ok(fs.readFileSync(path.join(out, 'members.csv'), 'utf8').includes('"Marie ""Mo"""'), 'CSV quoting survives');
  await rejects(['export', `--out=${out}`], /not empty/);

  await rejects(['nonsense'], /unknown command/);
  eq((await run(db, ['help'])).length, Object.keys(reads).length + Object.keys(commands).length);
} finally {
  await db.close();
}

// The rendered views and documents, and the CLI as a person runs it, on the same data.
const env = { ...process.env };
for (const [script, args, expect] of [
  ['view.mjs', [], /view: .*organising/],
  ['docs.mjs', [], /document\(s\) rendered/],
  ['union.mjs', ['attention'], /deadline/],
  ['union.mjs', ['arrears', '--json'], /"member_no"/],
]) {
  const r = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', script), ...args], { env, encoding: 'utf8' });
  assert.equal(r.status, 0, `${script} ${args.join(' ')} failed: ${r.stderr}`);
  assert.match(r.stdout, expect);
  checks++;
}
const amb = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'union.mjs'), 'member', 'an'], { env, encoding: 'utf8' });
assert.equal(amb.status, 1, 'ambiguous match exits 1');
assert.match(amb.stderr, /Ambiguous/);
checks++;
const html = fs.readdirSync(path.join(process.env.OUTPUT_DIR, 'docs-out', 'case-file'));
assert.ok(html.length >= 4, 'case files rendered');
checks++;

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`PASS: ${checks} checks, ${Object.keys(reads).length + Object.keys(commands).length} commands (${process.env.DATABASE_URL ? 'postgres' : 'pglite'})`);
