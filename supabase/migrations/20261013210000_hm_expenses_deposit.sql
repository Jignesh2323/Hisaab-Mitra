-- Deposit (jaise pani bottle, bartan): wapas milne wala paisa. returned null = abhi wapas nahi aaya.
alter table public.hm_expenses add column if not exists is_deposit boolean not null default false;
alter table public.hm_expenses add column if not exists returned numeric;
