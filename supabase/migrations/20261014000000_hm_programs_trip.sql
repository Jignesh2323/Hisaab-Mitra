-- Naya program type: trip (couples / groups, kai round me collection)
alter table public.hm_programs drop constraint if exists hm_programs_type_check;
alter table public.hm_programs add constraint hm_programs_type_check check (type in ('flat', 'friends', 'trip'));
