-- Har flat me kitne log (member) hain. Kharcha isi hisaab se baanta jata hai.
alter table public.hm_members add column if not exists people integer not null default 1;
alter table public.hm_members drop constraint if exists hm_members_people_check;
alter table public.hm_members add constraint hm_members_people_check check (people >= 1);
