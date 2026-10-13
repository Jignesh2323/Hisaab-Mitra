-- Nasto program me pass vitran chalu, aur sab members ko pass de diya (user ne bataya sabko diya hai)
alter table public.hm_programs disable trigger hm_guard_owner;
update public.hm_programs set track_pass = true, pass_label = 'Pass' where name = 'Navratri Common Nasto 2026';
alter table public.hm_programs enable trigger hm_guard_owner;
update public.hm_members m set passes = m.people
from public.hm_programs p where m.program_id = p.id and p.name = 'Navratri Common Nasto 2026';
