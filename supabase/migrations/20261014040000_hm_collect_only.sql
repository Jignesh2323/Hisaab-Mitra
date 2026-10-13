-- Sirf collection wala program: kharcha / hisaab nahi, bas kisne kitna diya
alter table public.hm_programs add column if not exists collect_only boolean not null default false;
