# Union Office for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Union:** [YOUR UNION]
- **Operator:** [YOUR NAME], [your role]
- **What matters most:** [the one or two outcomes you care about]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a record, read its full history first.
3. **Plain language.** Short sentences. No filler. Numbers in tables.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a customer waits for a yes in this session.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| What needs doing this week? | `/attention` |
| The Monday review | `/weekly-review` |
| Are we inside every time limit? | `/compliance`, `/case-deadlines` |
| Did employer X pay the dues? Who is missing? | `/remittances`, `/remittance-gaps`, then `/draft-remittance-query` |
| Who has stopped paying? | `/arrears`, then `/draft-arrears` |
| Where are we with bargaining? | `/bargaining`, `/quiet` |
| Where are we weak? | `/density`, `/no-delegate`, `/delegates` |
| Visits this week, entry notices, permits | `/visits`, `/permits`, `/draft-entry-notice` |
| Tell me about a member | `/member` |
| Log a call or meeting | `/log` |
| New member, change of status or dues | `/add-member`, `/update-member`, `/add-payment` |
| New case, case moved on | `/add-case`, `/update-case`, `/draft-grievance` |
| Delegate elected or trained | `/add-delegate`, `/train-delegate` |
| Bargaining started | `/start-round` |
| Bring in UnionWare data or a remittance file | `/import` |
| Get everything out | `/export` |
| Change a field, status or rule | `/customise` |
| A new page to look at | `/new-view` |
| Who changed what | `/audit` |

If an ask fits nothing here, run the CLI directly (`npm run union -- help`) and then propose a new command for it.

## Hard rules

- Never send email or messages from here. Draft to `drafts/`, a person sends.
- Never delete records without an explicit yes in this session. Prefer marking closed or archived.
- Never invent a record. If a name is ambiguous, list the candidates and ask.
- The database is the source of truth. If the answer is not in it, say so.

## Union rules for this office

- Member records are sensitive personal information. Never paste them anywhere outside this folder and the database.
- A time limit is a date on a record. Before telling anyone a limit has passed, say the event date the record holds and ask the organiser to confirm it.
- Compliance checks cite the Act. Nothing here is legal advice; anything about whether to file goes to the organiser or the union's lawyer.

## Where things live

- `scripts/` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `docs/` the thesis and the guide for moving off UnionWare.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/unionware
