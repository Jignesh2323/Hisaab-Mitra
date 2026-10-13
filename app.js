// HisaabMitra - group collection, kharcha aur hisaab
const SUPABASE_URL = 'https://wvdxofwaluoktvwatycy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Tt81pt-a-kZvn403iSWBUw_u6dktCoI';
const BUCKET = 'hm-bills';

const $ = s => document.querySelector(s);
const app = $('#app');
const state = { view: 'home', code: null, data: null, tab: 'summary', filter: 'all', q: '', homeQ: '' };

// ---------- helpers ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => Math.round((Number(v) || 0) * 100) / 100;
const rs = v => '₹' + num(v).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 2600);
}

function newCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const a = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(a, x => chars[x % chars.length]).join('');
}

// Har program ka apna client, jo share code header me bhejta hai (database isi se access deta hai)
const clients = {};
function db(code) {
  if (!clients[code]) {
    clients[code] = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      global: { headers: { 'x-hm-code': code } },
      auth: { persistSession: false, autoRefreshToken: false, storageKey: 'hm-' + code },
    });
  }
  return clients[code];
}
function check({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

// ---------- local list of my programs ----------
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const myPrograms = () => store.get('hm_programs', []);
function saveMyProgram(p) {
  const list = myPrograms().filter(x => x.code !== p.code);
  list.unshift({ code: p.code, name: p.name, type: p.type });
  store.set('hm_programs', list);
}
const forgetProgram = code => store.set('hm_programs', myPrograms().filter(x => x.code !== code));

// ---------- theme ----------
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name=theme-color]').content = t === 'dark' ? '#0b2b27' : '#0f766e';
}
applyTheme(store.get('hm_theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
$('#themeBtn').onclick = () => {
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  store.set('hm_theme', t); applyTheme(t);
};
$('#backBtn').onclick = () => goHome();

// ---------- modal ----------
function openModal(html) { $('#sheet').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); $('#sheet').innerHTML = ''; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
function confirmBox(msg) { return Promise.resolve(confirm(msg)); }

// ---------- data load ----------
async function loadProgram(code) {
  const c = db(code);
  const [p, m, e] = await Promise.all([
    c.from('hm_programs').select('*').eq('code', code).maybeSingle(),
    c.from('hm_members').select('*').order('created_at').order('flat_no').order('name'),
    c.from('hm_expenses').select('*').order('spent_on', { ascending: false }).order('created_at', { ascending: false }),
  ]);
  const program = check(p);
  if (!program) return null;
  return { program, members: check(m), expenses: check(e) };
}

// ---------- calculations ----------
const people = m => Math.max(1, parseInt(m.people) || 1);
function memberLabel(prog, m) {
  if (prog.type === 'flat') return [m.flat_no, m.name].filter(Boolean).join(' · ') || 'Flat';
  return m.name || m.flat_no || 'Member';
}
function memberStatus(prog, m) {
  const paid = num(m.paid), fixed = num(prog.fixed_amount) * people(m);
  if (fixed > 0) return paid >= fixed ? 'ok' : paid > 0 ? 'part' : 'no';
  return paid > 0 ? 'ok' : 'no';
}
function calc(d) {
  const { program: p, members, expenses } = d;
  const n = members.length;
  const collected = members.reduce((s, m) => s + num(m.paid), 0);
  const fundExp = expenses.filter(e => !e.paid_by).reduce((s, e) => s + num(e.amount), 0);
  const personalExp = expenses.filter(e => e.paid_by).reduce((s, e) => s + num(e.amount), 0);
  const totalExp = fundExp + personalExp;
  const balance = collected - fundExp;
  // Kharcha logon ki ginti se baanta jata hai: per member hissa x us flat ke log
  const persons = members.reduce((s, m) => s + people(m), 0);
  const perPerson = persons ? totalExp / persons : 0;
  const fixed = num(p.fixed_amount);
  const expected = fixed * persons;
  const pending = fixed > 0 ? members.reduce((s, m) => s + Math.max(0, fixed * people(m) - num(m.paid)), 0) : 0;
  const counts = { ok: 0, part: 0, no: 0 };
  members.forEach(m => counts[memberStatus(p, m)]++);

  // Har member ka hisaab: diya (fund me + khud kharcha kiya) - uska hissa
  const rows = members.map(m => {
    const spent = expenses.filter(e => e.paid_by === m.id).reduce((s, e) => s + num(e.amount), 0);
    const mine = perPerson * people(m);
    return { id: m.id, label: memberLabel(p, m), people: people(m), paid: num(m.paid), spent, share: mine, net: num(m.paid) + spent - mine };
  });

  // Settlement: collector (fund) bhi ek participant hai jiske paas balance pada hai
  const parties = rows.map(r => ({ label: r.label, net: r.net }));
  if (Math.abs(balance) > 0.009) parties.push({ label: 'Collector (Fund)', net: -balance, fund: true });
  const debtors = parties.filter(x => x.net < -0.009).map(x => ({ ...x, amt: -x.net })).sort((a, b) => b.amt - a.amt);
  const creditors = parties.filter(x => x.net > 0.009).map(x => ({ ...x, amt: x.net })).sort((a, b) => b.amt - a.amt);
  const settlements = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].amt, creditors[j].amt);
    if (amt > 0.009) settlements.push({ from: debtors[i].label, to: creditors[j].label, amt });
    debtors[i].amt -= amt; creditors[j].amt -= amt;
    if (debtors[i].amt < 0.01) i++;
    if (creditors[j].amt < 0.01) j++;
  }
  return { n, persons, perPerson, collected, fundExp, personalExp, totalExp, balance, fixed, expected, pending, counts, rows, settlements };
}

// ---------- HOME ----------
function goHome() {
  state.view = 'home'; state.code = null; state.data = null;
  $('#title').textContent = 'HisaabMitra';
  $('#backBtn').classList.add('hidden');
  renderHome();
}

function renderHome() {
  const q = state.homeQ.toLowerCase();
  const list = myPrograms().filter(p => !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q));
  app.innerHTML = `
    <div class="btns" style="margin-bottom:12px">
      <button class="btn" id="restoreBtn">📂 Backup restore</button>
    </div>
    ${myPrograms().length ? `<input type="search" class="search" id="homeSearch" placeholder="Program search karo…" value="${esc(state.homeQ)}">` : ''}
    ${list.length ? `<div class="list">${list.map(p => `
      <div class="item" data-code="${esc(p.code)}">
        <div class="badge ok">${p.type === 'flat' ? '🏢' : '👥'}</div>
        <div class="grow"><div class="bold ellipsis">${esc(p.name)}</div>
          <div class="muted">${p.type === 'flat' ? 'Society / Flat' : 'Friends group'} · Code <span class="code">${esc(p.code)}</span></div></div>
        <div class="muted">›</div>
      </div>`).join('')}</div>`
      : `<div class="card empty">${q ? 'Koi program nahi mila.' : `<div style="font-size:40px">📒</div><p><b>Abhi koi program nahi hai.</b><br>Neeche ＋ dabake naya program banao.</p>`}</div>`}
    <input type="file" id="restoreFile" accept=".json,application/json" hidden>
    <button class="fab" id="newBtn">＋ Naya Program</button>`;
  app.querySelectorAll('.item').forEach(el => el.onclick = () => openProgram(el.dataset.code));
  $('#newBtn').onclick = () => programForm();
  $('#restoreBtn').onclick = () => $('#restoreFile').click();
  $('#restoreFile').onchange = e => restoreBackup(e.target.files[0]);
  const hs = $('#homeSearch');
  if (hs) hs.oninput = () => { state.homeQ = hs.value; renderHome(); const n = $('#homeSearch'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
}

// New / edit program
function programForm(existing) {
  const others = myPrograms().filter(p => !existing || p.code !== existing.code);
  const p = existing || { name: '', type: 'flat', fixed_amount: 0 };
  openModal(`<h2>${existing ? 'Program edit karo' : 'Naya Program'}</h2>
    <label>Program ka naam</label><input type="text" id="pName" placeholder="Jaise Ganpati Utsav 2026" value="${esc(p.name)}">
    <label>Type</label>
    <div class="seg"><button class="btn ${p.type === 'flat' ? 'primary' : ''}" data-t="flat">🏢 Society / Flat</button><button class="btn ${p.type === 'friends' ? 'primary' : ''}" data-t="friends">👥 Friends</button></div>
    <label>Fixed amount har member (₹) <span class="muted">— nahi hai to 0 rakho</span></label>
    <input type="number" id="pFixed" inputmode="decimal" min="0" value="${num(p.fixed_amount) || ''}" placeholder="0">
    ${!existing && others.length ? `<label>Pichhle program se member list copy karo (optional)</label>
      <select id="pCopy"><option value="">— Copy mat karo —</option>${others.map(o => `<option value="${esc(o.code)}">${esc(o.name)}</option>`).join('')}</select>` : ''}
    <div class="actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="pSave">${existing ? 'Save' : 'Banao'}</button></div>`);
  let type = p.type;
  $('#sheet').querySelectorAll('[data-t]').forEach(b => b.onclick = () => {
    type = b.dataset.t;
    $('#sheet').querySelectorAll('[data-t]').forEach(x => x.classList.toggle('primary', x === b));
  });
  if (!existing) $('#pName').focus();
  $('#pSave').onclick = async () => {
    const name = $('#pName').value.trim();
    if (!name) return toast('Program ka naam daalo');
    const fixed_amount = num($('#pFixed').value);
    $('#pSave').disabled = true;
    try {
      if (existing) {
        check(await db(existing.code).from('hm_programs').update({ name, type, fixed_amount }).eq('id', existing.id).select().single());
        saveMyProgram({ ...existing, name, type });
        closeModal(); toast('Save ho gaya'); refresh();
      } else {
        const code = newCode();
        const prog = check(await db(code).from('hm_programs').insert({ code, name, type, fixed_amount }).select().single());
        const copyFrom = $('#pCopy')?.value;
        if (copyFrom) {
          const src = check(await db(copyFrom).from('hm_members').select('name,flat_no,people').order('created_at').order('flat_no'));
          if (src.length) check(await db(code).from('hm_members').insert(src.map(m => ({ program_id: prog.id, name: m.name, flat_no: m.flat_no, people: people(m), paid: 0 }))));
        }
        saveMyProgram(prog); closeModal(); toast('Program ban gaya!'); openProgram(code);
      }
    } catch (e) { $('#pSave').disabled = false; toast('Error: ' + e.message); }
  };
}

// ---------- PROGRAM ----------
async function openProgram(code, preloaded) {
  state.view = 'program'; state.code = code; state.tab = 'summary'; state.filter = 'all'; state.q = '';
  $('#backBtn').classList.remove('hidden');
  if (!preloaded) app.innerHTML = '<div class="loading">Load ho raha hai…</div>';
  try {
    const d = preloaded || await loadProgram(code);
    if (!d) {
      if (await confirmBox('Ye program ab nahi mila (shayad delete ho gaya). Apni list se hata dein?')) forgetProgram(code);
      return goHome();
    }
    state.data = d; saveMyProgram(d.program); renderProgram();
  } catch (e) {
    app.innerHTML = `<div class="card empty">Data load nahi hua. Internet check karo.<br><span class="small">${esc(e.message)}</span><br><br><button class="btn primary" onclick="openProgram('${esc(code)}')">Dobara try karo</button></div>`;
  }
}
async function refresh() {
  try { const d = await loadProgram(state.code); if (d) { state.data = d; renderProgram(); } }
  catch (e) { toast('Refresh nahi hua: ' + e.message); }
}

function renderProgram() {
  const d = state.data, p = d.program, c = calc(d);
  $('#title').textContent = p.name;
  const tabs = [['summary', 'Summary'], ['members', p.type === 'flat' ? 'Flats' : 'Members'], ['expenses', 'Kharcha'], ['hisaab', 'Hisaab']];
  let body = '';
  if (state.tab === 'summary') body = summaryView(d, c);
  if (state.tab === 'members') body = membersView(d, c);
  if (state.tab === 'expenses') body = expensesView(d, c);
  if (state.tab === 'hisaab') body = hisaabView(d, c);
  const fab = state.tab === 'members' ? `＋ ${p.type === 'flat' ? 'Flat' : 'Member'} add` : state.tab === 'expenses' ? '＋ Kharcha add' : '';
  app.innerHTML = `
    <div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${state.tab === k ? 'active' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
    ${body}
    ${fab ? `<button class="fab" id="fab">${fab}</button>` : ''}`;
  app.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { state.tab = b.dataset.tab; state.q = ''; state.filter = 'all'; renderProgram(); });
  if (fab) $('#fab').onclick = () => state.tab === 'members' ? memberForm() : expenseForm();
  bindProgram();
}

function summaryView(d, c) {
  const p = d.program, unit = p.type === 'flat' ? 'flat' : 'member';
  return `
    <div class="card row between">
      <div><div class="muted">Share code (dusron ko do)</div><div class="code" style="font-size:20px">${esc(p.code)}</div></div>
      <button class="btn sm" id="copyCode">📋 Copy</button>
    </div>
    <div class="stats">
      <div class="stat wide"><div class="label">💰 Collector ke paas bacha paisa</div><div class="value ${c.balance < 0 ? 'red' : 'green'}">${rs(c.balance)}</div>
        <div class="muted">${c.balance < 0 ? 'Collection se zyada kharcha ho gaya' : 'Collection − fund se hua kharcha'}</div></div>
      <div class="stat"><div class="label">Total collection</div><div class="value">${rs(c.collected)}</div></div>
      <div class="stat"><div class="label">Total kharcha</div><div class="value">${rs(c.totalExp)}</div></div>
      ${p.type === 'flat' ? `
      <div class="stat"><div class="label">Total flats</div><div class="value">${c.n}</div></div>
      <div class="stat"><div class="label">Total members</div><div class="value">${c.persons}</div></div>` : `
      <div class="stat"><div class="label">Total members</div><div class="value">${c.n}</div></div>`}
      <div class="stat"><div class="label">Per member kharcha</div><div class="value">${rs(c.perPerson)}</div></div>
      ${c.fixed > 0 ? `
      <div class="stat"><div class="label">Fixed amount / member</div><div class="value">${rs(c.fixed)}</div></div>
      <div class="stat"><div class="label">Expected total</div><div class="value">${rs(c.expected)}</div></div>
      <div class="stat wide" style="background:transparent;border-color:var(--line)"><div class="label">⏳ Abhi baaki (pending)</div><div class="value amber">${rs(c.pending)}</div></div>` : ''}
    </div>
    <div class="card">
      <div class="bold" style="margin-bottom:6px">Payment status</div>
      <div class="row between small"><span>✅ Pura diya</span><b>${c.counts.ok}</b></div>
      ${c.fixed > 0 ? `<div class="row between small"><span>🟡 Thoda diya</span><b>${c.counts.part}</b></div>` : ''}
      <div class="row between small"><span>❌ Nahi diya</span><b>${c.counts.no}</b></div>
      ${c.personalExp > 0 ? `<div class="muted" style="margin-top:8px">Fund se kharcha ${rs(c.fundExp)} · Members ne khud kiya ${rs(c.personalExp)}</div>` : ''}
    </div>
    <div class="card">
      <div class="bold" style="margin-bottom:8px">Export / Backup</div>
      <div class="btns">
        <button class="btn sm" id="pdfBtn">🖨️ PDF</button>
        <button class="btn sm" id="xlsBtn">📊 Excel</button>
        <button class="btn sm" id="bakBtn">💾 Backup</button>
      </div>
    </div>
    <div class="card">
      <div class="bold" style="margin-bottom:8px">Settings</div>
      <div class="btns">
        <button class="btn sm" id="editProg">✏️ Program edit</button>
        <button class="btn sm" id="forgetProg">📤 Meri list se hatao</button>
        <button class="btn sm danger" id="delProg">🗑️ Program delete</button>
      </div>
    </div>`;
}

function membersView(d, c) {
  const p = d.program, q = state.q.toLowerCase();
  const list = d.members.filter(m => {
    const st = memberStatus(p, m);
    if (state.filter === 'paid' && st !== 'ok') return false;
    if (state.filter === 'pending' && st === 'ok') return false;
    return !q || memberLabel(p, m).toLowerCase().includes(q);
  });
  const icon = { ok: '✅', part: '🟡', no: '❌' };
  return `
    <input type="search" class="search" id="q" placeholder="${p.type === 'flat' ? 'Flat number / naam' : 'Naam'} se search…" value="${esc(state.q)}">
    <div class="chips">
      <button class="chip ${state.filter === 'all' ? 'active' : ''}" data-f="all">Sab (${c.n})</button>
      <button class="chip ${state.filter === 'paid' ? 'active' : ''}" data-f="paid">✅ Diya (${c.counts.ok})</button>
      <button class="chip ${state.filter === 'pending' ? 'active' : ''}" data-f="pending">❌ Pending (${c.counts.no + c.counts.part})</button>
      <button class="chip" id="bulkBtn">＋ Ek saath add</button>
    </div>
    ${list.length ? `<div class="list">${list.map(m => {
      const st = memberStatus(p, m), due = c.fixed > 0 ? Math.max(0, c.fixed * people(m) - num(m.paid)) : 0;
      const info = [p.type === 'flat' ? `👥 ${people(m)}` : '', due > 0 ? `${rs(due)} baaki` : ''].filter(Boolean).join(' · ');
      return `<div class="item" data-mid="${m.id}">
        <div class="badge ${st}">${icon[st]}</div>
        <div class="grow"><div class="bold ellipsis">${esc(memberLabel(p, m))}</div>
          ${info ? `<div class="muted">${info}</div>` : ''}</div>
        <div class="amt ${st === 'ok' ? 'green' : ''}">${rs(m.paid)}</div>
      </div>`; }).join('')}</div>`
      : `<div class="card empty">${d.members.length ? 'Koi match nahi mila.' : `Abhi koi ${p.type === 'flat' ? 'flat' : 'member'} nahi hai. Neeche ＋ dabao, ya "Ek saath add" se poori list daalo.`}</div>`}`;
}

function expensesView(d, c) {
  const p = d.program, q = state.q.toLowerCase();
  const byId = Object.fromEntries(d.members.map(m => [m.id, memberLabel(p, m)]));
  const list = d.expenses.filter(e => !q || e.title.toLowerCase().includes(q) || (byId[e.paid_by] || '').toLowerCase().includes(q));
  return `
    <div class="stats">
      <div class="stat"><div class="label">Total kharcha</div><div class="value">${rs(c.totalExp)}</div></div>
      <div class="stat"><div class="label">Bacha (collector)</div><div class="value ${c.balance < 0 ? 'red' : 'green'}">${rs(c.balance)}</div></div>
    </div>
    <input type="search" class="search" id="q" placeholder="Kharcha search…" value="${esc(state.q)}">
    ${list.length ? `<div class="list">${list.map(e => `
      <div class="item" data-eid="${e.id}">
        ${e.photo_url ? `<img class="thumb" src="${esc(e.photo_url)}" alt="" loading="lazy">` : `<div class="badge part">🧾</div>`}
        <div class="grow"><div class="bold ellipsis">${esc(e.title)}</div>
          <div class="muted ellipsis">${fmtDate(e.spent_on)} · ${e.paid_by ? 'Diya: ' + esc(byId[e.paid_by] || '?') : 'Fund se'}</div></div>
        <div class="amt">${rs(e.amount)}</div>
      </div>`).join('')}</div>`
      : `<div class="card empty">${d.expenses.length ? 'Koi match nahi mila.' : 'Abhi koi kharcha nahi. Neeche ＋ dabao.'}</div>`}`;
}

function hisaabView(d, c) {
  const p = d.program, unit = p.type === 'flat' ? 'flat' : 'member';
  if (!c.n) return `<div class="card empty">Pehle ${unit}s add karo.</div>`;
  return `
    <div class="card">
      <div class="row between"><span>Total kharcha</span><b>${rs(c.totalExp)}</b></div>
      <div class="row between"><span>${c.persons} members me baanta</span><b>${rs(c.perPerson)} / member</b></div>
      <div class="row between"><span>Collector ke paas bacha</span><b class="${c.balance < 0 ? 'red' : 'green'}">${rs(c.balance)}</b></div>
    </div>
    <div class="bold" style="margin:4px 2px 8px">🤝 Kaun kisko de</div>
    ${c.settlements.length ? `<div class="list" style="margin-bottom:14px">${c.settlements.map(s => `
      <div class="settle"><div class="grow"><b>${esc(s.from)}</b> <span class="muted">➜</span> <b>${esc(s.to)}</b></div><div class="amt">${rs(s.amt)}</div></div>`).join('')}</div>`
      : `<div class="card empty" style="padding:16px">Sab barabar hai, kisi ko kuchh nahi dena 🎉</div>`}
    <div class="bold" style="margin:4px 2px 8px">Har ${unit} ka hisaab</div>
    <div class="list">${c.rows.map(r => `
      <div class="item" style="cursor:default">
        <div class="grow"><div class="bold ellipsis">${esc(r.label)}</div>
          <div class="muted">${p.type === 'flat' ? `👥 ${r.people} · ` : ''}Diya ${rs(r.paid)}${r.spent ? ` + kharcha ${rs(r.spent)}` : ''} · Hissa ${rs(r.share)}</div></div>
        <div class="amt ${r.net > 0.009 ? 'green' : r.net < -0.009 ? 'red' : ''}">${r.net > 0.009 ? 'Lena ' + rs(r.net) : r.net < -0.009 ? 'Dena ' + rs(-r.net) : 'Barabar'}</div>
      </div>`).join('')}</div>`;
}

function bindProgram() {
  const p = state.data.program;
  const q = $('#q');
  if (q) q.oninput = () => { state.q = q.value; renderProgram(); const n = $('#q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
  app.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { state.filter = b.dataset.f; renderProgram(); });
  app.querySelectorAll('[data-mid]').forEach(el => el.onclick = () => memberForm(state.data.members.find(m => m.id === el.dataset.mid)));
  app.querySelectorAll('[data-eid]').forEach(el => el.onclick = () => expenseForm(state.data.expenses.find(e => e.id === el.dataset.eid)));
  const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
  on('bulkBtn', bulkForm);
  on('copyCode', async () => { try { await navigator.clipboard.writeText(p.code); toast('Code copy ho gaya'); } catch { toast('Code: ' + p.code); } });
  on('editProg', () => programForm(p));
  on('forgetProg', async () => {
    if (!await confirmBox('Program sirf is phone ki list se hatega. Online data delete nahi hoga, lekin ye program dobara list me nahi aayega. Pakka?')) return;
    forgetProgram(p.code); goHome();
  });
  on('delProg', async () => {
    if (!await confirmBox(`"${p.name}" ka poora data (members, kharcha) sabke liye hamesha ke liye delete ho jayega. Pakka?`)) return;
    try { check(await db(p.code).from('hm_programs').delete().eq('id', p.id)); forgetProgram(p.code); toast('Delete ho gaya'); goHome(); }
    catch (e) { toast('Error: ' + e.message); }
  });
  on('pdfBtn', exportPdf);
  on('xlsBtn', exportExcel);
  on('bakBtn', backup);
}

// ---------- member forms ----------
function memberForm(m) {
  const p = state.data.program, isFlat = p.type === 'flat';
  const fixed = num(p.fixed_amount);
  openModal(`<h2>${m ? 'Edit' : 'Add'} ${isFlat ? 'flat' : 'member'}</h2>
    ${isFlat ? `<label>Flat number</label><input type="text" id="mFlat" placeholder="Jaise A-101" value="${esc(m?.flat_no)}">` : ''}
    <label>${isFlat ? 'Naam (optional)' : 'Naam'}</label><input type="text" id="mName" value="${esc(m?.name)}">
    ${isFlat ? `<label>Kitne member (log)</label><input type="number" id="mPeople" inputmode="numeric" min="1" step="1" value="${m ? people(m) : 1}">` : ''}
    <label>Kitna diya (₹)</label>
    <input type="number" id="mPaid" inputmode="decimal" min="0" value="${m ? num(m.paid) || '' : ''}" placeholder="0">
    <div class="btns" style="margin-top:8px">
      ${fixed > 0 ? `<button class="btn sm" id="mFull">Pura amount</button>` : ''}
      ${m ? `<button class="btn sm" id="mAdd">＋ Aur payment jodo</button>` : ''}
      <button class="btn sm" id="mZero">0 karo</button>
    </div>
    <div class="actions">
      ${m ? `<button class="btn danger" id="mDel">Delete</button>` : `<button class="btn" onclick="closeModal()">Cancel</button>`}
      <button class="btn primary" id="mSave">Save</button>
    </div>`);
  (isFlat ? $('#mFlat') : $('#mName')).focus();
  const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
  on('mFull', () => $('#mPaid').value = num(fixed * (isFlat ? Math.max(1, parseInt($('#mPeople').value) || 1) : 1)));
  on('mZero', () => $('#mPaid').value = 0);
  on('mAdd', () => {
    const extra = num(prompt('Kitna aur diya? (₹)'));
    if (extra) $('#mPaid').value = num(num($('#mPaid').value) + extra);
  });
  on('mDel', async () => {
    if (!await confirmBox('Ise delete karein? Iske kiye kharche "Fund se" me chale jayenge.')) return;
    try { check(await db(p.code).from('hm_members').delete().eq('id', m.id)); closeModal(); toast('Delete ho gaya'); refresh(); }
    catch (e) { toast('Error: ' + e.message); }
  });
  $('#mSave').onclick = async () => {
    const row = { name: $('#mName').value.trim(), flat_no: isFlat ? $('#mFlat').value.trim() : '', paid: num($('#mPaid').value),
      people: isFlat ? Math.max(1, parseInt($('#mPeople').value) || 1) : 1 };
    if (!row.name && !row.flat_no) return toast(isFlat ? 'Flat number daalo' : 'Naam daalo');
    $('#mSave').disabled = true;
    try {
      const c = db(p.code);
      if (m) check(await c.from('hm_members').update(row).eq('id', m.id));
      else check(await c.from('hm_members').insert({ ...row, program_id: p.id }));
      closeModal(); toast('Save ho gaya'); refresh();
    } catch (e) { $('#mSave').disabled = false; toast('Error: ' + e.message); }
  };
}

function bulkForm() {
  const p = state.data.program, isFlat = p.type === 'flat';
  openModal(`<h2>Ek saath add karo</h2>
    <p class="muted">Har line me ek ${isFlat ? 'flat. Format: <b>Flat, Naam, Kitne member</b>, jaise <b>A-101, Sharma ji, 4</b>. Naam na ho to <b>A-102, 3</b> bhi chalega' : 'member ka naam'}.</p>
    <textarea id="bulk" rows="9" placeholder="${isFlat ? 'A-101, Sharma ji, 4\nA-102, 3\nA-103, Patel, 2' : 'Rahul\nAmit\nPriya'}"></textarea>
    <div class="actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="bSave">Add karo</button></div>`);
  $('#bSave').onclick = async () => {
    const rows = $('#bulk').value.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      if (!isFlat) return { program_id: p.id, name: l, flat_no: '', paid: 0 };
      // "A-101, Patel, 4" -> flat, naam, members. Aakhri hissa number ho to wo members ki ginti hai
      const parts = l.split(',').map(x => x.trim());
      let count = 1;
      if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) count = Math.max(1, parseInt(parts.pop()));
      const [flat, ...rest] = parts;
      return { program_id: p.id, flat_no: flat, name: rest.join(', '), people: count, paid: 0 };
    });
    if (!rows.length) return toast('Kuchh likho');
    $('#bSave').disabled = true;
    try { check(await db(p.code).from('hm_members').insert(rows)); closeModal(); toast(`${rows.length} add ho gaye`); refresh(); }
    catch (e) { $('#bSave').disabled = false; toast('Error: ' + e.message); }
  };
}

// ---------- expense form ----------
function expenseForm(e) {
  const d = state.data, p = d.program;
  openModal(`<h2>${e ? 'Kharcha edit' : 'Naya kharcha'}</h2>
    <label>Kis cheez ka</label><input type="text" id="eTitle" placeholder="Jaise Tent, Prasad, Petrol" value="${esc(e?.title)}">
    <label>Amount (₹)</label><input type="number" id="eAmt" inputmode="decimal" min="0" value="${e ? num(e.amount) : ''}">
    <label>Date</label><input type="date" id="eDate" value="${e?.spent_on || today()}">
    <label>Paisa kisne diya</label>
    <select id="ePaid"><option value="">Collection fund se (collector ne)</option>
      ${d.members.map(m => `<option value="${m.id}" ${e?.paid_by === m.id ? 'selected' : ''}>${esc(memberLabel(p, m))} (khud ki jeb se)</option>`).join('')}</select>
    <label>Bill photo (optional)</label>
    ${e?.photo_url ? `<div class="row" style="margin-bottom:6px"><a href="${esc(e.photo_url)}" target="_blank" rel="noopener"><img class="thumb" src="${esc(e.photo_url)}" alt="Bill"></a>
      <label class="small" style="margin:0"><input type="checkbox" id="eRmPhoto"> Photo hatao</label></div>` : ''}
    <input type="file" id="ePhoto" accept="image/*">
    <div class="actions">
      ${e ? `<button class="btn danger" id="eDel">Delete</button>` : `<button class="btn" onclick="closeModal()">Cancel</button>`}
      <button class="btn primary" id="eSave">Save</button>
    </div>`);
  if (!e) $('#eTitle').focus();
  if (e) $('#eDel').onclick = async () => {
    if (!await confirmBox('Ye kharcha delete karein?')) return;
    try { check(await db(p.code).from('hm_expenses').delete().eq('id', e.id)); closeModal(); toast('Delete ho gaya'); refresh(); }
    catch (err) { toast('Error: ' + err.message); }
  };
  $('#eSave').onclick = async () => {
    const title = $('#eTitle').value.trim(), amount = num($('#eAmt').value);
    if (!title) return toast('Kharche ka naam daalo');
    if (amount <= 0) return toast('Amount daalo');
    const btn = $('#eSave'); btn.disabled = true;
    try {
      let photo_url = e?.photo_url || null;
      if ($('#eRmPhoto')?.checked) photo_url = null;
      const file = $('#ePhoto').files[0];
      if (file) { btn.textContent = 'Photo upload…'; photo_url = await uploadPhoto(p.code, file); }
      const row = { title, amount, spent_on: $('#eDate').value || today(), paid_by: $('#ePaid').value || null, photo_url };
      const c = db(p.code);
      if (e) check(await c.from('hm_expenses').update(row).eq('id', e.id));
      else check(await c.from('hm_expenses').insert({ ...row, program_id: p.id }));
      closeModal(); toast('Save ho gaya'); refresh();
    } catch (err) { btn.disabled = false; btn.textContent = 'Save'; toast('Error: ' + err.message); }
  };
}

// Photo ko chhota karke upload karo (data aur storage bachane ke liye)
async function uploadPhoto(code, file) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.75));
  const path = `${code}/${crypto.randomUUID()}.jpg`;
  const c = db(code);
  check(await c.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' }));
  return c.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// ---------- export ----------
function reportTables() {
  const d = state.data, p = d.program, c = calc(d);
  const byId = Object.fromEntries(d.members.map(m => [m.id, memberLabel(p, m)]));
  const status = { ok: 'Diya', part: 'Thoda diya', no: 'Nahi diya' };
  return {
    p, c,
    summary: [
      ['Program', p.name], ['Type', p.type === 'flat' ? 'Society / Flat' : 'Friends'], ['Share code', p.code],
      ...(p.type === 'flat' ? [['Total flats', c.n]] : []), ['Total members', c.persons], ['Total collection', num(c.collected)],
      ...(c.fixed > 0 ? [['Fixed amount / member', c.fixed], ['Expected total', num(c.expected)], ['Pending', num(c.pending)]] : []),
      ['Total kharcha', num(c.totalExp)], ['Fund se kharcha', num(c.fundExp)], ['Members ne khud kiya', num(c.personalExp)],
      ['Per member kharcha', num(c.perPerson)], ['Collector ke paas bacha', num(c.balance)],
    ],
    members: [[p.type === 'flat' ? 'Flat' : 'Naam', 'Naam', 'Members', 'Diya (₹)', 'Status'],
      ...d.members.map(m => [m.flat_no || m.name, p.type === 'flat' ? m.name : '', people(m), num(m.paid), status[memberStatus(p, m)]])],
    expenses: [['Date', 'Kharcha', 'Amount (₹)', 'Kisne diya', 'Bill photo'],
      ...d.expenses.map(e => [e.spent_on, e.title, num(e.amount), e.paid_by ? byId[e.paid_by] || '' : 'Fund', e.photo_url || ''])],
    hisaab: [['Member', 'Log', 'Diya (₹)', 'Khud kharcha (₹)', 'Hissa (₹)', 'Lena(+)/Dena(−) (₹)'],
      ...c.rows.map(r => [r.label, r.people, num(r.paid), num(r.spent), num(r.share), num(r.net)])],
    settle: [['Kaun', 'Kisko', 'Kitna (₹)'], ...c.settlements.map(s => [s.from, s.to, num(s.amt)])],
  };
}

function exportPdf() {
  const t = reportTables();
  const table = rows => `<table><thead><tr>${rows[0].map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map(r => `<tr>${r.map(v => `<td>${esc(typeof v === 'number' ? rs(v) : (String(v).startsWith('http') ? 'Haan' : v))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  $('#printArea').innerHTML = `<h1>${esc(t.p.name)}</h1><div>HisaabMitra · ${new Date().toLocaleDateString('en-IN')}</div>
    <h2>Summary</h2><table><tbody>${t.summary.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(typeof v === 'number' && !['Total members', 'Total flats'].includes(k) ? rs(v) : v)}</td></tr>`).join('')}</tbody></table>
    <h2>Collection</h2>${table(t.members)}
    <h2>Kharcha</h2>${table(t.expenses)}
    <h2>Har member ka hisaab</h2>${table(t.hisaab)}
    ${t.settle.length > 1 ? `<h2>Kaun kisko de</h2>${table(t.settle)}` : ''}`;
  toast('Print me "Save as PDF" chuno');
  setTimeout(() => window.print(), 300);
}

function exportExcel() {
  if (!window.XLSX) return toast('Excel tool load ho raha hai, thodi der baad try karo');
  const t = reportTables(), wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Detail', 'Value'], ...t.summary]), 'Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(t.members), 'Collection');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(t.expenses), 'Kharcha');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(t.hisaab), 'Hisaab');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(t.settle), 'Kaun kisko de');
  XLSX.writeFile(wb, `${safeName(t.p.name)}.xlsx`);
}

const safeName = s => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'hisaab';

function backup() {
  const d = state.data;
  const data = { app: 'HisaabMitra', version: 1, exported_at: new Date().toISOString(), program: d.program, members: d.members, expenses: d.expenses };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `${safeName(d.program.name)}_backup_${today()}.json`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Backup file download ho gayi');
}

// Restore hamesha naye share code ke saath ek nayi copy banata hai
async function restoreBackup(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'HisaabMitra' || !data.program) throw new Error('Ye HisaabMitra ki backup file nahi hai');
    const code = newCode(), c = db(code);
    const prog = check(await c.from('hm_programs').insert({
      code, name: data.program.name + ' (restore)', type: data.program.type, fixed_amount: num(data.program.fixed_amount),
    }).select().single());
    const idMap = {};
    for (const m of data.members || []) {
      const nm = check(await c.from('hm_members').insert({ program_id: prog.id, name: m.name || '', flat_no: m.flat_no || '', people: people(m), paid: num(m.paid) }).select('id').single());
      idMap[m.id] = nm.id;
    }
    const ex = (data.expenses || []).map(e => ({
      program_id: prog.id, title: e.title, amount: num(e.amount), spent_on: e.spent_on || today(),
      paid_by: e.paid_by ? idMap[e.paid_by] || null : null, photo_url: e.photo_url || null,
    }));
    if (ex.length) check(await c.from('hm_expenses').insert(ex));
    saveMyProgram(prog); toast('Restore ho gaya!'); openProgram(code);
  } catch (e) { toast('Restore nahi hua: ' + e.message); }
}

// ---------- start ----------
goHome();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
