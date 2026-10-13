-- Program ka icon (emoji), Home par pehchan ke liye. Khaali = naam se apne aap.
alter table public.hm_programs add column if not exists icon text not null default '';
