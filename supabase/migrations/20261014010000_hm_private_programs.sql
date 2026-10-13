-- Private program: sirf jiske paas link (code) hai wahi dekh / badal sake.
-- Public program pehle jaisa sabko dikhega.
alter table public.hm_programs add column if not exists is_private boolean not null default false;

drop policy if exists hm_prog_open on public.hm_programs;
drop policy if exists hm_mem_open on public.hm_members;
drop policy if exists hm_exp_open on public.hm_expenses;
drop policy if exists hm_prog_sel on public.hm_programs;
drop policy if exists hm_prog_ins on public.hm_programs;
drop policy if exists hm_prog_upd on public.hm_programs;
drop policy if exists hm_prog_del on public.hm_programs;
drop policy if exists hm_mem_all on public.hm_members;
drop policy if exists hm_exp_all on public.hm_expenses;

create policy hm_prog_sel on public.hm_programs for select to anon, authenticated
  using (not is_private or code = public.hm_code());
create policy hm_prog_ins on public.hm_programs for insert to anon, authenticated
  with check (not is_private or code = public.hm_code());
create policy hm_prog_upd on public.hm_programs for update to anon, authenticated
  using (not is_private or code = public.hm_code())
  with check (not is_private or code = public.hm_code());
create policy hm_prog_del on public.hm_programs for delete to anon, authenticated
  using (not is_private or code = public.hm_code());

-- Flats / members aur kharcha: sirf un programs ke jo upar ke rule se dikhte hain
create policy hm_mem_all on public.hm_members for all to anon, authenticated
  using (program_id in (select id from public.hm_programs where not is_private or code = public.hm_code()))
  with check (program_id in (select id from public.hm_programs where not is_private or code = public.hm_code()));
create policy hm_exp_all on public.hm_expenses for all to anon, authenticated
  using (program_id in (select id from public.hm_programs where not is_private or code = public.hm_code()))
  with check (program_id in (select id from public.hm_programs where not is_private or code = public.hm_code()));
