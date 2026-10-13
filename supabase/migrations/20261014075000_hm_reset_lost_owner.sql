-- Phone ka data clear hone se owner chaabi mit gayi: in 3 programs ka owner khaali karo,
-- taaki asli owner phone se dobara "Owner bano" daba sake.
alter table public.hm_programs disable trigger hm_guard_owner;
update public.hm_programs set owner_hash = null
where name in ('Navrtri Jamanvar 2026', 'Navrti Decoration 2026', 'Navratri Common Nasto 2026')
  and owner_hash is not null;
alter table public.hm_programs enable trigger hm_guard_owner;
