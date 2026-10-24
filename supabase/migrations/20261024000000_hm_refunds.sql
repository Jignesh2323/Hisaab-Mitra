-- Wapsi (refund): program khatam hone par har vyakti ko kuchh paisa wapas.
-- refund_per_head = per vyakti kitna lautana hai, hm_members.refunded = us flat ko ab tak kitna lautaya.
alter table public.hm_programs add column if not exists refund_per_head numeric not null default 0;
alter table public.hm_members add column if not exists refunded numeric not null default 0;

-- Nasto: ₹100 per vyakti wapsi. Jinka pass hataya gaya tha unhe wapsi mil chuki (user ka plan),
-- jinka pass laga hai unhe baaki. Uske baad pass sabko wapas "diya".
alter table public.hm_programs disable trigger hm_guard_owner;
update public.hm_programs set refund_per_head = 100 where name = 'Navratri Common Nasto 2026';
alter table public.hm_programs enable trigger hm_guard_owner;

update public.hm_members m
set refunded = greatest(m.people - least(m.passes, m.people), 0) * 100,
    passes = m.people
from public.hm_programs p
where m.program_id = p.id and p.name = 'Navratri Common Nasto 2026';
