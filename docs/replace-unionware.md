# Moving off UnionWare

UnionWare is licensed software installed for each union, sold through a demo and quote. Your records belong to you; the work is getting them out in a shape this repo reads. Most unions do it in a day.

## 1. Export from UnionWare

Ask your UnionWare administrator, or UnionWare support, for these as CSV:

1. **Members**: member number, first and last name, email, mobile, employer, worksite, classification, status, join date, payment method, weekly dues.
2. **Dues remittances** for the last few periods: one file per employer per period, member number and amount.
3. **Cases** (grievances, disputes, claims) with member number, type, dates and status, if you want case history across.
4. **Contracts**: agreement name, start and expiry date, employers and worksites covered.

UnionWare lists "data migration" as a professional service and supports batch dues imports and file exchange with employers, so a CSV out is a normal request.

## 2. Import members

```bash
npm run union -- import unionware members.csv --dry-run
npm run union -- import unionware members.csv --country=AU
```

The dry run shows how many members, employers and workplaces it would create, and saves nothing. The real run is one transaction: a bad row rolls back the whole file. Running the same file twice is skipped by fingerprint. A member number that already exists is updated, not duplicated.

Column names it understands out of the box:

| Field | Column names read |
|---|---|
| Member number | Member Number, Member No, Member ID, MemberID, Member # |
| First name | First Name, Given Name |
| Last name | Last Name, Surname, Family Name |
| Email | Email, Email Address, Primary Email |
| Phone | Mobile, Phone, Cell Phone, Mobile Phone |
| Employer | Employer, Employer Name |
| Workplace | Worksite, Work Site, Workplace, Site, Location |
| Occupation | Classification, Job Title, Occupation, Position |
| Status | Status, Member Status (Active, Financial, Pending, Lapsed, Unfinancial, Resigned, Retired) |
| Join date | Join Date, Date Joined, Initiation Date, Start Date (YYYY-MM-DD or DD/MM/YYYY) |
| Dues method | Payment Method, Dues Method, Pay Method (payroll deduction, direct debit, anything else is manual) |
| Weekly dues | Weekly Dues, Dues Amount, Dues (dollars) |

If your export uses other names, write a mapping file and pass it in:

```json
{ "member_no": "Union ID", "workplace": "Branch Site", "weekly_dues": "Fee Per Week" }
```

```bash
npm run union -- import unionware members.csv --mapping=mapping.json --dry-run
```

Or ask Claude Code: "map this export and dry-run it". It reads the header row and writes the mapping for you.

The original row is kept on each member (`external_id`, as JSON), so nothing in the source file is lost.

## 3. Import remittances

```bash
npm run union -- import remittance kauri-oct.csv --employer=KFP --code=KFP-2026-10 --from=2026-10-01 --to=2026-10-28
```

Member numbers it cannot match are listed back to you, not dropped silently.

## 4. Cases, agreements and delegates

Add open cases with `add-case` (Claude Code can loop over a CSV and do it for you), agreements with `/customise` or a short SQL insert, and delegates with `add-delegate`. Closed history can stay in the export folder, or be loaded into `contacts` as notes.

## What does not carry over

- Online dues payment (UPay) and the member portal (MemberLink). This repo takes no payments and has no member log-in. Keep your payment provider and import its payment file, or Enterprise DNA builds the portal into your version.
- Dispatch and job matching.
- Email and SMS sending. Drafts land in `drafts/` for a person to send from your own mail.
- Call management and mapping add-ons.

Run `npm run union -- attention` after the import. Anything wrong with the data usually shows up there first.
