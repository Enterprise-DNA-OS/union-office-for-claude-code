# Compliance rules

`npm run union -- compliance` checks the records against the rules below. Each check lives in one SQL view in `supabase/migrations/0001_union_office.sql`, so the CLI, the weekly review and the rendered views share one definition.

These are the time limits and terms a union office in New Zealand or Australia tracks every week. A clean check means the recorded dates pass the rule. It is not legal advice, and it is only as good as the dates entered: an organiser confirms the event date on every case.

Sources:
- Employment Relations Act 2000 (NZ): https://www.legislation.govt.nz/act/public/2000/0024/latest/whole.html
- Fair Work Act 2009 (Cth): https://www.legislation.gov.au/C2009A00028/latest/text

| Rule | What it checks | Source | Breach in the data | View |
|---|---|---|---|---|
| R01 | An NZ personal grievance is raised with the employer within 90 days of the action, or within 12 months where it involves sexual harassment. | Employment Relations Act 2000 s 114 (12 months for sexual harassment since the 2023 amendment) | `cases` row, NZ, `personal_grievance`, `raised_on` empty, 30 days or less left | `case_deadlines` |
| R02 | An AU unfair dismissal or general protections dismissal application is lodged within 21 days of the dismissal taking effect. | Fair Work Act 2009 s 394(2) and s 366(1) | `cases` row, AU, `unfair_dismissal` or `general_protections`, `raised_on` empty, 30 days or less left | `case_deadlines` |
| R03 | A challenge to an Employment Relations Authority determination goes to the Employment Court within 28 days. | Employment Relations Act 2000 s 179(2) | NZ case with `determination_on` set, `challenged_on` empty, 30 days or less left | `case_deadlines` |
| R04 | The union may initiate bargaining for a renewing NZ collective agreement no earlier than 60 days before it expires (120 days for a multi-employer agreement). The check flags an agreement whose window opens within 30 days, or is open, with no initiated round. | Employment Relations Act 2000 s 41 | `agreements` row in force, `window_opens_on` within 30 days or past, no round with `initiated_on` | `bargaining_status` |
| R05 | A collective agreement's term fits the legal maximum: 3 years for NZ, a nominal expiry no more than 4 years after approval for an AU enterprise agreement. Usually a data entry error, but worth catching before bargaining is planned off it. | Employment Relations Act 2000 s 52; Fair Work Act 2009 s 186(5) | `expires_on` later than `starts_on` plus 3 (NZ) or 4 (AU) years | `compliance_findings` |
| R06 | An AU permit holder gives an entry notice at least 24 hours and no more than 14 days before entering, and holds a permit current on the day. | Fair Work Act 2009 s 487(3) (notice), s 516 (permit expiry) | AU `site_visits` row not done with no permit, a permit expiring before the visit, no notice, notice under 1 day or over 14 days ahead | `visit_checks` |

## What the checks do not cover

- The content of an entry notice. Check it against the current Fair Work Commission form.
- Whether a grievance letter raises the grievance properly. The organiser or a lawyer decides that.
- Union rules on arrears, membership and delegates. Those differ by union; add them with `/customise`, citing the rule book clause here.
- NZ access to workplaces under s 20 of the Employment Relations Act. It has no notice period in days, so there is no date check.

## Adding a rule

Ask Claude Code with `/customise`, for example "flag any delegate whose term ends within 30 days, per rule 14.3 of our rule book". It writes a new migration that extends the view, adds a row to this table with the source, and adds a test.
