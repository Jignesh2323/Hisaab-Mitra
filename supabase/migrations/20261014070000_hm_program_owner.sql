-- Program sirf banane wala (owner) delete kar sake.
-- Har device ki gupt chaabi header x-hm-owner me aati hai; database me sirf uska sha256 hash (owner_hash) rehta hai.
create extension if not exists pgcrypto with schema extensions;

alter table public.hm_programs add column if not exists owner_hash text;

create or replace function public.hm_owner_hash() returns text language sql stable set search_path = '' as $$
  select case when coalesce(current_setting('request.headers', true)::json ->> 'x-hm-owner', '') = '' then ''
    else encode(extensions.digest(current_setting('request.headers', true)::json ->> 'x-hm-owner', 'sha256'), 'hex') end
$$;

-- Delete: dikhne wala program ho aur owner ki chaabi match ho
drop policy if exists hm_prog_del on public.hm_programs;
create policy hm_prog_del on public.hm_programs for delete to anon, authenticated
  using (
    ((not is_private and space <> '' and space = public.hm_space()) or code = public.hm_code())
    and owner_hash is not null and owner_hash = public.hm_owner_hash()
  );

-- Owner badla na ja sake: ek baar set hone ke baad sirf wahi owner badal sake. Khaali ho to koi bhi apna bana sakta hai (purane programs).
create or replace function public.hm_guard_owner() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.owner_hash is not null and new.owner_hash <> public.hm_owner_hash() then
      raise exception 'owner_hash must match your own key';
    end if;
  elsif new.owner_hash is distinct from old.owner_hash then
    if old.owner_hash is not null and old.owner_hash <> public.hm_owner_hash() then
      raise exception 'Sirf program banane wala owner badal sakta hai';
    end if;
    if new.owner_hash is not null and new.owner_hash <> public.hm_owner_hash() then
      raise exception 'owner_hash must match your own key';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists hm_guard_owner on public.hm_programs;
create trigger hm_guard_owner before insert or update on public.hm_programs
  for each row execute function public.hm_guard_owner();
