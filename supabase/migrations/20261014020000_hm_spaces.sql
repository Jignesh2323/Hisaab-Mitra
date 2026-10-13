-- Space (workspace): har vyakti / society ka alag data. Space code hi chaabi hai (header x-hm-space).
-- Private program pehle jaisa: sirf apne code (x-hm-code) se.
alter table public.hm_programs add column if not exists space text;

-- Purane programs ek naye gupt space me (code yahan likha nahi hai, database me random banta hai)
with s as (select upper(substr(md5(random()::text || clock_timestamp()::text), 1, 12)) as c)
update public.hm_programs set space = s.c from s where public.hm_programs.space is null;

create index if not exists hm_programs_space_idx on public.hm_programs(space);

create or replace function public.hm_space() returns text language sql stable set search_path = '' as $$
  select coalesce((current_setting('request.headers', true)::json ->> 'x-hm-space'), '')
$$;

drop policy if exists hm_prog_sel on public.hm_programs;
drop policy if exists hm_prog_ins on public.hm_programs;
drop policy if exists hm_prog_upd on public.hm_programs;
drop policy if exists hm_prog_del on public.hm_programs;
drop policy if exists hm_mem_all on public.hm_members;
drop policy if exists hm_exp_all on public.hm_expenses;

-- Dikhe: apne space ka public program, ya jiska code (link) hai
create policy hm_prog_sel on public.hm_programs for select to anon, authenticated
  using ((not is_private and space <> '' and space = public.hm_space()) or code = public.hm_code());
create policy hm_prog_ins on public.hm_programs for insert to anon, authenticated
  with check (space <> '' and space = public.hm_space() and (not is_private or code = public.hm_code()));
create policy hm_prog_upd on public.hm_programs for update to anon, authenticated
  using ((not is_private and space <> '' and space = public.hm_space()) or code = public.hm_code())
  with check ((not is_private and space <> '' and space = public.hm_space()) or code = public.hm_code());
create policy hm_prog_del on public.hm_programs for delete to anon, authenticated
  using ((not is_private and space <> '' and space = public.hm_space()) or code = public.hm_code());

create policy hm_mem_all on public.hm_members for all to anon, authenticated
  using (program_id in (select id from public.hm_programs where (not is_private and space <> '' and space = public.hm_space()) or code = public.hm_code()))
  with check (program_id in (select id from public.hm_programs where (not is_private and space <> '' and space = public.hm_space()) or code = public.hm_code()));
create policy hm_exp_all on public.hm_expenses for all to anon, authenticated
  using (program_id in (select id from public.hm_programs where (not is_private and space <> '' and space = public.hm_space()) or code = public.hm_code()))
  with check (program_id in (select id from public.hm_programs where (not is_private and space <> '' and space = public.hm_space()) or code = public.hm_code()));
