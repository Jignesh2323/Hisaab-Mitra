-- Pass / cheez vitran: har flat me kitne members ko pass (ya koi cheez) mil gaya
alter table public.hm_programs add column if not exists track_pass boolean not null default false;
alter table public.hm_programs add column if not exists pass_label text not null default 'Pass';
alter table public.hm_members add column if not exists passes integer not null default 0;
alter table public.hm_members drop constraint if exists hm_members_passes_check;
alter table public.hm_members add constraint hm_members_passes_check check (passes >= 0);
