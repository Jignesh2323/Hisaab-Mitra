-- Kai din wale program me har din ki tareekh (["2026-10-11","2026-10-13",...])
alter table public.hm_programs add column if not exists day_dates jsonb not null default '[]'::jsonb;
