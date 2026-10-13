-- Kharcha kis program/din ka hai (jaise "Din 1"). Ek collection se kai program ka kharcha alag dikhe.
alter table public.hm_expenses add column if not exists event text not null default '';
