-- Demo data for Union Office for Claude Code. Every name, employer and record is fictional.
-- Dates are relative to today so the demo always has something due, late or stuck.
-- Idempotent: a second run does nothing. Never run this against a working database.
do $$
begin
  if exists (select 1 from employers where code = 'SCH') then
    return;
  end if;

  insert into employers (code, name, country, payroll_contact, payroll_email) values
    ('SCH', 'Southern Care Homes Ltd', 'NZ', 'Fiona Grant', 'payroll@southerncare.example'),
    ('KFP', 'Kauri Food Processing Ltd', 'NZ', 'Raj Patel', 'wages@kaurifood.example'),
    ('CL',  'Coastline Logistics Pty Ltd', 'AU', 'Megan Doyle', 'payroll@coastline.example'),
    ('BAC', 'Bayview Aged Care Pty Ltd', 'AU', 'Steve Li', 'accounts@bayviewcare.example');

  insert into workplaces (code, name, employer_id, region, headcount, organiser)
  select v.code, v.name, e.id, v.region, v.headcount, v.organiser
  from (values
    ('SCH-ROT', 'Southern Care Rotorua', 'SCH', 'Bay of Plenty', 8, 'Aroha Ngata'),
    ('SCH-TGA', 'Southern Care Tauranga', 'SCH', 'Bay of Plenty', 12, 'Aroha Ngata'),
    ('KFP-HAM', 'Kauri Food Hamilton plant', 'KFP', 'Waikato', 9, 'Hine Rawiri'),
    ('CL-PTB',  'Coastline Port Botany depot', 'CL', 'Sydney', 6, 'Dana Kowalski'),
    ('CL-LAV',  'Coastline Laverton warehouse', 'CL', 'Melbourne', 10, 'Dana Kowalski'),
    ('BAC-NEW', 'Bayview Newcastle', 'BAC', 'Hunter', 5, 'Priya Nair')
  ) as v(code, name, employer, region, headcount, organiser)
  join employers e on e.code = v.employer;

  insert into members (member_no, first_name, last_name, email, phone, workplace_id, occupation, status, joined_on, left_on, dues_method, weekly_dues_cents)
  select v.no, v.first, v.last, lower(v.first) || '.' || lower(replace(replace(v.last, '''', ''), ' ', '')) || '@member.example', v.phone,
         w.id, v.occupation, v.status, case when v.joined is null then null else current_date - v.joined end,
         case when v.left_days is null then null else current_date - v.left_days end, v.method, v.dues
  from (values
    ('U1001', 'Mereana', 'Hohepa', '021 555 0101', 'SCH-ROT', 'Healthcare assistant', 'active', 2100, null::int, 'payroll', 850),
    ('U1002', 'Tom', 'Bellamy', '021 555 0102', 'SCH-ROT', 'Cook', 'active', 900, null, 'payroll', 850),
    ('U1003', 'Losa', 'Faleolo', '021 555 0103', 'SCH-ROT', 'Healthcare assistant', 'active', 400, null, 'direct_debit', 850),
    ('U1004', 'Grace', 'Whitu', '021 555 0104', 'SCH-ROT', 'Registered nurse', 'active', 1300, null, 'payroll', 850),
    ('U1005', 'Ben', 'Carter', '021 555 0105', 'SCH-ROT', 'Cleaner', 'lapsed', 1500, 120, 'payroll', 850),
    ('U1006', 'Ana', 'Tupou', '021 555 0106', 'SCH-TGA', 'Healthcare assistant', 'active', 700, null, 'payroll', 850),
    ('U1007', 'Rangi', 'Paewai', '021 555 0107', 'SCH-TGA', 'Laundry hand', 'active', 600, null, 'direct_debit', 850),
    ('U1008', 'Wiremu', 'Te Ao', '021 555 0108', 'KFP-HAM', 'Process worker', 'active', 1800, null, 'payroll', 1100),
    ('U1009', 'Priya', 'Sharma', '021 555 0109', 'KFP-HAM', 'Quality technician', 'active', 1000, null, 'payroll', 1100),
    ('U1010', 'Jack', 'Moana', '021 555 0110', 'KFP-HAM', 'Forklift driver', 'active', 800, null, 'payroll', 1100),
    ('U1011', 'Sione', 'Lolo', '021 555 0111', 'KFP-HAM', 'Process worker', 'active', 650, null, 'payroll', 1100),
    ('U1012', 'Kate', 'Duncan', '021 555 0112', 'KFP-HAM', 'Packer', 'active', 500, null, 'manual', 1100),
    ('U1013', 'Ngaio', 'Rewi', '021 555 0113', 'KFP-HAM', 'Process worker', 'applicant', null, null, 'payroll', 1100),
    ('U1014', 'Daniel', 'Russo', '0400 555 114', 'CL-PTB', 'Truck driver', 'active', 1600, null, 'payroll', 1250),
    ('U1015', 'Mai', 'Nguyen', '0400 555 115', 'CL-PTB', 'Storeperson', 'active', 1100, null, 'payroll', 1250),
    ('U1016', 'Harjit', 'Singh', '0400 555 116', 'CL-PTB', 'Truck driver', 'active', 950, null, 'payroll', 1250),
    ('U1017', 'Chloe', 'Barker', '0400 555 117', 'CL-PTB', 'Dispatcher', 'active', 300, null, 'direct_debit', 1250),
    ('U1018', 'Ahmed', 'Khalil', '0400 555 118', 'CL-LAV', 'Storeperson', 'active', 1200, null, 'payroll', 1250),
    ('U1019', 'Liam', 'O''Brien', '0400 555 119', 'CL-LAV', 'Forklift driver', 'active', 750, null, 'payroll', 1250),
    ('U1020', 'Rosa', 'Martinez', '0400 555 120', 'BAC-NEW', 'Personal care worker', 'active', 1400, null, 'payroll', 950),
    ('U1021', 'Kylie', 'Brennan', '0400 555 121', 'BAC-NEW', 'Personal care worker', 'active', 1000, null, 'payroll', 950),
    ('U1022', 'Tane', 'Hawkins', '0400 555 122', 'BAC-NEW', 'Kitchen hand', 'active', 800, null, 'payroll', 950),
    ('U1023', 'Joy', 'Mensah', '0400 555 123', 'BAC-NEW', 'Enrolled nurse', 'resigned', 1200, 60, 'payroll', 950)
  ) as v(no, first, last, phone, workplace, occupation, status, joined, left_days, method, dues)
  join workplaces w on w.code = v.workplace;

  insert into delegates (member_id, workplace_id, role, elected_on, term_ends_on, trained_on)
  select m.id, w.id, v.role, current_date - v.elected, current_date + v.term, case when v.trained is null then null else current_date - v.trained end
  from (values
    ('U1001', 'SCH-ROT', 'delegate', 430, 300, 400),
    ('U1008', 'KFP-HAM', 'delegate', 200, 530, null::int),
    ('U1009', 'KFP-HAM', 'hsr', 500, 230, 470),
    ('U1014', 'CL-PTB', 'delegate', 740, -10, 700),
    ('U1020', 'BAC-NEW', 'delegate', 700, 30, 650)
  ) as v(no, workplace, role, elected, term, trained)
  join members m on m.member_no = v.no
  join workplaces w on w.code = v.workplace;

  -- Employer remittances: two four-week periods each. Bayview's latest is seven weeks old.
  insert into remittances (code, employer_id, period_start, period_end, received_on, amount_cents)
  select v.code, e.id, current_date - v.ps, current_date - v.pe, current_date - v.rec, 0
  from (values
    ('SCH-R1', 'SCH', 62, 35, 31), ('SCH-R2', 'SCH', 34, 7, 3),
    ('KFP-R1', 'KFP', 62, 35, 30), ('KFP-R2', 'KFP', 34, 7, 2),
    ('CL-R1',  'CL',  62, 35, 32), ('CL-R2',  'CL',  34, 7, 4),
    ('BAC-R1', 'BAC', 104, 77, 73), ('BAC-R2', 'BAC', 76, 49, 45)
  ) as v(code, employer, ps, pe, rec)
  join employers e on e.code = v.employer;

  -- Payroll dues inside each remittance. Kauri's latest file leaves off Jack Moana and Sione Lolo.
  insert into dues_payments (member_id, remittance_id, paid_on, amount_cents, source)
  select m.id, r.id, r.period_end, m.weekly_dues_cents * 4, 'payroll'
  from remittances r
  join workplaces w on w.employer_id = r.employer_id
  join members m on m.workplace_id = w.id and m.dues_method = 'payroll' and m.status in ('active', 'lapsed', 'resigned')
                and m.joined_on <= r.period_start
                and (m.left_on is null or m.left_on > r.period_end)
  where not (r.code = 'KFP-R2' and m.member_no in ('U1010', 'U1011'));

  update remittances r set amount_cents = coalesce((select sum(amount_cents) from dues_payments p where p.remittance_id = r.id), 0);

  -- Direct debit and manual payers. Rangi Paewai's debit stopped ten weeks ago; Kate Duncan last paid at the counter 100 days ago.
  insert into dues_payments (member_id, paid_on, amount_cents, source)
  select m.id, current_date - v.days, m.weekly_dues_cents * v.weeks, v.source
  from (values
    ('U1003', 10, 2, 'direct_debit'), ('U1003', 24, 2, 'direct_debit'), ('U1003', 38, 2, 'direct_debit'),
    ('U1017', 5, 2, 'direct_debit'), ('U1017', 19, 2, 'direct_debit'),
    ('U1007', 70, 2, 'direct_debit'), ('U1007', 84, 2, 'direct_debit'),
    ('U1012', 100, 13, 'manual')
  ) as v(no, days, weeks, source)
  join members m on m.member_no = v.no;

  insert into contacts (member_id, kind, body, actor, contacted_on)
  select m.id, v.kind, v.body, v.actor, current_date - v.days
  from (values
    ('U1004', 'meeting', 'Met Grace about the roster change and the warning letter. She wants to raise a grievance.', 'Aroha Ngata', 12),
    ('U1002', 'call', 'Mediation date confirmed. Tom has his timeline written up.', 'Aroha Ngata', 6),
    ('U1014', 'visit', 'Depot meeting on the log of claims. Daniel will stand again as delegate.', 'Dana Kowalski', 5),
    ('U1015', 'call', 'Mai asked about the overtime claim in the new agreement.', 'Dana Kowalski', 20),
    ('U1016', 'meeting', 'Harjit dismissed. Collected the termination letter and payslips.', 'Dana Kowalski', 14),
    ('U1018', 'call', 'Conciliation conference papers sent to Ahmed.', 'Dana Kowalski', 10),
    ('U1020', 'visit', 'Rosa wants a members meeting before bargaining starts.', 'Priya Nair', 10),
    ('U1008', 'call', 'Wiremu booked onto delegate training. Asked about the Authority determination.', 'Hine Rawiri', 25),
    ('U1017', 'email', 'Welcome pack sent.', 'Dana Kowalski', 250)
  ) as v(no, kind, body, actor, days)
  join members m on m.member_no = v.no;

  insert into cases (code, member_id, kind, jurisdiction, organiser, summary, event_on, sexual_harassment, raised_on, determination_on, status, next_step, next_step_due)
  select v.code, m.id, v.kind, v.juris, v.organiser, v.summary, current_date - v.event, v.sh,
         case when v.raised is null then null else current_date - v.raised end,
         case when v.det is null then null else current_date - v.det end,
         v.status, v.next_step, case when v.due is null then null else current_date + v.due end
  from (values
    ('C-201', 'U1004', 'personal_grievance', 'NZ', 'Aroha Ngata', 'Unjustified disadvantage: roster cut after a written warning.', 80, false, null::int, null::int, 'open', 'Draft the grievance letter to the employer', 3),
    ('C-202', 'U1006', 'personal_grievance', 'NZ', 'Aroha Ngata', 'Sexual harassment by a contractor; member considering her options.', 200, true, null, null, 'open', 'Support person meeting', 14),
    ('C-203', 'U1016', 'unfair_dismissal', 'AU', 'Dana Kowalski', 'Dismissed after a disputed vehicle incident.', 15, false, null, null, 'open', 'Lodge the application with the Fair Work Commission', 2),
    ('C-204', 'U1010', 'dispute', 'NZ', 'Hine Rawiri', 'Allowance dispute. Authority found for the employer.', 300, false, 250, 20, 'hearing', 'Decide whether to challenge in the Employment Court', 4),
    ('C-205', 'U1018', 'general_protections', 'AU', 'Dana Kowalski', 'Dismissed after raising a safety complaint.', 40, false, 10, null, 'lodged', 'Prepare for the conciliation conference', -2),
    ('C-206', 'U1002', 'personal_grievance', 'NZ', 'Aroha Ngata', 'Unjustified disadvantage: hours reduced.', 60, false, 30, null, 'mediation', 'Mediation with the employer', 5),
    ('C-207', 'U1021', 'claim', 'AU', 'Priya Nair', 'Underpaid penalty rates; back pay recovered.', 150, false, 120, null, 'closed', '', null)
  ) as v(code, no, kind, juris, organiser, summary, event, sh, raised, det, status, next_step, due)
  join members m on m.member_no = v.no;

  insert into agreements (code, name, jurisdiction, multi_employer, starts_on, expires_on, status) values
    ('A-SCH', 'Southern Care Homes Collective Agreement', 'NZ', false, current_date - 1000, current_date + 40, 'in_force'),
    ('A-KFP', 'Kauri Food Processing Collective Agreement', 'NZ', false, current_date - 800, current_date + 400, 'in_force'),
    ('A-CL',  'Coastline Logistics Enterprise Agreement', 'AU', false, current_date - 900, current_date + 60, 'in_force'),
    ('A-BAC', 'Bayview Aged Care Enterprise Agreement', 'AU', false, current_date - 1500, current_date - 100, 'in_force');

  insert into agreement_workplaces (agreement_id, workplace_id)
  select a.id, w.id
  from (values ('A-SCH', 'SCH-ROT'), ('A-SCH', 'SCH-TGA'), ('A-KFP', 'KFP-HAM'), ('A-CL', 'CL-PTB'), ('A-CL', 'CL-LAV'), ('A-BAC', 'BAC-NEW')) as v(agreement, workplace)
  join agreements a on a.code = v.agreement
  join workplaces w on w.code = v.workplace;

  insert into bargaining_rounds (code, agreement_id, status, initiated_on, next_meeting_on, claims)
  select v.code, a.id, v.status, case when v.init is null then null else current_date - v.init end,
         case when v.meet is null then null else current_date + v.meet end, v.claims
  from (values
    ('B-CL-2026', 'A-CL', 'bargaining', 30, 7, '5% a year, rostering notice of 14 days, no forced overtime.'),
    ('B-BAC-2026', 'A-BAC', 'preparing', null::int, null::int, 'Staffing ratios, paid training time, penalty rates restored.')
  ) as v(code, agreement, status, init, meet, claims)
  join agreements a on a.code = v.agreement;

  insert into entry_permits (permit_no, holder, issued_on, expires_on) values
    ('EP-24-1187', 'Dana Kowalski', current_date - 1000, current_date + 95),
    ('EP-23-0942', 'Priya Nair', current_date - 1100, current_date - 5);

  insert into site_visits (code, workplace_id, organiser, permit_id, visit_on, notice_given_on, purpose, done)
  select v.code, w.id, v.organiser, p.id, current_date + v.visit,
         case when v.notice is null then null else current_date + v.notice end, v.purpose, v.done
  from (values
    ('V-301', 'CL-PTB', 'Dana Kowalski', 'EP-24-1187', 3, -2, 'Discussions with members and potential members', false),
    ('V-302', 'CL-LAV', 'Dana Kowalski', 'EP-24-1187', 2, null::int, 'Bargaining report-back in the lunch room', false),
    ('V-303', 'BAC-NEW', 'Priya Nair', 'EP-23-0942', 4, 0, 'Members meeting before bargaining', false),
    ('V-304', 'SCH-TGA', 'Aroha Ngata', null, 6, null, 'Recruit a delegate for the Tauranga site', false),
    ('V-305', 'KFP-HAM', 'Hine Rawiri', null, -9, null, 'Health and safety walk with the HSR', true)
  ) as v(code, workplace, organiser, permit, visit, notice, purpose, done)
  join workplaces w on w.code = v.workplace
  left join entry_permits p on p.permit_no = v.permit;
end
$$;
