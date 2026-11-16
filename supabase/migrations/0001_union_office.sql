-- Union Office for Claude Code: the schema.
-- Members, workplaces, delegates, dues and employer remittances, member cases,
-- collective agreements, bargaining rounds, entry permits and site visits.
-- Plain Postgres. Runs the same on PGlite (embedded) and any Postgres 14+.
-- Dates are calendar dates. Money is whole cents in bigint.

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create table employers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  country text not null check (country in ('NZ', 'AU')),
  payroll_contact text not null default '',
  payroll_email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workplaces (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  employer_id uuid not null references employers(id),
  region text not null default '',
  headcount int not null default 0 check (headcount >= 0),
  organiser text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table members (
  id uuid primary key default gen_random_uuid(),
  member_no text not null unique,
  first_name text not null,
  last_name text not null,
  email text not null default '',
  phone text not null default '',
  workplace_id uuid references workplaces(id),
  occupation text not null default '',
  status text not null default 'active' check (status in ('applicant', 'active', 'lapsed', 'resigned')),
  joined_on date,
  left_on date,
  dues_method text not null default 'payroll' check (dues_method in ('payroll', 'direct_debit', 'manual')),
  weekly_dues_cents bigint not null default 0 check (weekly_dues_cents >= 0),
  external_id text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index members_workplace on members(workplace_id);

create table delegates (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id),
  workplace_id uuid not null references workplaces(id),
  role text not null default 'delegate' check (role in ('delegate', 'hsr')),
  elected_on date not null,
  term_ends_on date,
  trained_on date,
  stood_down_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, workplace_id, role)
);

create table remittances (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  employer_id uuid not null references employers(id),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  received_on date not null,
  amount_cents bigint not null check (amount_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table dues_payments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id),
  remittance_id uuid references remittances(id),
  paid_on date not null,
  amount_cents bigint not null check (amount_cents >= 0),
  source text not null check (source in ('payroll', 'direct_debit', 'manual')),
  created_at timestamptz not null default now()
);
create index dues_payments_member on dues_payments(member_id, paid_on);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id),
  kind text not null default 'note' check (kind in ('call', 'visit', 'email', 'meeting', 'note')),
  body text not null,
  actor text not null default '',
  contacted_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index contacts_member on contacts(member_id, contacted_on);

-- A case is one member's matter. event_on is the date of the action complained of
-- (for a dismissal, the date it took effect). raised_on is when the grievance was raised
-- with the employer (NZ) or the application lodged (AU).
create table cases (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  member_id uuid not null references members(id),
  kind text not null check (kind in ('personal_grievance', 'unfair_dismissal', 'general_protections', 'dispute', 'claim')),
  jurisdiction text not null check (jurisdiction in ('NZ', 'AU')),
  organiser text not null default '',
  summary text not null default '',
  event_on date not null,
  sexual_harassment boolean not null default false,
  raised_on date,
  determination_on date,
  challenged_on date,
  status text not null default 'open' check (status in ('open', 'raised', 'lodged', 'mediation', 'hearing', 'settled', 'withdrawn', 'closed')),
  next_step text not null default '',
  next_step_due date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table agreements (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  jurisdiction text not null check (jurisdiction in ('NZ', 'AU')),
  multi_employer boolean not null default false,
  starts_on date not null,
  expires_on date not null check (expires_on >= starts_on),
  status text not null default 'in_force' check (status in ('in_force', 'expired', 'superseded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table agreement_workplaces (
  agreement_id uuid not null references agreements(id),
  workplace_id uuid not null references workplaces(id),
  primary key (agreement_id, workplace_id)
);

create table bargaining_rounds (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  agreement_id uuid not null references agreements(id),
  status text not null default 'preparing' check (status in ('preparing', 'initiated', 'bargaining', 'ratifying', 'settled', 'abandoned')),
  initiated_on date,
  next_meeting_on date,
  claims text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table entry_permits (
  id uuid primary key default gen_random_uuid(),
  permit_no text not null unique,
  holder text not null,
  issued_on date not null,
  expires_on date not null check (expires_on > issued_on),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table site_visits (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  workplace_id uuid not null references workplaces(id),
  organiser text not null,
  permit_id uuid references entry_permits(id),
  visit_on date not null,
  notice_given_on date,
  purpose text not null default '',
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table import_batches (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  filename text not null,
  fingerprint text not null unique,
  row_count int not null,
  actor text not null default '',
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigserial primary key,
  entity text not null,
  record_id text not null,
  operation text not null,
  actor text not null default '',
  detail jsonb,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['employers','workplaces','members','delegates','remittances','cases','agreements','bargaining_rounds','entry_permits','site_visits'] loop
    execute format('create trigger %I before update on %I for each row execute function touch_updated_at()', t || '_touch', t);
  end loop;
  foreach t in array array['employers','workplaces','members','delegates','remittances','dues_payments','contacts','cases','agreements','agreement_workplaces','bargaining_rounds','entry_permits','site_visits','import_batches','audit_log'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from public', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------- views

create view member_directory as
select m.id, m.member_no, m.first_name || ' ' || m.last_name as name, m.status, m.dues_method,
       m.weekly_dues_cents, w.code as workplace, e.code as employer, e.country, m.joined_on,
       (select max(paid_on) from dues_payments p where p.member_id = m.id) as last_paid_on,
       (select max(contacted_on) from contacts c where c.member_id = m.id) as last_contact_on
from members m
left join workplaces w on w.id = m.workplace_id
left join employers e on e.id = w.employer_id;

-- Active members with no dues in six weeks (and in the union longer than that).
create view arrears as
select member_no, name, workplace, employer, dues_method, weekly_dues_cents, last_paid_on,
       current_date - coalesce(last_paid_on, joined_on) as days_unpaid,
       (((current_date - coalesce(last_paid_on, joined_on)) / 7) * weekly_dues_cents)::bigint as owed_estimate_cents
from member_directory
where status = 'active' and weekly_dues_cents > 0
  and current_date - coalesce(last_paid_on, joined_on) > 42;

-- Each employer's latest remittance against what its payroll members should have paid.
create view remittance_check as
with latest as (
  select distinct on (employer_id) * from remittances order by employer_id, period_end desc, received_on desc
),
expected as (
  select l.id as remittance_id,
         count(m.id) as payroll_members,
         coalesce(sum(m.weekly_dues_cents * ((l.period_end - l.period_start + 1) / 7)), 0)::bigint as expected_cents
  from latest l
  join workplaces w on w.employer_id = l.employer_id
  join members m on m.workplace_id = w.id and m.status = 'active' and m.dues_method = 'payroll'
                and (m.joined_on is null or m.joined_on <= l.period_start)
  group by l.id
)
select e.code as employer, e.name as employer_name, l.code as remittance, l.period_start, l.period_end, l.received_on,
       coalesce(x.payroll_members, 0) as payroll_members,
       (select count(distinct p.member_id) from dues_payments p where p.remittance_id = l.id) as members_on_file,
       coalesce(x.expected_cents, 0)::bigint as expected_cents, l.amount_cents as received_cents,
       (l.amount_cents - coalesce(x.expected_cents, 0))::bigint as difference_cents,
       current_date - l.period_end as days_since_period
from latest l
join employers e on e.id = l.employer_id
left join expected x on x.remittance_id = l.id;

-- Payroll members missing from their employer's latest remittance.
create view remittance_gaps as
with latest as (
  select distinct on (employer_id) * from remittances order by employer_id, period_end desc, received_on desc
)
select e.code as employer, l.code as remittance, m.member_no, m.first_name || ' ' || m.last_name as name,
       w.code as workplace, m.weekly_dues_cents
from latest l
join employers e on e.id = l.employer_id
join workplaces w on w.employer_id = l.employer_id
join members m on m.workplace_id = w.id and m.status = 'active' and m.dues_method = 'payroll'
              and (m.joined_on is null or m.joined_on <= l.period_start)
where not exists (select 1 from dues_payments p where p.remittance_id = l.id and p.member_id = m.id);

create view density as
select w.code as workplace, w.name, e.code as employer, w.region, w.organiser, w.headcount,
       count(m.id) filter (where m.status = 'active') as members,
       case when w.headcount > 0 then round(100.0 * count(m.id) filter (where m.status = 'active') / w.headcount, 1)::float8 end as density_pct,
       (select count(*) from delegates d where d.workplace_id = w.id and d.role = 'delegate' and d.stood_down_on is null) as delegates,
       (select count(*) from delegates d where d.workplace_id = w.id and d.role = 'hsr' and d.stood_down_on is null) as hsrs
from workplaces w
join employers e on e.id = w.employer_id
left join members m on m.workplace_id = w.id
group by w.id, e.code;

create view delegate_roster as
select d.id, m.member_no, m.first_name || ' ' || m.last_name as name, w.code as workplace, d.role,
       d.elected_on, d.term_ends_on, d.trained_on,
       case
         when d.trained_on is null then 'not trained'
         when d.term_ends_on is not null and d.term_ends_on < current_date then 'term ended'
         when d.term_ends_on is not null and d.term_ends_on <= current_date + 60 then 'term ends soon'
         else 'ok'
       end as issue
from delegates d
join members m on m.id = d.member_id
join workplaces w on w.id = d.workplace_id
where d.stood_down_on is null;

-- Statutory time limits on member cases.
-- NZ personal grievance: raise within 90 days (12 months for sexual harassment). ERA 2000 s 114.
-- AU unfair dismissal and general protections dismissal: lodge within 21 days. FW Act s 394(2), s 366(1).
-- NZ challenge to an Employment Relations Authority determination: 28 days. ERA 2000 s 179(2).
create view case_deadlines as
select c.code, m.member_no, m.first_name || ' ' || m.last_name as member, c.kind, c.jurisdiction, c.organiser, c.status,
       x.rule, x.limit_text, x.deadline_on, x.deadline_on - current_date as days_left
from cases c
join members m on m.id = c.member_id
cross join lateral (
  select 'R01'::text as rule,
         case when c.sexual_harassment then 'raise within 12 months' else 'raise within 90 days' end as limit_text,
         case when c.sexual_harassment then (c.event_on + interval '12 months')::date else c.event_on + 90 end as deadline_on
  where c.jurisdiction = 'NZ' and c.kind = 'personal_grievance' and c.raised_on is null
  union all
  select 'R02', 'lodge within 21 days', c.event_on + 21
  where c.jurisdiction = 'AU' and c.kind in ('unfair_dismissal', 'general_protections') and c.raised_on is null
  union all
  select 'R03', 'challenge within 28 days', c.determination_on + 28
  where c.jurisdiction = 'NZ' and c.determination_on is not null and c.challenged_on is null
) x
where c.status not in ('settled', 'withdrawn', 'closed');

create view case_load as
select c.code, m.first_name || ' ' || m.last_name as member, c.kind, c.jurisdiction, c.organiser, c.status,
       c.next_step, c.next_step_due, c.next_step_due < current_date as overdue
from cases c join members m on m.id = c.member_id
where c.status not in ('settled', 'withdrawn', 'closed');

-- Collective agreements and where bargaining stands.
-- NZ: a union may initiate bargaining no earlier than 60 days before expiry (120 for a multi-employer agreement). ERA 2000 s 41.
create view bargaining_status as
select a.code, a.name, a.jurisdiction, a.multi_employer, a.starts_on, a.expires_on, a.status,
       a.expires_on - current_date as days_to_expiry,
       case when a.jurisdiction = 'NZ' then a.expires_on - case when a.multi_employer then 120 else 60 end end as window_opens_on,
       r.code as round, r.status as round_status, r.initiated_on, r.next_meeting_on,
       (select count(*) from agreement_workplaces aw join members m on m.workplace_id = aw.workplace_id and m.status = 'active'
         where aw.agreement_id = a.id) as members_covered
from agreements a
left join lateral (
  select * from bargaining_rounds b where b.agreement_id = a.id and b.status <> 'abandoned' order by b.created_at desc limit 1
) r on true
where a.status <> 'superseded';

-- Right of entry checks for visits not yet done. AU: notice at least 24 hours and no more than
-- 14 days before entry (FW Act s 487(3)); the permit must be current on the day (FW Act s 516).
create view visit_checks as
select v.code, w.code as workplace, e.country, v.organiser, v.visit_on, v.notice_given_on, p.permit_no, p.expires_on as permit_expires_on,
       case
         when e.country <> 'AU' then 'ok'
         when p.id is null then 'no entry permit recorded'
         when p.expires_on < v.visit_on then 'permit expired before the visit'
         when v.notice_given_on is null then 'no entry notice recorded'
         when v.visit_on - v.notice_given_on < 1 then 'notice under 24 hours'
         when v.visit_on - v.notice_given_on > 14 then 'notice more than 14 days ahead'
         else 'ok'
       end as issue
from site_visits v
join workplaces w on w.id = v.workplace_id
join employers e on e.id = w.employer_id
left join entry_permits p on p.id = v.permit_id
where not v.done;

create view compliance_findings as
select rule, code as record, member || ': ' || limit_text as detail, deadline_on as due_on, days_left,
       case rule when 'R01' then 'Employment Relations Act 2000 (NZ) s 114'
                 when 'R02' then 'Fair Work Act 2009 (Cth) s 394(2), s 366(1)'
                 else 'Employment Relations Act 2000 (NZ) s 179(2)' end as source
from case_deadlines
where days_left <= 30
union all
select 'R04', code, name || ': ' || coalesce('round ' || round_status, 'no bargaining round started'), window_opens_on, window_opens_on - current_date,
       'Employment Relations Act 2000 (NZ) s 41'
from bargaining_status
where jurisdiction = 'NZ' and status = 'in_force' and window_opens_on <= current_date + 30
  and (round is null or initiated_on is null)
union all
select 'R05', code, name || ': term longer than ' || case jurisdiction when 'NZ' then '3 years' else '4 years' end, expires_on, null,
       case jurisdiction when 'NZ' then 'Employment Relations Act 2000 (NZ) s 52' else 'Fair Work Act 2009 (Cth) s 186(5)' end
from agreements
where status = 'in_force'
  and expires_on > (starts_on + case jurisdiction when 'NZ' then interval '3 years' else interval '4 years' end)::date
union all
select 'R06', code, workplace || ': ' || issue, visit_on, visit_on - current_date, 'Fair Work Act 2009 (Cth) s 487(3), s 516'
from visit_checks
where issue <> 'ok';

-- Members at a workplace in active bargaining who have not heard from the union in 90 days.
create view quiet_members as
select d.member_no, d.name, d.workplace, d.last_contact_on, current_date - coalesce(d.last_contact_on, d.joined_on) as days_quiet
from member_directory d
where d.status = 'active'
  and (d.last_contact_on is null or d.last_contact_on < current_date - 90)
  and exists (
    select 1 from bargaining_status b
    join agreement_workplaces aw on aw.agreement_id = (select id from agreements where code = b.code)
    join workplaces w on w.id = aw.workplace_id
    where w.code = d.workplace and b.round_status in ('preparing', 'initiated', 'bargaining', 'ratifying')
  );
