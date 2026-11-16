<h1 align="center">Union Office for Claude Code</h1>

<p align="center">
  <strong>The open-source union office that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your UnionWare data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=unionware">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/unionware?utm_source=github&utm_medium=readme&utm_campaign=unionware">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-unionware">Instead of UnionWare</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Union Office for Claude Code runs a union's office: members, workplaces, delegates and health and safety reps, dues and employer remittances, member cases, collective agreements, bargaining rounds, entry permits and site visits. It is a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask in plain language.

UnionWare publishes no price. It is sold through a demo and a quote, as installed software in Enterprise Core and Enterprise Plus tiers with web modules and add-ons on top, and data migration as a paid service ([unionware.com](https://www.unionware.com/products), read 16 November 2026).

It is for unions and staff associations in New Zealand and Australia with a handful of organisers and a few hundred to a few thousand members: the office that chases grievance time limits, reconciles employer remittances, keeps delegates trained and gets ready for bargaining. The NZ Employment Relations Act and the Australian Fair Work Act time limits are built in.

Want the same thing with a member portal, online payments or a web front end? That is a customisation, and it is what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=unionware).

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your members' records sit in plain Postgres tables you own. Any tool can read them. No export fee, no lock-in.
- No seats, no tiers, no modules. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for what a screen still gives you.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node 20 or later):

```bash
git clone https://github.com/Enterprise-DNA-OS/union-office-for-claude-code.git
cd union-office-for-claude-code
npm install
npm test
npm run demo
npm run union -- attention
```

Then open the folder in Claude Code and type `/attention`. The demo is four fictional employers in New Zealand and Australia, with a grievance ten days from its 90-day limit, an unfair dismissal six days from the 21-day limit, an employer that has stopped remitting dues, another that left two members off its schedule, an agreement inside its bargaining window with no round started, and an entry permit that expires before the visit.

Seed only an empty demo database. On Postgres, `npm run seed -- --demo-database` is required on purpose.

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-seat fee. Union membership is sensitive personal information under the Privacy Act 2020 (NZ) and the Privacy Act 1988 (Cth): set up controlled access and backups before shared use.

## The weekly rituals

| Command | What it does |
|---|---|
| `/attention` | Everything due, late, short or stuck in one list: statutory deadlines, arrears, short remittances, overdue case steps, delegate gaps |
| `/weekly-review` | Writes the Monday review to `drafts/`: deadlines, dues, bargaining, organiser load |
| `/compliance` | Checks the records against six NZ and AU rules, each cited in [docs/compliance.md](docs/compliance.md) |
| `/case-deadlines` | Every statutory time limit still running on an open case, nearest first |
| `/remittances` | Each employer's latest remittance against the deductions members authorised |
| `/remittance-gaps` | Payroll members missing from their employer's latest schedule |
| `/arrears` | Active members with no dues in six weeks, split by payroll, direct debit and manual |
| `/bargaining` | Agreements, expiry, when the NZ bargaining window opens, and where each round stands |
| `/density` | Members against headcount at every workplace, with delegates and HSRs |
| `/no-delegate` | Workplaces with members and no delegate |
| `/delegates` | Delegate and HSR roster: untrained, term ended, term ending |
| `/quiet` | Members at bargaining sites nobody has spoken to in 90 days |
| `/visits` | Planned site visits with AU entry notice and permit checks |
| `/permits` | Entry permits and when they expire |
| `/organiser-load` | Open cases, overdue steps, visits and workplaces per organiser |
| `/cases` | Open cases with next step and due date |
| `/member` | One member: profile, dues, contacts, cases and roles |
| `/members` | Members by workplace, employer or status |

Records and paperwork:

| Command | What it does |
|---|---|
| `/log` | Log a call, visit, email, meeting or note against a member |
| `/add-member`, `/update-member` | Add a member, or change status, workplace or dues |
| `/add-payment` | Record a direct debit or manual payment |
| `/add-case`, `/update-case` | Open a case (its time limit is worked out on entry) and move it on |
| `/add-delegate`, `/train-delegate` | Record an election and training |
| `/start-round` | Start or update a bargaining round |
| `/add-visit`, `/update-visit`, `/add-permit` | Plan visits, record notice, record permits |
| `/draft-grievance` | NZ personal grievance letter skeleton, with the 90-day date as an office note |
| `/draft-entry-notice` | AU entry notice content, with a warning if the permit or timing is wrong |
| `/draft-remittance-query` | Email to an employer's payroll about a short or late remittance |
| `/draft-arrears` | Friendly dues reminder to a member |
| `/import` | Members from a UnionWare export, or an employer's remittance file |
| `/export` | Every table to CSV and JSON with a manifest |
| `/customise` | Add a field, rename a status, change a rule, in plain language |
| `/new-view` | Add a read-only page to `npm run view` |
| `/audit`, `/imports`, `/help` | What changed and who changed it, what was imported, every command |

Every CLI command takes `--json`. Members match on member number or any part of the name; an ambiguous name lists the candidates and exits 1. Nothing sends: every letter and email is written to `drafts/` for a person to send.

`npm run view` renders three read-only pages (the week, dues, organising) in your colours from `brand.json`. `npm run docs` renders a case file per open case, a remittance statement per employer and a bargaining brief per agreement.

## Ten questions UnionWare's screens do not answer for you

Each is one command against your own records today.

1. Which grievances run out of time this month, and how many days are left on each? `case-deadlines`
2. Which employer's last remittance is short of the deductions members authorised, and by how much? `remittances`
3. Which members did that employer leave off the schedule? `remittance-gaps`
4. Which employer has gone quiet and sent no file for five weeks? `remittances`
5. Which NZ agreements are inside their bargaining window with no round initiated? `compliance`
6. Which planned AU visits have no entry notice, or a permit that lapses before the day? `visits`
7. Which workplaces have members but no delegate, and what is density there? `no-delegate`, `density`
8. Which delegates have never been trained, or are serving past the end of their term? `delegates`
9. Which members at a site in bargaining has nobody spoken to in 90 days? `quiet`
10. Which organiser is carrying the most open cases and overdue steps this week? `organiser-load`

## Your first hour: ten things to ask for

1. "Put our union's name and colours in brand.json."
2. "Run the attention list on the demo and explain each row."
3. "Show me the grievance deadlines and draft the letter for the closest one."
4. "Which employer is short on dues, and draft the email to their payroll."
5. "Clear the demo and set up our employers and worksites."
6. "Map our UnionWare member export and dry-run it."
7. "Import last month's remittance from each employer."
8. "Add our open cases from this spreadsheet."
9. "Add our rule book's arrears rule to the compliance check."
10. "Set up a shared database with backups for the office."

## Instead of UnionWare

Export members and remittances from UnionWare as CSV and run `npm run union -- import unionware members.csv --dry-run`. Column names UnionWare-style exports use are read out of the box; anything else takes a one-line mapping. The full guide, including what does not carry over, is [docs/replace-unionware.md](docs/replace-unionware.md).

## Architecture

```
union-office-for-claude-code/
  CLAUDE.md                 how the operator wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/                  the CLI the commands drive
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema
  supabase/seed.sql         demo data
  docs/                     compliance rules, the UnionWare guide, why no front end
  views.json, documents.json the read-only pages and the paperwork
```

## Built for coding agents

The database, CLI and command recipes work with Claude Code, Codex, OpenCode or Cursor. Ask your coding agent for a new command and have it implement and test the change against the same records.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs Union Office for Claude Code for your business, migrates your UnionWare data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=unionware)
- Read more: [enterprisedna.co/omni/instead-of/unionware](https://enterprisedna.co/omni/instead-of/unionware?utm_source=github&utm_medium=readme&utm_campaign=unionware)

## License

MIT. Copyright (c) 2026 Enterprise DNA.
