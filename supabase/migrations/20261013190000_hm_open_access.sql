-- Share code system hataya: app kholne wala har koi saare programs dekh aur badal sakta hai.
-- Baad me PIN ya view-only lagana ho to ye policies wapas tight karni hongi.
drop policy if exists hm_prog_sel on public.hm_programs;
drop policy if exists hm_prog_ins on public.hm_programs;
drop policy if exists hm_prog_upd on public.hm_programs;
drop policy if exists hm_prog_del on public.hm_programs;
drop policy if exists hm_mem_all on public.hm_members;
drop policy if exists hm_exp_all on public.hm_expenses;
drop policy if exists hm_prog_open on public.hm_programs;
drop policy if exists hm_mem_open on public.hm_members;
drop policy if exists hm_exp_open on public.hm_expenses;

create policy hm_prog_open on public.hm_programs for all to anon, authenticated using (true) with check (true);
create policy hm_mem_open on public.hm_members for all to anon, authenticated using (true) with check (true);
create policy hm_exp_open on public.hm_expenses for all to anon, authenticated using (true) with check (true);
