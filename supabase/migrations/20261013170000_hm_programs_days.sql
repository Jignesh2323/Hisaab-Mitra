-- Collection kitne din/program ka hai. 1 = ek hi program.
alter table public.hm_programs add column if not exists days integer not null default 1;
alter table public.hm_programs drop constraint if exists hm_programs_days_check;
alter table public.hm_programs add constraint hm_programs_days_check check (days between 1 and 31);
