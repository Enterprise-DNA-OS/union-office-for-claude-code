#!/usr/bin/env node
// The one CLI for Union Office for Claude Code.
//
//   npm run union -- help
//   npm run union -- attention
//   npm run union -- member "grace"
//   npm run union -- arrears --json
//
// Human tables by default, --json for machines. Records match on code, member number or a
// case-insensitive part of the name; an ambiguous match lists the candidates and exits 1.
// Nothing here sends. Letters and emails are written to drafts/ for a person to send.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { parseCsv, pick } from './lib/csv.mjs';
import { table as textTable, money } from './lib/format.mjs';

// ---------------------------------------------------------------- reads

export const reads = {
  members: {
    about: 'Members, filtered by --workplace, --employer or --status',
    sql: `select member_no, name, status, workplace, employer, dues_method, weekly_dues_cents, joined_on, last_paid_on, last_contact_on
          from member_directory
          where ($1::text is null or lower(workplace) = lower($1))
            and ($2::text is null or lower(employer) = lower($2))
            and ($3::text is null or status = lower($3))
          order by workplace nulls last, name`,
    params: (o) => [o.workplace ?? null, o.employer ?? null, o.status ?? null],
  },
  density: { about: 'Members, delegates and density at every workplace', sql: 'select * from density order by density_pct nulls first, workplace' },
  'no-delegate': { about: 'Workplaces with members but no delegate', sql: `select workplace, name, organiser, members, headcount from density where delegates = 0 and members > 0 order by members desc` },
  delegates: { about: 'Delegate and HSR roster with training and term issues', sql: 'select member_no, name, workplace, role, elected_on, term_ends_on, trained_on, issue from delegate_roster order by issue <> \'ok\' desc, workplace' },
  arrears: { about: 'Active members with no dues in six weeks', sql: 'select * from arrears order by days_unpaid desc' },
  remittances: { about: 'Each employer\'s latest remittance against expected dues', sql: 'select * from remittance_check order by difference_cents, employer' },
  'remittance-gaps': { about: 'Payroll members missing from their employer\'s latest remittance', sql: 'select * from remittance_gaps order by employer, name' },
  cases: { about: 'Open cases with next step and due date', sql: 'select * from case_load order by next_step_due nulls last, code' },
  'case-deadlines': { about: 'Statutory time limits on open cases, nearest first', sql: 'select code, member, kind, jurisdiction, organiser, rule, limit_text, deadline_on, days_left from case_deadlines order by days_left' },
  bargaining: {
    about: 'Collective agreements, expiry, bargaining window and round status',
    sql: 'select code, name, jurisdiction, expires_on, days_to_expiry, window_opens_on, round, round_status, initiated_on, next_meeting_on, members_covered from bargaining_status order by expires_on',
  },
  visits: { about: 'Planned site visits with entry notice and permit checks', sql: 'select * from visit_checks order by visit_on' },
  permits: { about: 'Entry permits and expiry', sql: 'select permit_no, holder, issued_on, expires_on, expires_on - current_date as days_left from entry_permits order by expires_on' },
  quiet: { about: 'Members at bargaining sites with no contact in 90 days', sql: 'select * from quiet_members order by days_quiet desc nulls first' },
  compliance: { about: 'Records checked against the rules in docs/compliance.md', sql: 'select * from compliance_findings order by days_left nulls last, rule' },
  attention: {
    about: 'Everything due, late, short or stuck, one list',
    sql: `select * from (
            select 'deadline' as kind, record, detail, due_on, days_left from compliance_findings
            union all
            select 'arrears', member_no, name || ': ' || days_unpaid || ' days unpaid (' || dues_method || ')', null::date, null::int from arrears
            union all
            select 'remittance', remittance, employer_name || ': ' || case when difference_cents < 0 then 'short $' || to_char(-difference_cents / 100.0, 'FM999999990.00') || ' on expected dues' else 'no new file for ' || days_since_period || ' days' end,
                   null::date, null::int
            from remittance_check where difference_cents < 0 or days_since_period > 35
            union all
            select 'next step', code, member || ': ' || next_step, next_step_due, next_step_due - current_date from case_load where overdue
            union all
            select 'delegate', member_no, name || ' at ' || workplace || ': ' || issue, term_ends_on, null::int from delegate_roster where issue <> 'ok'
            union all
            select 'organising', workplace, name || ': ' || members || ' members, no delegate', null::date, null::int from density where delegates = 0 and members > 0
          ) a order by days_left nulls last, kind, record`,
  },
  'organiser-load': {
    about: 'Open cases, overdue steps, visits and workplaces per organiser',
    sql: `select o.organiser,
            (select count(*) from case_load c where c.organiser = o.organiser) as open_cases,
            (select count(*) from case_load c where c.organiser = o.organiser and c.overdue) as overdue_steps,
            (select count(*) from visit_checks v where v.organiser = o.organiser) as planned_visits,
            (select count(*) from workplaces w where w.organiser = o.organiser) as workplaces
          from (select organiser from workplaces union select organiser from cases where status not in ('settled','withdrawn','closed')) o
          where o.organiser <> '' order by open_cases desc, o.organiser`,
  },
  employers: { about: 'Employers and payroll contacts', sql: 'select code, name, country, payroll_contact, payroll_email from employers order by code' },
  workplaces: { about: 'Workplaces with employer, region and organiser', sql: 'select w.code, w.name, e.code as employer, w.region, w.headcount, w.organiser from workplaces w join employers e on e.id = w.employer_id order by w.code' },
  audit: { about: 'Every change made through this CLI, newest first', sql: 'select entity, record_id, operation, actor, detail, created_at from audit_log order by id desc limit 200' },
  imports: { about: 'Imported files with fingerprint and row count', sql: 'select source, filename, row_count, actor, created_at from import_batches order by created_at desc' },
};

// ---------------------------------------------------------------- helpers

function parseArgs(argv) {
  const pos = [];
  const opts = {};
  for (const a of argv) {
    if (a === '--help' || a === '-h') { pos.unshift('help'); continue; }
    if (!a.startsWith('--')) { pos.push(a); continue; }
    const eq = a.indexOf('=');
    if (eq < 0) opts[a.slice(2)] = true;
    else opts[a.slice(2, eq)] = a.slice(eq + 1);
  }
  return { pos, opts };
}

class UsageError extends Error {}
const need = (o, ...keys) => {
  const missing = keys.filter((k) => o[k] === undefined || o[k] === true || o[k] === '');
  if (missing.length) throw new UsageError(`missing ${missing.map((k) => '--' + k).join(', ')}`);
};
const isoDate = (v, name) => {
  if (v === undefined || v === null || v === '') return null;
  if (v === 'today') return new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v)) || Number.isNaN(Date.parse(v))) throw new UsageError(`--${name} must be a date like 2026-11-16`);
  return String(v);
};
const cents = (v, name) => {
  if (v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0) throw new UsageError(`--${name} must be an amount in dollars, like 8.50`);
  return Math.round(n * 100);
};
const oneOf = (v, allowed, name) => {
  if (v === undefined) return undefined;
  const s = String(v).toLowerCase().replace(/[\s-]+/g, '_');
  if (!allowed.includes(s)) throw new UsageError(`--${name} must be one of: ${allowed.join(', ')}`);
  return s;
};
const actorOf = (o) => (typeof o.actor === 'string' && o.actor) || process.env.UNION_ACTOR || process.env.USER || process.env.USERNAME || 'operator';

async function audit(db, entity, recordId, operation, actor, detail) {
  await db.query('insert into audit_log (entity, record_id, operation, actor, detail) values ($1, $2, $3, $4, $5)', [entity, String(recordId), operation, actor, JSON.stringify(detail ?? {})]);
}

// Resolve one record by exact code, then a case-insensitive part of its name.
const lookups = {
  member: { sql: `select id, member_no as code, first_name || ' ' || last_name as name from members`, code: 'member_no', name: `first_name || ' ' || last_name` },
  workplace: { sql: 'select id, code, name from workplaces', code: 'code', name: 'name' },
  employer: { sql: 'select id, code, name, country, payroll_contact, payroll_email from employers', code: 'code', name: 'name' },
  case: { sql: 'select c.id, c.code, c.code as name from cases c', code: 'c.code', name: 'c.summary' },
  agreement: { sql: 'select id, code, name from agreements', code: 'code', name: 'name' },
  visit: { sql: 'select id, code, code as name from site_visits', code: 'code', name: 'purpose' },
  permit: { sql: 'select id, permit_no as code, holder as name from entry_permits', code: 'permit_no', name: 'holder' },
};
export async function resolve(db, kind, key) {
  if (!key || key === true) throw new UsageError(`name the ${kind}`);
  const l = lookups[kind];
  const exact = await db.query(`${l.sql} where lower(${l.code}) = lower($1)`, [String(key)]);
  if (exact.length === 1) return exact[0];
  const hits = await db.query(`${l.sql} where lower(${l.name}) like '%' || lower($1) || '%' or lower(${l.code}) like lower($1) || '%' order by 2 limit 20`, [String(key)]);
  if (hits.length === 1) return hits[0];
  if (!hits.length) throw new UsageError(`no ${kind} matches "${key}"`);
  throw new UsageError(`Ambiguous ${kind} "${key}": ${hits.map((h) => `${h.code} (${h.name})`).join(', ')}`);
}

function writeDraft(name, body) {
  const dir = path.resolve(REPO_ROOT, process.env.DRAFTS_DIR || 'drafts');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${new Date().toISOString().slice(0, 10)}-${name}.md`);
  fs.writeFileSync(file, body);
  return file;
}

const fmtDollars = (c, row) => (c === null || c === undefined ? '' : money(c, row?.country === 'AU' ? 'AUD' : 'NZD').replace(/^NZ\$|^A\$/, '$'));

export function printRows(rows) {
  if (!rows.length) return '  (none)';
  const columns = Object.keys(rows[0])
    .filter((k) => k !== 'id')
    .map((key) => ({
      key,
      label: key.replace(/_cents$/, '').replace(/_/g, ' '),
      align: typeof rows[0][key] === 'number' ? 'right' : 'left',
      width: 60,
      format: key.endsWith('_cents') ? (v) => (v === null ? '' : (Number(v) / 100).toFixed(2)) : (v) => (v === true ? 'yes' : v === false ? 'no' : typeof v === 'object' && v !== null ? JSON.stringify(v) : v),
    }));
  return textTable(rows, columns);
}

// ---------------------------------------------------------------- writes and documents

const MEMBER_STATUS = ['applicant', 'active', 'lapsed', 'resigned'];
const DUES_METHOD = ['payroll', 'direct_debit', 'manual'];
const CASE_KIND = ['personal_grievance', 'unfair_dismissal', 'general_protections', 'dispute', 'claim'];
const CASE_STATUS = ['open', 'raised', 'lodged', 'mediation', 'hearing', 'settled', 'withdrawn', 'closed'];
const ROUND_STATUS = ['preparing', 'initiated', 'bargaining', 'ratifying', 'settled', 'abandoned'];

export const commands = {
  member: {
    about: 'One member: profile, dues, contacts, cases and roles',
    usage: 'member <member no or name>',
    async run(db, [key]) {
      const m = await resolve(db, 'member', key);
      const [profile] = await db.query('select * from member_directory where id = $1', [m.id]);
      return {
        profile,
        payments: await db.query('select paid_on, amount_cents, source, (select code from remittances r where r.id = p.remittance_id) as remittance from dues_payments p where member_id = $1 order by paid_on desc limit 8', [m.id]),
        contacts: await db.query('select contacted_on, kind, body, actor from contacts where member_id = $1 order by contacted_on desc limit 10', [m.id]),
        cases: await db.query('select code, kind, status, next_step, next_step_due from cases where member_id = $1 order by event_on desc', [m.id]),
        roles: await db.query('select role, workplace, elected_on, term_ends_on, trained_on, issue from delegate_roster where member_no = $1', [m.code]),
      };
    },
  },
  'add-member': {
    about: 'Add a member',
    usage: 'add-member --no=U2001 --first= --last= --workplace= [--method=payroll|direct_debit|manual] [--dues=8.50] [--email=] [--phone=] [--occupation=] [--joined=YYYY-MM-DD] [--status=active]',
    async run(db, _p, o) {
      need(o, 'no', 'first', 'last', 'workplace');
      const w = await resolve(db, 'workplace', o.workplace);
      const [row] = await db.query(
        `insert into members (member_no, first_name, last_name, email, phone, workplace_id, occupation, status, joined_on, dues_method, weekly_dues_cents)
         values ($1,$2,$3,$4,$5,$6,$7,$8,coalesce($9::date, current_date),$10,$11) returning id, member_no`,
        [o.no, o.first, o.last, o.email || '', o.phone || '', w.id, o.occupation || '', oneOf(o.status, MEMBER_STATUS, 'status') || 'active', isoDate(o.joined, 'joined'), oneOf(o.method, DUES_METHOD, 'method') || 'payroll', cents(o.dues, 'dues') ?? 0],
      );
      await audit(db, 'member', row.member_no, 'insert', actorOf(o), { workplace: w.code });
      return [row];
    },
  },
  'update-member': {
    about: 'Change a member\'s status, workplace, dues method or weekly dues',
    usage: 'update-member <member> [--status=] [--workplace=] [--method=] [--dues=] [--left=YYYY-MM-DD] [--email=] [--phone=]',
    async run(db, [key], o) {
      const m = await resolve(db, 'member', key);
      const [before] = await db.query('select status, workplace_id, dues_method, weekly_dues_cents, email, phone, left_on from members where id = $1', [m.id]);
      const w = o.workplace ? await resolve(db, 'workplace', o.workplace) : null;
      const [after] = await db.query(
        `update members set status = coalesce($2, status), workplace_id = coalesce($3, workplace_id), dues_method = coalesce($4, dues_method),
           weekly_dues_cents = coalesce($5, weekly_dues_cents), left_on = coalesce($6::date, left_on), email = coalesce($7, email), phone = coalesce($8, phone)
         where id = $1 returning member_no, status, dues_method, weekly_dues_cents, left_on`,
        [m.id, oneOf(o.status, MEMBER_STATUS, 'status') ?? null, w?.id ?? null, oneOf(o.method, DUES_METHOD, 'method') ?? null, cents(o.dues, 'dues'), isoDate(o.left, 'left'), o.email ?? null, o.phone ?? null],
      );
      await audit(db, 'member', m.code, 'update', actorOf(o), { before, after });
      return [after];
    },
  },
  log: {
    about: 'Log a call, visit, email, meeting or note against a member',
    usage: 'log <member> --body="..." [--kind=call|visit|email|meeting|note] [--on=YYYY-MM-DD]',
    async run(db, [key], o) {
      need(o, 'body');
      const m = await resolve(db, 'member', key);
      const [row] = await db.query(
        'insert into contacts (member_id, kind, body, actor, contacted_on) values ($1, $2, $3, $4, coalesce($5::date, current_date)) returning contacted_on, kind, body',
        [m.id, oneOf(o.kind, ['call', 'visit', 'email', 'meeting', 'note'], 'kind') || 'note', o.body, actorOf(o), isoDate(o.on, 'on')],
      );
      await audit(db, 'contact', m.code, 'insert', actorOf(o), row);
      return [{ member: m.name, ...row }];
    },
  },
  'add-payment': {
    about: 'Record a direct debit or manual dues payment',
    usage: 'add-payment <member> --amount=17.00 [--on=YYYY-MM-DD] [--source=direct_debit|manual]',
    async run(db, [key], o) {
      need(o, 'amount');
      const m = await resolve(db, 'member', key);
      const [row] = await db.query(
        'insert into dues_payments (member_id, paid_on, amount_cents, source) values ($1, coalesce($2::date, current_date), $3, $4) returning paid_on, amount_cents, source',
        [m.id, isoDate(o.on, 'on'), cents(o.amount, 'amount'), oneOf(o.source, DUES_METHOD, 'source') || 'manual'],
      );
      await audit(db, 'payment', m.code, 'insert', actorOf(o), row);
      return [{ member: m.name, ...row }];
    },
  },
  'add-case': {
    about: 'Open a member case',
    usage: 'add-case --code=C-301 --member= --kind=personal_grievance|unfair_dismissal|general_protections|dispute|claim --jurisdiction=NZ|AU --event=YYYY-MM-DD [--organiser=] [--summary=] [--sexual-harassment] [--next-step=] [--due=]',
    async run(db, _p, o) {
      need(o, 'code', 'member', 'kind', 'jurisdiction', 'event');
      const m = await resolve(db, 'member', o.member);
      const j = String(o.jurisdiction).toUpperCase();
      if (!['NZ', 'AU'].includes(j)) throw new UsageError('--jurisdiction must be NZ or AU');
      const [row] = await db.query(
        `insert into cases (code, member_id, kind, jurisdiction, organiser, summary, event_on, sexual_harassment, next_step, next_step_due)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning code, kind, jurisdiction, event_on`,
        [o.code, m.id, oneOf(o.kind, CASE_KIND, 'kind'), j, o.organiser || '', o.summary || '', isoDate(o.event, 'event'), o['sexual-harassment'] === true, o['next-step'] || '', isoDate(o.due, 'due')],
      );
      await audit(db, 'case', row.code, 'insert', actorOf(o), { member: m.code });
      const deadline = await db.query('select rule, limit_text, deadline_on, days_left from case_deadlines where code = $1', [row.code]);
      return [{ ...row, member: m.name, deadline_on: deadline[0]?.deadline_on ?? null, days_left: deadline[0]?.days_left ?? null }];
    },
  },
  'update-case': {
    about: 'Move a case on: status, raised or lodged date, determination, challenge, next step',
    usage: 'update-case <case> [--status=] [--raised=] [--determination=] [--challenged=] [--next-step=] [--due=]',
    async run(db, [key], o) {
      const c = await resolve(db, 'case', key);
      const [before] = await db.query('select status, raised_on, determination_on, challenged_on, next_step, next_step_due from cases where id = $1', [c.id]);
      const [after] = await db.query(
        `update cases set status = coalesce($2, status), raised_on = coalesce($3::date, raised_on), determination_on = coalesce($4::date, determination_on),
           challenged_on = coalesce($5::date, challenged_on), next_step = coalesce($6, next_step), next_step_due = coalesce($7::date, next_step_due)
         where id = $1 returning code, status, raised_on, determination_on, challenged_on, next_step, next_step_due`,
        [c.id, oneOf(o.status, CASE_STATUS, 'status') ?? null, isoDate(o.raised, 'raised'), isoDate(o.determination, 'determination'), isoDate(o.challenged, 'challenged'), o['next-step'] ?? null, isoDate(o.due, 'due')],
      );
      await audit(db, 'case', c.code, 'update', actorOf(o), { before, after });
      return [after];
    },
  },
  'add-delegate': {
    about: 'Record an elected delegate or health and safety rep',
    usage: 'add-delegate <member> [--role=delegate|hsr] [--elected=YYYY-MM-DD] [--term-ends=YYYY-MM-DD] [--trained=YYYY-MM-DD]',
    async run(db, [key], o) {
      const m = await resolve(db, 'member', key);
      const [{ workplace_id }] = await db.query('select workplace_id from members where id = $1', [m.id]);
      if (!workplace_id) throw new UsageError(`${m.name} has no workplace`);
      const [row] = await db.query(
        `insert into delegates (member_id, workplace_id, role, elected_on, term_ends_on, trained_on) values ($1,$2,$3,coalesce($4::date, current_date),$5,$6) returning role, elected_on, term_ends_on, trained_on`,
        [m.id, workplace_id, oneOf(o.role, ['delegate', 'hsr'], 'role') || 'delegate', isoDate(o.elected, 'elected'), isoDate(o['term-ends'], 'term-ends'), isoDate(o.trained, 'trained')],
      );
      await audit(db, 'delegate', m.code, 'insert', actorOf(o), row);
      return [{ member: m.name, ...row }];
    },
  },
  'train-delegate': {
    about: 'Record that a delegate or HSR has done their training',
    usage: 'train-delegate <member> [--on=YYYY-MM-DD] [--role=delegate|hsr]',
    async run(db, [key], o) {
      const m = await resolve(db, 'member', key);
      const rows = await db.query(
        `update delegates set trained_on = coalesce($2::date, current_date) where member_id = $1 and stood_down_on is null and ($3::text is null or role = $3) returning role, trained_on`,
        [m.id, isoDate(o.on, 'on'), oneOf(o.role, ['delegate', 'hsr'], 'role') ?? null],
      );
      if (!rows.length) throw new UsageError(`${m.name} holds no current delegate or HSR role`);
      await audit(db, 'delegate', m.code, 'trained', actorOf(o), rows);
      return rows.map((r) => ({ member: m.name, ...r }));
    },
  },
  'start-round': {
    about: 'Start or update the bargaining round for an agreement',
    usage: 'start-round <agreement> --code=B-XYZ-2027 [--status=preparing|initiated|bargaining|ratifying|settled|abandoned] [--initiated=YYYY-MM-DD] [--next-meeting=YYYY-MM-DD] [--claims=]',
    async run(db, [key], o) {
      need(o, 'code');
      const a = await resolve(db, 'agreement', key);
      const [row] = await db.query(
        `insert into bargaining_rounds (code, agreement_id, status, initiated_on, next_meeting_on, claims) values ($1,$2,$3,$4,$5,$6)
         on conflict (code) do update set status = excluded.status, initiated_on = coalesce(excluded.initiated_on, bargaining_rounds.initiated_on),
           next_meeting_on = coalesce(excluded.next_meeting_on, bargaining_rounds.next_meeting_on), claims = case when excluded.claims = '' then bargaining_rounds.claims else excluded.claims end
         returning code, status, initiated_on, next_meeting_on`,
        [o.code, a.id, oneOf(o.status, ROUND_STATUS, 'status') || (o.initiated ? 'initiated' : 'preparing'), isoDate(o.initiated, 'initiated'), isoDate(o['next-meeting'], 'next-meeting'), o.claims || ''],
      );
      await audit(db, 'round', row.code, 'upsert', actorOf(o), row);
      return [{ agreement: a.code, ...row }];
    },
  },
  'add-visit': {
    about: 'Plan a site visit (AU visits are checked for entry notice and permit)',
    usage: 'add-visit --code=V-401 --workplace= --organiser= --on=YYYY-MM-DD [--permit=] [--notice=YYYY-MM-DD] [--purpose=]',
    async run(db, _p, o) {
      need(o, 'code', 'workplace', 'organiser', 'on');
      const w = await resolve(db, 'workplace', o.workplace);
      const p = o.permit ? await resolve(db, 'permit', o.permit) : null;
      await db.query('insert into site_visits (code, workplace_id, organiser, permit_id, visit_on, notice_given_on, purpose) values ($1,$2,$3,$4,$5,$6,$7)',
        [o.code, w.id, o.organiser, p?.id ?? null, isoDate(o.on, 'on'), isoDate(o.notice, 'notice'), o.purpose || '']);
      await audit(db, 'visit', o.code, 'insert', actorOf(o), { workplace: w.code });
      return db.query('select * from visit_checks where code = $1', [o.code]);
    },
  },
  'update-visit': {
    about: 'Record the entry notice, change the permit, or mark a visit done',
    usage: 'update-visit <visit> [--notice=YYYY-MM-DD] [--permit=] [--on=YYYY-MM-DD] [--done]',
    async run(db, [key], o) {
      const v = await resolve(db, 'visit', key);
      const p = o.permit ? await resolve(db, 'permit', o.permit) : null;
      await db.query('update site_visits set notice_given_on = coalesce($2::date, notice_given_on), permit_id = coalesce($3, permit_id), visit_on = coalesce($4::date, visit_on), done = done or $5 where id = $1',
        [v.id, isoDate(o.notice, 'notice'), p?.id ?? null, isoDate(o.on, 'on'), o.done === true]);
      await audit(db, 'visit', v.code, 'update', actorOf(o), { notice: o.notice, permit: p?.code, done: o.done === true });
      return db.query('select code, visit_on, notice_given_on, done from site_visits where id = $1', [v.id]);
    },
  },
  'add-permit': {
    about: 'Record an organiser\'s entry permit',
    usage: 'add-permit --no= --holder= --issued=YYYY-MM-DD --expires=YYYY-MM-DD',
    async run(db, _p, o) {
      need(o, 'no', 'holder', 'issued', 'expires');
      const [row] = await db.query('insert into entry_permits (permit_no, holder, issued_on, expires_on) values ($1,$2,$3,$4) returning permit_no, holder, expires_on',
        [o.no, o.holder, isoDate(o.issued, 'issued'), isoDate(o.expires, 'expires')]);
      await audit(db, 'permit', row.permit_no, 'insert', actorOf(o), row);
      return [row];
    },
  },
  import: {
    about: 'Import members from a UnionWare (or any) member CSV, or an employer\'s remittance file',
    usage: 'import unionware <members.csv> [--mapping=map.json] [--country=NZ|AU] [--dry-run]\n         import remittance <file.csv> --employer= --code= --from=YYYY-MM-DD --to=YYYY-MM-DD [--received=YYYY-MM-DD] [--dry-run]',
    async run(db, [kind, file], o) {
      if (!['unionware', 'members', 'remittance'].includes(kind)) throw new UsageError('import unionware <file> or import remittance <file>');
      if (!file || !fs.existsSync(file)) throw new UsageError(`file not found: ${file}`);
      const bytes = fs.readFileSync(file);
      const fingerprint = createHash('sha256').update(bytes).digest('hex');
      const rows = parseCsv(bytes.toString('utf8'));
      const seen = await db.query('select filename, created_at from import_batches where fingerprint = $1', [fingerprint]);
      if (seen.length) return [{ result: 'skipped', reason: `identical file already imported as ${seen[0].filename}`, rows: rows.length }];
      const dry = o['dry-run'] === true;
      await db.exec('BEGIN');
      try {
        const result = kind === 'remittance' ? await importRemittance(db, rows, o) : await importMembers(db, rows, o);
        if (dry) {
          await db.exec('ROLLBACK');
          return [{ result: 'dry run, nothing saved', rows: rows.length, ...result }];
        }
        await db.query('insert into import_batches (source, filename, fingerprint, row_count, actor) values ($1,$2,$3,$4,$5)', [kind, path.basename(file), fingerprint, rows.length, actorOf(o)]);
        await audit(db, 'import', path.basename(file), kind, actorOf(o), result);
        await db.exec('COMMIT');
        return [{ result: 'imported', rows: rows.length, ...result }];
      } catch (error) {
        await db.exec('ROLLBACK');
        throw error;
      }
    },
  },
  export: {
    about: 'Write every table to CSV and JSON in a new folder',
    usage: 'export [--out=exports/2026-11-16]',
    async run(db, _p, o) {
      const out = path.resolve(REPO_ROOT, typeof o.out === 'string' ? o.out : path.join('exports', new Date().toISOString().replace(/[:.]/g, '-')));
      if (fs.existsSync(out) && fs.readdirSync(out).length) throw new UsageError(`${out} is not empty`);
      fs.mkdirSync(out, { recursive: true, mode: 0o700 });
      const tables = ['employers', 'workplaces', 'members', 'delegates', 'remittances', 'dues_payments', 'contacts', 'cases', 'agreements', 'agreement_workplaces', 'bargaining_rounds', 'entry_permits', 'site_visits', 'import_batches', 'audit_log'];
      const manifest = [];
      for (const t of tables) {
        const rows = await db.query(`select * from ${t}`);
        fs.writeFileSync(path.join(out, `${t}.json`), JSON.stringify(rows, null, 2));
        fs.writeFileSync(path.join(out, `${t}.csv`), toCsv(rows));
        manifest.push({ table: t, rows: rows.length });
      }
      fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ exported_at: new Date().toISOString(), tables: manifest }, null, 2));
      return manifest.map((m) => ({ ...m, folder: path.relative(REPO_ROOT, out) }));
    },
  },
  'weekly-review': {
    about: 'Write the Monday review: deadlines, money, organising, bargaining',
    usage: 'weekly-review',
    async run(db) {
      const q = (name) => db.query(reads[name].sql);
      const results = [];
      for (const name of ['compliance', 'arrears', 'remittances', 'remittance-gaps', 'bargaining', 'quiet', 'organiser-load']) results.push(await q(name));
      const [findings, arrears, remit, gaps, bargaining, quiet, load] = results;
      const owed = arrears.reduce((s, r) => s + Number(r.owed_estimate_cents || 0), 0);
      const short = remit.filter((r) => r.difference_cents < 0);
      const lines = [
        `# Weekly review, ${new Date().toISOString().slice(0, 10)}`,
        '',
        '## Deadlines and rules',
        ...(findings.length ? findings.map((f) => `- ${f.rule} ${f.record}: ${f.detail}${f.due_on ? `, due ${f.due_on}` : ''}${f.days_left !== null && f.days_left !== undefined ? ` (${f.days_left} days)` : ''}. ${f.source}.`) : ['- Nothing due or breached.']),
        '',
        '## Dues',
        `- ${arrears.length} members in arrears, about ${(owed / 100).toFixed(2)} unpaid between them.`,
        ...arrears.map((a) => `  - ${a.name} (${a.member_no}, ${a.workplace}): ${a.days_unpaid} days, ${a.dues_method}.`),
        ...short.map((r) => `- ${r.employer_name} remittance ${r.remittance} is ${(-r.difference_cents / 100).toFixed(2)} short of expected dues.`),
        ...gaps.map((g) => `  - Missing from ${g.remittance}: ${g.name} (${g.member_no}).`),
        ...remit.filter((r) => r.days_since_period > 35).map((r) => `- ${r.employer_name} has sent no remittance for ${r.days_since_period} days.`),
        '',
        '## Bargaining',
        ...bargaining.map((b) => `- ${b.name}: expires ${b.expires_on} (${b.days_to_expiry} days), ${b.round ? `round ${b.round} ${b.round_status}` : 'no round started'}${b.next_meeting_on ? `, next meeting ${b.next_meeting_on}` : ''}.`),
        `- ${quiet.length} members at bargaining sites have not heard from us in 90 days.`,
        '',
        '## Organisers',
        ...load.map((l) => `- ${l.organiser}: ${l.open_cases} open cases (${l.overdue_steps} overdue steps), ${l.planned_visits} visits planned, ${l.workplaces} workplaces.`),
        '',
        'Draft only. Check every deadline against the case file before acting on it.',
      ];
      const file = writeDraft('weekly-review', lines.join('\n') + '\n');
      return [{ draft: path.relative(REPO_ROOT, file), findings: findings.length, arrears: arrears.length, short_remittances: short.length, quiet_members: quiet.length }];
    },
  },
  'draft-arrears': {
    about: 'Draft a friendly dues reminder to a member in arrears',
    usage: 'draft-arrears <member>',
    async run(db, [key]) {
      const m = await resolve(db, 'member', key);
      const [a] = await db.query('select * from arrears where member_no = $1', [m.code]);
      if (!a) throw new UsageError(`${m.name} is not in arrears`);
      const [p] = await db.query('select first_name, email from members where id = $1', [m.id]);
      const body = `To: ${p.email}\nSubject: Your union membership\n\nKia ora ${p.first_name},\n\nOur records show no dues from you since ${a.last_paid_on || 'you joined'}. ${a.dues_method === 'payroll' ? 'Your dues come out of your pay, so this may be a payroll error. We are checking with your employer.' : a.dues_method === 'direct_debit' ? 'Your direct debit looks to have stopped. A new bank account or card is the usual reason.' : 'You pay your dues directly, and the last payment we have is from that date.'}\n\nIf anything has changed, reply to this email or call your organiser and we will sort it out together. Your membership matters most when you need it.\n\nNga mihi,\nThe union office\n`;
      return [{ draft: path.relative(REPO_ROOT, writeDraft(`arrears-${m.code}`, body)) }];
    },
  },
  'draft-remittance-query': {
    about: 'Draft an email to an employer\'s payroll about a short or late remittance',
    usage: 'draft-remittance-query <employer>',
    async run(db, [key]) {
      const e = await resolve(db, 'employer', key);
      const [r] = await db.query('select * from remittance_check where employer = $1', [e.code]);
      const gaps = await db.query('select * from remittance_gaps where employer = $1', [e.code]);
      if (!r) throw new UsageError(`no remittance on file for ${e.name}`);
      const body = [
        `To: ${e.payroll_email}`,
        `Subject: Union fee deductions, period ${r.period_start} to ${r.period_end}`,
        '',
        `Hi ${e.payroll_contact || 'there'},`,
        '',
        r.days_since_period > 35
          ? `The last union fee remittance we have from ${e.name} covers ${r.period_start} to ${r.period_end}. We have nothing since. Could you send the deductions and the schedule for the periods after that?`
          : `Thanks for the remittance for ${r.period_start} to ${r.period_end}. It came to ${(r.received_cents / 100).toFixed(2)} against ${(r.expected_cents / 100).toFixed(2)} we expected from the members who have authorised deductions.`,
        ...(gaps.length ? ['', 'These members were not on the schedule:', ...gaps.map((g) => `- ${g.name} (member ${g.member_no}, ${g.workplace})`), '', 'Could you check whether their deductions have stopped, and add them back from the next pay run if they are still employed?'] : []),
        '',
        'Thanks,',
        'The union office',
      ].join('\n');
      return [{ draft: path.relative(REPO_ROOT, writeDraft(`remittance-${e.code}`, body + '\n')), members_missing: gaps.length }];
    },
  },
  'draft-entry-notice': {
    about: 'Draft the entry notice for a planned AU site visit',
    usage: 'draft-entry-notice <visit>',
    async run(db, [key]) {
      const v = await resolve(db, 'visit', key);
      const [d] = await db.query(
        `select v.code, v.visit_on, v.purpose, v.organiser, w.name as workplace, e.name as employer, e.country, p.permit_no, p.expires_on
         from site_visits v join workplaces w on w.id = v.workplace_id join employers e on e.id = w.employer_id left join entry_permits p on p.id = v.permit_id where v.id = $1`, [v.id]);
      if (d.country !== 'AU') throw new UsageError('entry notices here follow the Fair Work Act; this visit is not in Australia');
      const warn = !d.permit_no ? 'WARNING: no entry permit recorded for this visit.' : d.expires_on < d.visit_on ? `WARNING: permit ${d.permit_no} expires ${d.expires_on}, before the visit.` : '';
      const body = [
        warn,
        `Entry notice: ${d.workplace} (${d.employer})`,
        '',
        `Permit holder: ${d.organiser}${d.permit_no ? `, entry permit ${d.permit_no}` : ''}`,
        `Date of entry: ${d.visit_on}, during working hours`,
        `Purpose: ${d.purpose}`,
        '',
        'Give this notice at least 24 hours and no more than 14 days before the entry (Fair Work Act 2009 s 487(3)).',
        'Check the content against the current Fair Work Commission entry notice form before it goes. This draft does not replace it.',
      ].filter((l, i) => i > 0 || l).join('\n');
      return [{ draft: path.relative(REPO_ROOT, writeDraft(`entry-notice-${d.code}`, body + '\n')), warning: warn || null }];
    },
  },
  'draft-grievance': {
    about: 'Draft the letter raising a personal grievance with the employer (NZ)',
    usage: 'draft-grievance <case>',
    async run(db, [key]) {
      const c = await resolve(db, 'case', key);
      const [d] = await db.query(
        `select c.code, c.kind, c.jurisdiction, c.summary, c.event_on, c.organiser, m.first_name || ' ' || m.last_name as member, e.name as employer, e.payroll_contact
         from cases c join members m on m.id = c.member_id left join workplaces w on w.id = m.workplace_id left join employers e on e.id = w.employer_id where c.id = $1`, [c.id]);
      if (d.jurisdiction !== 'NZ' || d.kind !== 'personal_grievance') throw new UsageError('draft-grievance is for NZ personal grievances');
      const [dl] = await db.query('select deadline_on, days_left from case_deadlines where code = $1', [d.code]);
      const body = [
        `To: ${d.employer}`,
        `Subject: Personal grievance, ${d.member}`,
        '',
        `I act for ${d.member}, a member of the union.`,
        '',
        `${d.member} raises a personal grievance under the Employment Relations Act 2000 about events on or about ${d.event_on}: ${d.summary}`,
        '',
        '[Organiser: set out what happened, why it was unjustified, and the effect on the member.]',
        '',
        '[Organiser: set out the remedies sought.]',
        '',
        'We invite you to meet to resolve this. Please contact me to arrange a time.',
        '',
        d.organiser,
        '',
        dl ? `Office note, delete before sending: the 90-day period runs to ${dl.deadline_on} (${dl.days_left} days left).` : '',
      ].join('\n');
      return [{ draft: path.relative(REPO_ROOT, writeDraft(`grievance-${d.code}`, body + '\n')), deadline_on: dl?.deadline_on ?? null }];
    },
  },
  help: {
    about: 'This list',
    usage: 'help',
    async run() {
      return [...Object.entries(reads).map(([name, r]) => ({ command: name, does: r.about })), ...Object.entries(commands).map(([name, c]) => ({ command: name, does: c.about }))];
    },
  },
};

export const commandNames = [...Object.keys(reads), ...Object.keys(commands)];

// ---------------------------------------------------------------- import helpers

const DEFAULT_MAP = {
  member_no: ['Member Number', 'Member No', 'Member ID', 'MemberID', 'Member #', 'member_no'],
  first_name: ['First Name', 'Given Name', 'FirstName', 'first_name'],
  last_name: ['Last Name', 'Surname', 'Family Name', 'LastName', 'last_name'],
  email: ['Email', 'Email Address', 'Primary Email', 'email'],
  phone: ['Mobile', 'Phone', 'Cell Phone', 'Mobile Phone', 'phone'],
  employer: ['Employer', 'Employer Name', 'employer'],
  workplace: ['Worksite', 'Work Site', 'Workplace', 'Site', 'Location', 'workplace'],
  occupation: ['Classification', 'Job Title', 'Occupation', 'Position', 'occupation'],
  status: ['Status', 'Member Status', 'status'],
  joined_on: ['Join Date', 'Date Joined', 'Initiation Date', 'Start Date', 'joined_on'],
  dues_method: ['Payment Method', 'Dues Method', 'Pay Method', 'dues_method'],
  weekly_dues: ['Weekly Dues', 'Dues Amount', 'Dues', 'weekly_dues'],
};

function normDate(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // day first, as NZ and AU write it
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  throw new UsageError(`cannot read the date "${s}"; use YYYY-MM-DD or DD/MM/YYYY`);
}
function normStatus(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!s || /active|financial|good standing|current/.test(s)) return 'active';
  if (/applic|pending|new/.test(s)) return 'applicant';
  if (/resign|retir|deceas|left/.test(s)) return 'resigned';
  if (/lapse|unfinancial|arrear|suspend/.test(s)) return 'lapsed';
  throw new UsageError(`unknown member status "${v}"; map it with --mapping`);
}
function normMethod(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!s || /payroll|deduct|check.?off/.test(s)) return 'payroll';
  if (/debit|card|bank|eft|recurring/.test(s)) return 'direct_debit';
  return 'manual';
}
const slugCode = (s, n = 24) => String(s).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, n).replace(/-$/, '') || 'UNKNOWN';
// "Riverbend Te Awamutu" at "Riverbend Dairy Ltd" becomes "TE-AWAMUTU" in the workplace code.
function siteLabel(site, employer) {
  const first = employer.split(/\s+/)[0].toLowerCase();
  return site.toLowerCase().startsWith(first + ' ') ? site.slice(first.length + 1) : site;
}
async function uniqueCode(db, tableName, base) {
  for (let i = 1; ; i++) {
    const code = i === 1 ? base : `${base}-${i}`;
    if (!(await db.query(`select 1 from ${tableName} where code = $1`, [code])).length) return code;
  }
}

async function importMembers(db, rows, o) {
  let map = DEFAULT_MAP;
  if (typeof o.mapping === 'string') {
    const custom = JSON.parse(fs.readFileSync(o.mapping, 'utf8'));
    map = { ...DEFAULT_MAP, ...Object.fromEntries(Object.entries(custom).map(([k, v]) => [k, Array.isArray(v) ? v : [v]])) };
  }
  const country = String(o.country || 'NZ').toUpperCase();
  if (!['NZ', 'AU'].includes(country)) throw new UsageError('--country must be NZ or AU');
  const get = (row, field) => pick(row, ...map[field]);
  const counts = { members_added: 0, members_updated: 0, employers_added: 0, workplaces_added: 0 };
  for (const [i, row] of rows.entries()) {
    const no = get(row, 'member_no');
    const first = get(row, 'first_name');
    const last = get(row, 'last_name');
    if (!no || !first || !last) throw new UsageError(`row ${i + 2}: member number, first name and last name are required`);
    let workplaceId = null;
    const employerName = get(row, 'employer');
    if (employerName) {
      let [emp] = await db.query('select id, code from employers where lower(name) = lower($1)', [employerName]);
      if (!emp) {
        [emp] = await db.query('insert into employers (code, name, country) values ($1, $2, $3) returning id, code', [await uniqueCode(db, 'employers', slugCode(employerName, 12)), employerName, country]);
        counts.employers_added++;
      }
      const siteName = get(row, 'workplace') || employerName;
      let [wp] = await db.query('select id from workplaces where employer_id = $1 and lower(name) = lower($2)', [emp.id, siteName]);
      if (!wp) {
        [wp] = await db.query('insert into workplaces (code, name, employer_id) values ($1, $2, $3) returning id', [await uniqueCode(db, 'workplaces', `${emp.code}-${siteName === employerName ? 'MAIN' : slugCode(siteLabel(siteName, employerName), 16)}`), siteName, emp.id]);
        counts.workplaces_added++;
      }
      workplaceId = wp.id;
    }
    const values = [no, first, last, get(row, 'email'), get(row, 'phone'), workplaceId, get(row, 'occupation'), normStatus(get(row, 'status')), normDate(get(row, 'joined_on')), normMethod(get(row, 'dues_method')), cents(get(row, 'weekly_dues') || '0', 'weekly dues'), JSON.stringify(row)];
    const [r] = await db.query(
      `insert into members (member_no, first_name, last_name, email, phone, workplace_id, occupation, status, joined_on, dues_method, weekly_dues_cents, external_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       on conflict (member_no) do update set first_name = excluded.first_name, last_name = excluded.last_name, email = excluded.email, phone = excluded.phone,
         workplace_id = coalesce(excluded.workplace_id, members.workplace_id), occupation = excluded.occupation, status = excluded.status,
         joined_on = coalesce(excluded.joined_on, members.joined_on), dues_method = excluded.dues_method, weekly_dues_cents = excluded.weekly_dues_cents, external_id = excluded.external_id
       returning (xmax = 0) as inserted`, values);
    r.inserted ? counts.members_added++ : counts.members_updated++;
  }
  return counts;
}

async function importRemittance(db, rows, o) {
  need(o, 'employer', 'code', 'from', 'to');
  const e = await resolve(db, 'employer', o.employer);
  const [rem] = await db.query('insert into remittances (code, employer_id, period_start, period_end, received_on, amount_cents) values ($1,$2,$3,$4,coalesce($5::date, current_date),0) returning id, period_end',
    [o.code, e.id, isoDate(o.from, 'from'), isoDate(o.to, 'to'), isoDate(o.received, 'received')]);
  const unknown = [];
  let total = 0;
  for (const [i, row] of rows.entries()) {
    const no = pick(row, 'Member Number', 'Member No', 'Member ID', 'member_no', 'Employee Union No');
    const amount = cents(pick(row, 'Amount', 'Deduction', 'Union Fees', 'amount'), `amount on row ${i + 2}`);
    if (!no || amount === null) throw new UsageError(`row ${i + 2}: member number and amount are required`);
    const [m] = await db.query('select id from members where lower(member_no) = lower($1)', [no]);
    if (!m) { unknown.push(no); continue; }
    await db.query('insert into dues_payments (member_id, remittance_id, paid_on, amount_cents, source) values ($1,$2,$3,$4,\'payroll\')', [m.id, rem.id, rem.period_end, amount]);
    total += amount;
  }
  await db.query('update remittances set amount_cents = $2 where id = $1', [rem.id, total]);
  return { remittance: o.code, matched: rows.length - unknown.length, unknown_members: unknown.join(' ') || null, total_cents: total };
}

function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v instanceof Date ? v.toISOString() : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------- run

export async function run(db, argv) {
  const { pos, opts } = parseArgs(argv);
  const [name = 'help', ...rest] = pos;
  if (reads[name]) {
    const r = reads[name];
    return db.query(r.sql, r.params ? r.params(opts) : []);
  }
  if (commands[name]) return commands[name].run(db, rest, opts);
  throw new UsageError(`unknown command "${name}". Try: help`);
}

function render(name, result, asJson) {
  if (asJson) return JSON.stringify(result, null, 2);
  if (name === 'help') {
    return 'Union Office for Claude Code\n\n  npm run union -- <command> [options] [--json]\n\n' + printRows(result) + '\n\nUsage for a command: npm run union -- usage <command>';
  }
  if (Array.isArray(result)) return printRows(result);
  return Object.entries(result).map(([k, v]) => `${k.toUpperCase()}\n${Array.isArray(v) ? printRows(v) : printRows([v])}`).join('\n\n');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const args = argv.filter((a) => a !== '--json');
  if (args[0] === 'usage') {
    const c = commands[args[1]];
    console.log(c ? `npm run union -- ${c.usage}` : reads[args[1]] ? `npm run union -- ${args[1]} [--json]   ${reads[args[1]].about}` : 'unknown command');
    process.exit(c || reads[args[1]] ? 0 : 1);
  }
  const db = await getDb();
  try {
    const result = await run(db, args);
    console.log(render(args.find((a) => !a.startsWith('--')) || 'help', result, asJson));
  } catch (error) {
    console.error(error instanceof UsageError ? `union: ${error.message}` : error.stack || error.message);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}
