-- Kisi aur ne apni jeb se kharcha kiya, collector ko use lautana hai.
-- payer_name = jisne paisa diya ('' = fund se), repaid = ab tak kitna lauta diya.
alter table public.hm_expenses add column if not exists payer_name text not null default '';
alter table public.hm_expenses add column if not exists repaid numeric not null default 0;

-- Purani "flat ne khud ki jeb se diya" entries ko naye "dena baaki" me badlo
update public.hm_expenses e
set payer_name = coalesce(nullif(concat_ws(' · ', nullif(m.flat_no, ''), nullif(m.name, '')), ''), 'Member'),
    paid_by = null
from public.hm_members m
where e.paid_by = m.id and e.payer_name = '';
