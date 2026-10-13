-- HisaabMitra database setup
-- GitHub integration ise apne aap apply karta hai. Dobara chalne par bhi safe hai.

create or replace function public.hm_code() returns text language sql stable set search_path = '' as $$
  select coalesce((current_setting('request.headers', true)::json ->> 'x-hm-code'), '')
$$;

create table if not exists public.hm_programs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (char_length(code) >= 6),
  name text not null,
  type text not null default 'flat' check (type in ('flat','friends')),
  fixed_amount numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.hm_members (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.hm_programs(id) on delete cascade,
  name text not null default '',
  flat_no text not null default '',
  paid numeric not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists hm_members_program_id_idx on public.hm_members(program_id);

create table if not exists public.hm_expenses (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.hm_programs(id) on delete cascade,
  title text not null,
  amount numeric not null default 0,
  paid_by uuid references public.hm_members(id) on delete set null,
  photo_url text,
  spent_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists hm_expenses_program_id_idx on public.hm_expenses(program_id);
create index if not exists hm_expenses_paid_by_idx on public.hm_expenses(paid_by);

alter table public.hm_programs enable row level security;
alter table public.hm_members enable row level security;
alter table public.hm_expenses enable row level security;

-- Program sirf usi ko dikhega jiske paas uska share code hai
drop policy if exists hm_prog_sel on public.hm_programs;
create policy hm_prog_sel on public.hm_programs for select to anon, authenticated using (code = public.hm_code());
drop policy if exists hm_prog_ins on public.hm_programs;
create policy hm_prog_ins on public.hm_programs for insert to anon, authenticated with check (code = public.hm_code());
drop policy if exists hm_prog_upd on public.hm_programs;
create policy hm_prog_upd on public.hm_programs for update to anon, authenticated using (code = public.hm_code()) with check (code = public.hm_code());
drop policy if exists hm_prog_del on public.hm_programs;
create policy hm_prog_del on public.hm_programs for delete to anon, authenticated using (code = public.hm_code());

drop policy if exists hm_mem_all on public.hm_members;
create policy hm_mem_all on public.hm_members for all to anon, authenticated
  using (program_id in (select id from public.hm_programs where code = public.hm_code()))
  with check (program_id in (select id from public.hm_programs where code = public.hm_code()));

drop policy if exists hm_exp_all on public.hm_expenses;
create policy hm_exp_all on public.hm_expenses for all to anon, authenticated
  using (program_id in (select id from public.hm_programs where code = public.hm_code()))
  with check (program_id in (select id from public.hm_programs where code = public.hm_code()));

-- Bill photo ke liye storage
insert into storage.buckets (id, name, public) values ('hm-bills', 'hm-bills', true) on conflict do nothing;
drop policy if exists hm_bills_ins on storage.objects;
create policy hm_bills_ins on storage.objects for insert to anon, authenticated with check (bucket_id = 'hm-bills');
