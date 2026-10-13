-- Owner (program banane wala) hi save hui entry edit / delete kar sake.
-- Baaki log: nayi entry daal sakte hain, aur flat me payment sirf badha sakte hain.
-- Program ka owner khaali ho (purane program) to sab ko pehle jaisi poori ijaazat.

create or replace function public.hm_is_owner(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.owner_hash is null or p.owner_hash = public.hm_owner_hash()
                   from public.hm_programs p where p.id = pid), false)
$$;

-- Members: dekhna/jodna/badalna pehle jaisa (trigger rokta hai), delete sirf owner
drop policy if exists hm_mem_all on public.hm_members;
drop policy if exists hm_mem_sel on public.hm_members;
drop policy if exists hm_mem_ins on public.hm_members;
drop policy if exists hm_mem_upd on public.hm_members;
drop policy if exists hm_mem_del on public.hm_members;
create policy hm_mem_sel on public.hm_members for select to anon, authenticated
  using (program_id in (select id from public.hm_programs where (not is_private and space <> '' and space = public.hm_space()) or code = public.hm_code()));
create policy hm_mem_ins on public.hm_members for insert to anon, authenticated
  with check (program_id in (select id from public.hm_programs where (not is_private and space <> '' and space = public.hm_space()) or code = public.hm_code()));
create policy hm_mem_upd on public.hm_members for update to anon, authenticated
  using (program_id in (select id from public.hm_programs where (not is_private and space <> '' and space = public.hm_space()) or code = public.hm_code()))
  with check (program_id in (select id from public.hm_programs where (not is_private and space <> '' and space = public.hm_space()) or code = public.hm_code()));
create policy hm_mem_del on public.hm_members for delete to anon, authenticated
  using (program_id in (select id from public.hm_programs where (not is_private and space <> '' and space = public.hm_space()) or code = public.hm_code())
         and public.hm_is_owner(program_id));

-- Kharcha: dekhna/jodna sab, badalna aur delete sirf owner
drop policy if exists hm_exp_all on public.hm_expenses;
drop policy if exists hm_exp_sel on public.hm_expenses;
drop policy if exists hm_exp_ins on public.hm_expenses;
drop policy if exists hm_exp_upd on public.hm_expenses;
drop policy if exists hm_exp_del on public.hm_expenses;
create policy hm_exp_sel on public.hm_expenses for select to anon, authenticated
  using (program_id in (select id from public.hm_programs where (not is_private and space <> '' and space = public.hm_space()) or code = public.hm_code()));
create policy hm_exp_ins on public.hm_expenses for insert to anon, authenticated
  with check (program_id in (select id from public.hm_programs where (not is_private and space <> '' and space = public.hm_space()) or code = public.hm_code()));
create policy hm_exp_upd on public.hm_expenses for update to anon, authenticated
  using (program_id in (select id from public.hm_programs where (not is_private and space <> '' and space = public.hm_space()) or code = public.hm_code())
         and public.hm_is_owner(program_id))
  with check (public.hm_is_owner(program_id));
create policy hm_exp_del on public.hm_expenses for delete to anon, authenticated
  using (program_id in (select id from public.hm_programs where (not is_private and space <> '' and space = public.hm_space()) or code = public.hm_code())
         and public.hm_is_owner(program_id));

-- Member update: owner nahi to sirf payment badha sakta hai, baaki kuchh nahi
create or replace function public.hm_guard_member() returns trigger language plpgsql set search_path = '' as $$
begin
  if not public.hm_is_owner(old.program_id) then
    if new.program_id <> old.program_id or new.name <> old.name or new.flat_no <> old.flat_no
       or new.people <> old.people or new.paid < old.paid then
      raise exception 'Save hui entry sirf program ka owner badal sakta hai';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists hm_guard_member on public.hm_members;
create trigger hm_guard_member before update on public.hm_members for each row execute function public.hm_guard_member();

-- Program settings: owner set ho to sirf owner badle (owner khaali ho to "owner bano" chalta rahe)
create or replace function public.hm_guard_owner() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.owner_hash is not null and new.owner_hash <> public.hm_owner_hash() then
      raise exception 'owner_hash must match your own key';
    end if;
  else
    if old.owner_hash is not null and old.owner_hash <> public.hm_owner_hash() then
      raise exception 'Program sirf uska owner badal sakta hai';
    end if;
    if new.owner_hash is distinct from old.owner_hash and new.owner_hash is not null and new.owner_hash <> public.hm_owner_hash() then
      raise exception 'owner_hash must match your own key';
    end if;
  end if;
  return new;
end $$;
