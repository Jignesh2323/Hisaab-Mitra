-- Delete history: jo bhi program / flat / kharcha delete ho, uski poori copy space-wise yahan rehti hai.
create table if not exists public.hm_deleted (
  id uuid primary key default gen_random_uuid(),
  space text not null,
  kind text not null check (kind in ('program', 'member', 'expense')),
  program_code text not null default '',
  program_name text not null default '',
  title text not null default '',
  amount numeric not null default 0,
  data jsonb not null,
  deleted_at timestamptz not null default now()
);
create index if not exists hm_deleted_space_idx on public.hm_deleted(space, deleted_at desc);

alter table public.hm_deleted enable row level security;
drop policy if exists hm_del_sel on public.hm_deleted;
drop policy if exists hm_del_ins on public.hm_deleted;
drop policy if exists hm_del_del on public.hm_deleted;
-- Sirf apne space ki history dikhe / likhe / hataye
create policy hm_del_sel on public.hm_deleted for select to anon, authenticated using (space <> '' and space = public.hm_space());
create policy hm_del_ins on public.hm_deleted for insert to anon, authenticated with check (space <> '' and space = public.hm_space());
create policy hm_del_del on public.hm_deleted for delete to anon, authenticated using (space <> '' and space = public.hm_space());
