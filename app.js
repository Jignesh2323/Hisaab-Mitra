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

// Space: har vyakti / society ka alag data. Ek phone me kai space ho sakte hain (personal + link wale).
const spaces = {
  list() { return store.get('hm_spaces', []); },
  get current() { return store.get('hm_space', ''); },
  add(code, name) {
    const l = spaces.list().filter(x => x.code !== code);
    l.push({ code, name: name || l.find(x => x.code === code)?.name || 'Space' });
    store.set('hm_spaces', l);
  },
  use(code, name) { spaces.add(code, name); store.set('hm_space', code); },
  name(code = spaces.current) { return spaces.list().find(x => x.code === code)?.name || 'Space'; },
};
const SPACE = spaces.current;
const spaceLink = code => `${location.origin}${location.pathname}#space=${code}`;
function newSpaceCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), x => chars[x % chars.length]).join('');
}

// Har program ka apna client, jo share code header me bhejta hai (database isi se access deta hai)
const clients = {};
function db(code) {
  if (!clients[code]) {
    clients[code] = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      global: { headers: { 'x-hm-code': code, 'x-hm-space': SPACE } },
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
  list.unshift({ code: p.code, name: p.name, type: p.type, private: !!p.is_private, space: p.space || SPACE });
  store.set('hm_programs', list);
}
const forgetProgram = code => store.set('hm_programs', myPrograms().filter(x => x.code !== code));

// ---------- theme ----------
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name=theme-color]').content = t === 'dark' ? '#1e1b4b' : '#5b4cf0';
}
applyTheme(store.get('hm_theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
$('#backBtn').onclick = () => goHome();

// ---------- modal ----------
function openModal(html) { $('#sheet').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); $('#sheet').innerHTML = ''; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
function confirmBox(msg) { return Promise.resolve(confirm(msg)); }

// ---------- data load ----------
async function loadProgram(code) {
  const c = db(code);
  const program = check(await c.from('hm_programs').select('*').eq('code', code).maybeSingle());
  if (!program) return null;
  // Sirf isi program ke flats aur kharche (database ab sab programs ka data deta hai)
  const [m, e] = await Promise.all([
    c.from('hm_members').select('*').eq('program_id', program.id).order('created_at').order('flat_no').order('name'),
    c.from('hm_expenses').select('*').eq('program_id', program.id).order('spent_on', { ascending: false }).order('created_at', { ascending: false }),
  ]);
  const members = check(m);
  // Flats hamesha number ke kram me: C-202, C-402, ..., C-1004 (1004 ko 202 se pehle nahi rakhna)
  if (program.type === 'flat') members.sort((a, b) => (a.flat_no || '').localeCompare(b.flat_no || '', 'en', { numeric: true, sensitivity: 'base' }));
  return { program, members, expenses: check(e) };
}

// ---------- calculations ----------
const people = m => Math.max(1, parseInt(m.people) || 1);
// Jitne log, utne chehre (zyada ho to aage +N)
const FACES = ['👨', '👩', '👦', '👧', '👴', '👵'];
const faces = n => `<span class="faces" title="${n} log">${FACES.concat(FACES).slice(0, Math.min(n, 8)).join('')}${n > 8 ? `<small>+${n - 8}</small>` : ''}</span> <b class="small">${n}</b>`;
function memberLabel(prog, m) {
  if (prog.type === 'flat') return [m.flat_no, m.name].filter(Boolean).join(' · ') || 'Flat';
  return m.name || m.flat_no || 'Member';
}
function memberStatus(prog, m) {
  const paid = num(m.paid), fixed = num(prog.fixed_amount) * people(m);
  if (fixed > 0) return paid >= fixed ? 'ok' : paid > 0 ? 'part' : 'no';
  return paid > 0 ? 'ok' : 'no';
}
// Deposit: jab tak wapas nahi aaya, kharcha nahi hai (sirf fund se bahar gaya paisa).
// Wapas aane par jitna kata, utna hi asli kharcha banta hai.
const isDep = e => !!e.is_deposit;
const depBack = e => e.returned != null;
const realAmt = e => isDep(e) ? (depBack(e) ? Math.max(0, num(e.amount) - num(e.returned)) : 0) : num(e.amount);
// Kisi aur ne apni jeb se diya: collector ke haath se abhi sirf utna gaya jitna lauta diya
const payer = e => (e.payer_name || '').trim();
const owedOf = e => payer(e) && !isDep(e) ? Math.max(0, num(e.amount) - num(e.repaid)) : 0;
const cashOut = e => isDep(e) ? num(e.amount) - (depBack(e) ? num(e.returned) : 0) : payer(e) ? Math.min(num(e.amount), num(e.repaid)) : num(e.amount);

function calc(d) {
  const { program: p, members, expenses } = d;
  const n = members.length;
  const collected = members.reduce((s, m) => s + num(m.paid), 0);
  const fundExp = expenses.filter(e => !e.paid_by).reduce((s, e) => s + realAmt(e), 0);
  const personalExp = expenses.filter(e => e.paid_by).reduce((s, e) => s + realAmt(e), 0);
  const totalExp = fundExp + personalExp;
  const deps = expenses.filter(isDep);
  const depPending = deps.filter(e => !depBack(e)).reduce((s, e) => s + num(e.amount), 0);
  const depReturned = deps.filter(depBack).reduce((s, e) => s + num(e.returned), 0);
  const depLost = deps.filter(depBack).reduce((s, e) => s + realAmt(e), 0);
  // Collector ke haath me abhi kitna hai (deposit me fasa paisa bahar, udhaar abhi chukaya nahi)
  const balance = collected - expenses.filter(e => !e.paid_by).reduce((s, e) => s + cashOut(e), 0);
  const owed = expenses.reduce((s, e) => s + owedOf(e), 0);
  const owedBy = new Map();
  expenses.filter(e => payer(e) && !isDep(e)).forEach(e => {
    const k = payer(e), o = owedBy.get(k) || { name: k, total: 0, owed: 0, items: 0 };
    o.total += num(e.amount); o.owed += owedOf(e); o.items++; owedBy.set(k, o);
  });
  // Sab udhaar chukane aur deposit wapas aane ke baad asli bacha paisa
  const finalBal = balance - owed + depPending;
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
    const spent = expenses.filter(e => e.paid_by === m.id).reduce((s, e) => s + realAmt(e), 0);
    const mine = perPerson * people(m);
    return { id: m.id, label: memberLabel(p, m), people: people(m), paid: num(m.paid), spent, share: mine, net: num(m.paid) + spent - mine };
  });

  // Settlement: collector (fund) bhi ek participant hai jiske paas balance pada hai
  const parties = rows.map(r => ({ label: r.label, net: r.net }));
  // Settlement me maana jata hai ki baaki deposit wapas aa jayega
  if (Math.abs(finalBal) > 0.009) parties.push({ label: 'Collector (Fund)', net: -finalBal, fund: true });
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
  // Program-wise (Din 1, Din 2...) kharcha, pehli entry ke kram me
  const evMap = new Map(dayNames(p).map(n => [n, 0]));
  [...expenses].reverse().forEach(e => {
    const k = (e.event || '').trim() || 'Bina program';
    if (realAmt(e) || !isDep(e)) evMap.set(k, (evMap.get(k) || 0) + realAmt(e));
  });
  const events = [...evMap].map(([name, total]) => ({ name, total, perPerson: persons ? total / persons : 0 }))
    .sort((a, b) => (a.name === 'Bina program') - (b.name === 'Bina program') || a.name.localeCompare(b.name, 'en', { numeric: true }));
  return { owed, owedBy: [...owedBy.values()].sort((a, b) => b.owed - a.owed), finalBal, depPending, depReturned, depLost, depCount: deps.filter(e => !depBack(e)).length, n, persons, events, perPerson, collected, fundExp, personalExp, totalExp, balance, fixed, expected, pending, counts, rows, settlements };
}

// ---------- HOME ----------
function goHome(fromHistory) {
  state.view = 'home'; state.code = null; state.data = null;
  if (!fromHistory) saveRoute(false);
  $('#title').textContent = 'HisaabMitra';
  $('#backBtn').classList.add('hidden');
  if (!SPACE) return renderSpaceSetup();
  if (!state.programs) app.innerHTML = '<div class="loading">Load ho raha hai…</div>';
  else renderHome();
  loadPrograms().then(() => { if (state.view === 'home') renderHome(); })
    .catch(e => { if (state.view === 'home' && !state.programs) app.innerHTML = `<div class="card empty">Programs load nahi hue. Internet check karo.<br><span class="small">${esc(e.message)}</span><br><br><button class="btn primary" onclick="goHome()">Dobara try karo</button></div>`; });
}

// Sabhi programs (sabko dikhte hain), naye pehle
async function loadPrograms() {
  const cols = 'id,code,name,type,days,created_at,is_private';
  const pub = check(await db('ALL').from('hm_programs').select(cols).eq('space', SPACE).order('created_at', { ascending: false }));
  // Private program sirf unke code se milte hain jo is phone ne isi space me link se khole the
  const mine = myPrograms().filter(x => x.private && (x.space || SPACE) === SPACE && !pub.some(p => p.code === x.code));
  const priv = (await Promise.all(mine.map(x => db(x.code).from('hm_programs').select(cols).eq('code', x.code).maybeSingle()
    .then(r => { if (!r.error && !r.data) forgetProgram(x.code); return r.data; }).catch(() => null)))).filter(Boolean);
  state.programs = [...priv, ...pub].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return state.programs;
}

function renderHome() {
  const q = state.homeQ.toLowerCase();
  const all = state.programs || [];
  const list = all.filter(p => !q || p.name.toLowerCase().includes(q));
  app.innerHTML = `
    <div class="home-hero">
      <button class="space-pill" id="spaceBtn">🏠 <span data-notr>${esc(spaces.name())}</span> ▾</button>
      <h2>🙏 Namaste!</h2>
      <p>Collection, kharcha aur hisaab, sab ek jagah.</p>
      <div class="hero-num"><div><b>${all.length}</b>Programs</div>
        <div><b>${all.filter(x => x.type === 'trip').length}</b>Trips</div>
        <div><b>${all.filter(x => x.type === 'flat').length}</b>Society</div></div>
    </div>
    ${all.length ? `<input type="search" class="search" id="homeSearch" placeholder="Program search karo…" value="${esc(state.homeQ)}">` : ''}
    ${list.length ? `<div class="list">${list.map(p => `
      <div class="item" data-code="${esc(p.code)}">
        <div class="badge prog-badge type-${p.type}">${TYPE_LABEL[p.type]?.split(' ')[0] || '👥'}</div>
        <div class="grow"><div class="bold ellipsis">${p.is_private ? '🔒 ' : ''}${esc(p.name)}</div>
          <div class="muted">${(TYPE_LABEL[p.type] || '').replace(/^\S+ /, '')}${daysOf(p) > 1 ? ` · ${daysOf(p)} din` : ''} · ${new Date(p.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div></div>
        <div class="muted">›</div>
      </div>`).join('')}</div>`
      : `<div class="card empty">${q ? 'Koi program nahi mila.' : `<div style="font-size:40px">📒</div><p><b>Abhi koi program nahi hai.</b><br>Neeche ＋ dabake naya program banao.</p>`}</div>`}
    <button class="fab" id="newBtn">＋ Naya Program</button>`;
  app.querySelectorAll('.item').forEach(el => el.onclick = () => openProgram(el.dataset.code));
  $('#newBtn').onclick = () => programForm();
  $('#spaceBtn').onclick = spaceMenu;
  const hs = $('#homeSearch');
  if (hs) hs.oninput = () => { state.homeQ = hs.value; renderHome(); const n = $('#homeSearch'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
}

// Friends aur Trip: jo kharidta hai uska naam likho, baad me hisaab. Trip me har member ke saath log ki ginti (couple = 2)
const isGroup = p => p.type === 'friends' || p.type === 'trip';
const isTrip = p => p.type === 'trip';
const TYPE_LABEL = { flat: '🏢 Society / Flat', friends: '👥 Friends', trip: '🧳 Trip' };

// Pehli baar: space banao ya link se judo
function renderSpaceSetup() {
  $('#title').textContent = 'HisaabMitra';
  app.innerHTML = `
    <div class="home-hero"><h2>🙏 Swagat hai!</h2><p>Shuru karne ke liye apna space banao, ya kisi ka bheja link kholo.</p></div>
    <div class="card">
      <div class="bold">✨ Naya space banao</div>
      <p class="muted">Aapka apna alag data. Sirf jinhe aap link doge unhe dikhega.</p>
      <label>Space ka naam</label><input type="text" id="spName" placeholder="Jaise Mera personal, Shanti Society">
      <button class="btn primary block" id="spNew" style="margin-top:10px">Space banao</button>
    </div>
    <div class="card">
      <div class="bold">🔗 Link mila hai?</div>
      <p class="muted">Kisi ne space ka link bheja ho to use yahan paste karo, ya seedha link kholo.</p>
      <input type="text" id="spJoin" placeholder="Link ya space code">
      <button class="btn block" id="spGo" style="margin-top:10px">Join karo</button>
    </div>`;
  $('#spNew').onclick = () => { spaces.use(newSpaceCode(), $('#spName').value.trim() || 'Mera space'); location.reload(); };
  $('#spGo').onclick = () => joinSpace($('#spJoin').value);
}

function joinSpace(v, name) {
  const code = (String(v).match(/space=([A-Z0-9]+)/i)?.[1] || String(v)).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (code.length < 8) return toast('Sahi link ya code daalo');
  spaces.use(code, name || prompt('Is space ka naam? (sirf aapke phone me dikhega)', 'Society') || 'Space');
  location.hash = ''; location.reload();
}

// Space badlo / naya / link share
function spaceMenu() {
  const l = spaces.list();
  openModal(`<h2>🏠 Mere spaces</h2>
    <p class="muted">Har space ka data alag hai. Tap karke badlo.</p>
    <div class="list" style="margin:10px 0">${l.map(x => `<div class="item" data-sp="${x.code}">
      <div class="badge ${x.code === SPACE ? 'ok' : ''}">${x.code === SPACE ? '✅' : '🏠'}</div>
      <div class="grow"><div class="bold ellipsis" data-notr>${esc(x.name)}</div><div class="muted">${x.code === SPACE ? 'Abhi khula hai' : 'Kholne ke liye tap karo'}</div></div></div>`).join('')}</div>
    <button class="btn primary block" id="spShare">🔗 "${esc(spaces.name())}" ka link share karo</button>
    <p class="muted small" style="margin:6px 0 0">Jise link doge wo is space ke saare (public) programs dekh aur badal sakega.</p>
    <div class="btns" style="margin-top:12px">
      <button class="btn sm" id="spRename">✏️ Naam badlo</button>
      <button class="btn sm" id="spAdd">✨ Naya space</button>
      <button class="btn sm" id="spJoin2">🔗 Link se judo</button>
      ${l.length > 1 ? '<button class="btn sm danger" id="spRemove">Is phone se hatao</button>' : ''}
    </div>
    <div class="actions"><button class="btn block" onclick="closeModal()">Band karo</button></div>`);
  $('#sheet').querySelectorAll('[data-sp]').forEach(el => el.onclick = () => {
    if (el.dataset.sp === SPACE) return closeModal();
    store.set('hm_space', el.dataset.sp); history.replaceState(null, '', location.pathname); location.reload();
  });
  const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
  on('spShare', async () => {
    const url = spaceLink(SPACE), text = `HisaabMitra me "${spaces.name()}" ka hisaab dekho:`;
    try {
      if (navigator.share) await navigator.share({ title: spaces.name(), text, url });
      else { await navigator.clipboard.writeText(`${text} ${url}`); toast('Link copy ho gaya'); }
    } catch (e) { if (e.name !== 'AbortError') prompt('Ye link copy karo:', url); }
  });
  on('spRename', () => { const n = prompt('Space ka naya naam', spaces.name()); if (n?.trim()) { spaces.add(SPACE, n.trim()); spaceMenu(); renderHome(); } });
  on('spAdd', () => {
    const n = prompt('Naye space ka naam', 'Mera personal'); if (n === null) return;
    spaces.use(newSpaceCode(), n.trim() || 'Space'); history.replaceState(null, '', location.pathname); location.reload();
  });
  on('spJoin2', () => { const v = prompt('Space ka link ya code paste karo'); if (v) joinSpace(v); });
  on('spRemove', async () => {
    if (!await confirmBox(`"${spaces.name()}" is phone se hatega. Data online rahega, link se dobara jud sakte ho. Pakka?`)) return;
    const rest = spaces.list().filter(x => x.code !== SPACE);
    store.set('hm_spaces', rest); store.set('hm_space', rest[0]?.code || ''); location.reload();
  });
}

// Collection kitne din/program ka hai. 1 = ek hi program (program-wise hisaab chhupa rahega)
const daysOf = p => Math.max(1, parseInt(p.days) || 1);
const dayNames = p => Array.from({ length: daysOf(p) > 1 ? daysOf(p) : 0 }, (_, i) => `Din ${i + 1}`);
// Purane program jinme pehle se "Din 1" jaisa kharcha hai, wo bhi kai din wale maane jayenge
const multiDay = p => daysOf(p) > 1 || (p.id && state.data?.program?.id === p.id && state.data.expenses.some(e => (e.event || '').trim()));

// New / edit program
function programForm(existing) {
  const others = (state.programs || []).filter(p => !existing || p.code !== existing.code);
  const p = existing || { name: '', type: 'flat', fixed_amount: 0, days: 1 };
  openModal(`<h2>${existing ? 'Program edit karo' : 'Naya Program'}</h2>
    <label>Program ka naam</label><input type="text" id="pName" placeholder="Jaise Ganpati Utsav 2026" value="${esc(p.name)}">
    <label>Type</label>
    <div class="seg">${Object.entries(TYPE_LABEL).map(([k, l]) => `<button class="btn ${p.type === k ? 'primary' : ''}" data-t="${k}">${l}</button>`).join('')}</div>
    <p class="muted small" id="pTypeHint" style="margin:6px 0 0"></p>
    <label>Ye collection kitne program ka hai?</label>
    <div class="seg"><button class="btn ${!multiDay(p) ? 'primary' : ''}" data-d="1">🎯 Ek program</button><button class="btn ${multiDay(p) ? 'primary' : ''}" data-d="many">📅 Kai din ka</button></div>
    <div id="pDaysBox" class="${multiDay(p) ? '' : 'hidden'}"><label>Kitne din / program?</label>
      <input type="number" id="pDays" inputmode="numeric" min="2" max="31" step="1" value="${daysOf(p) > 1 ? daysOf(p) : 4}"></div>
    <label class="row" style="gap:8px;color:var(--text);margin-top:14px"><input type="checkbox" id="pPrivate" ${p.is_private ?? (p.type === 'trip') ? 'checked' : ''} style="width:20px;height:20px">
      🔒 Private: sirf link walon ko dikhe</label>
    <p class="muted small" style="margin:2px 0 0">Private program kisi ki list me nahi aata. Summary se link bhejo, jo kholega usi ko dikhega.</p>
    <label>Fixed amount har member (₹) <span class="muted">— nahi hai to 0 rakho</span></label>
    <input type="number" id="pFixed" inputmode="decimal" min="0" value="${num(p.fixed_amount) || ''}" placeholder="0">
    ${!existing && others.length ? `<label>Pichhle program se member list copy karo (optional)</label>
      <select id="pCopy"><option value="">— Copy mat karo —</option>${others.map(o => `<option value="${esc(o.code)}">${esc(o.name)}</option>`).join('')}</select>` : ''}
    <div class="actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="pSave">${existing ? 'Save' : 'Banao'}</button></div>`);
  let type = p.type, many = multiDay(p);
  const hints = { flat: 'Flat-wise collection, floor-wise baaki, fund se kharcha.', friends: 'Jo dost kharidta hai uska naam likho, aakhir me sabse barabar hisaab.',
    trip: 'Couple / group wise: kitne log, kai round me collection, koi bhi kharcha daale, aakhir me hisaab.' };
  const hint = () => { $('#pTypeHint').textContent = hints[type] || ''; };
  hint();
  $('#sheet').querySelectorAll('[data-d]').forEach(b => b.onclick = () => {
    many = b.dataset.d === 'many';
    $('#sheet').querySelectorAll('[data-d]').forEach(x => x.classList.toggle('primary', x === b));
    $('#pDaysBox').classList.toggle('hidden', !many);
  });
  $('#sheet').querySelectorAll('[data-t]').forEach(b => b.onclick = () => {
    type = b.dataset.t;
    $('#sheet').querySelectorAll('[data-t]').forEach(x => x.classList.toggle('primary', x === b));
    hint();
    if (!existing) $('#pPrivate').checked = type === 'trip';
  });
  if (!existing) $('#pName').focus();
  $('#pSave').onclick = async () => {
    const name = $('#pName').value.trim();
    if (!name) return toast('Program ka naam daalo');
    const fixed_amount = num($('#pFixed').value);
    const days = many ? Math.min(31, Math.max(2, parseInt($('#pDays').value) || 2)) : 1;
    const is_private = $('#pPrivate').checked;
    $('#pSave').disabled = true;
    try {
      if (existing) {
        check(await db(existing.code).from('hm_programs').update({ name, type, fixed_amount, days, is_private }).eq('id', existing.id).select().single());
        saveMyProgram({ ...existing, name, type, is_private });
        closeModal(); toast('Save ho gaya'); refresh();
      } else {
        const code = newCode();
        const prog = check(await db(code).from('hm_programs').insert({ code, name, type, fixed_amount, days, is_private, space: SPACE }).select().single());
        const copyFrom = $('#pCopy')?.value;
        if (copyFrom) {
          const srcProg = (state.programs || []).find(x => x.code === copyFrom);
          const src = srcProg ? check(await db(copyFrom).from('hm_members').select('name,flat_no,people').eq('program_id', srcProg.id).order('created_at').order('flat_no')) : [];
          if (src.length) check(await db(code).from('hm_members').insert(src.map(m => ({ program_id: prog.id, name: m.name, flat_no: m.flat_no, people: people(m), paid: 0 }))));
        }
        saveMyProgram(prog); closeModal(); toast('Program ban gaya!'); openProgram(code);
      }
    } catch (e) { $('#pSave').disabled = false; toast('Error: ' + e.message); }
  };
}

// ---------- PROGRAM ----------
// Khula program aur tab URL (#p=CODE&t=tab) me rakho, taaki reload par wahi khule
const TABS = ['summary', 'members', 'expenses', 'hisaab'];
function saveRoute(push) {
  const h = state.view === 'program' ? `#p=${state.code}&t=${state.tab}` : '';
  if (location.hash === h) return;
  history[push ? 'pushState' : 'replaceState'](null, '', h || location.pathname + location.search);
}
function readRoute() {
  const r = new URLSearchParams(location.hash.slice(1));
  return { code: r.get('p'), tab: TABS.includes(r.get('t')) ? r.get('t') : 'summary' };
}
// Phone ka back button: program se home par aao
addEventListener('popstate', () => {
  const r = readRoute();
  if (!r.code) { if (state.view !== 'home') goHome(true); }
  else if (r.code !== state.code) openProgram(r.code, null, r.tab, true);
  else if (r.tab !== state.tab) { state.tab = r.tab; renderProgram(); }
});

async function openProgram(code, preloaded, tab = 'summary', fromHistory) {
  state.view = 'program'; state.code = code; state.tab = tab; state.filter = 'all'; state.q = '';
  if (!fromHistory) saveRoute(true);
  $('#backBtn').classList.remove('hidden');
  if (!preloaded) app.innerHTML = '<div class="loading">Load ho raha hai…</div>';
  try {
    const d = preloaded || await loadProgram(code);
    if (!d) {
      toast('Ye program nahi mila, shayad delete ho gaya');
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
  state.programs = null;
  const d = state.data, p = d.program, c = calc(d);
  $('#title').textContent = p.name;
  const tabs = [['summary', '📊 Summary'], ['members', p.type === 'flat' ? '🏢 Flats' : '👥 Members'], ['expenses', '🧾 Kharcha'], ['hisaab', '🤝 Hisaab']];
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
  app.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { state.tab = b.dataset.tab; state.q = ''; state.filter = 'all'; state.ev = ''; saveRoute(false); renderProgram(); });
  if (fab) $('#fab').onclick = () => state.tab === 'members' ? memberForm() : expenseForm();
  bindProgram();
}

function summaryView(d, c) {
  const p = d.program, unit = p.type === 'flat' ? 'flat' : 'member';
  return `
    <div class="stats">
      <div class="stat wide"><div class="label">💰 Abhi collector ke haath me</div><div class="value ${c.balance < 0 ? 'red' : 'green'}">${rs(c.balance)}</div>
        ${c.owed || c.depPending ? `<div class="row between" style="margin-top:6px;padding-top:6px;border-top:1px solid var(--line)">
          <span class="small">Sab chukane${c.depPending ? ' aur deposit aane' : ''} ke baad bachega</span><b class="${c.finalBal < 0 ? 'red' : 'green'}">${rs(c.finalBal)}</b></div>
          <div class="muted">${[c.owed ? `${rs(c.owed)} logon ko dena baaki` : '', c.depPending ? `${rs(c.depPending)} deposit aana baaki` : ''].filter(Boolean).join(' · ')}</div>`
        : `<div class="muted">${c.balance < 0 ? 'Collection se zyada kharcha ho gaya' : 'Collection − kharcha'}</div>`}
        ${isGroup(p) && c.n ? `<button class="btn sm ${c.balance <= 0 ? 'primary' : ''}" id="roundBtn2" style="margin-top:8px">💰 Collection lo${c.balance <= 0 && c.totalExp ? ' (fund khatam)' : ''}</button>` : ''}</div>
      <div class="stat"><div class="label">💵 Total collection</div><div class="value">${rs(c.collected)}</div></div>
      <div class="stat"><div class="label">🧾 Total kharcha</div><div class="value">${rs(c.totalExp)}</div></div>
      ${p.type === 'flat' ? `
      <div class="stat"><div class="label">🏢 Total flats</div><div class="value">${c.n}</div></div>
      <div class="stat"><div class="label">👥 Total members</div><div class="value">${c.persons}</div></div>` : `
      <div class="stat"><div class="label">👥 Total members</div><div class="value">${c.n}</div></div>`}
      <div class="stat"><div class="label">🙋 Per member kharcha</div><div class="value">${rs(c.perPerson)}</div></div>
      ${c.fixed > 0 ? `
      <div class="stat"><div class="label">🎯 Fixed / member</div><div class="value">${rs(c.fixed)}</div></div>
      <div class="stat"><div class="label">📈 Expected total</div><div class="value">${rs(c.expected)}</div></div>
      <div class="stat wide" style="--g:linear-gradient(135deg,#f59e0b,#ef4444);--glow:rgba(239,68,68,.5)"><div class="label">⏳ Abhi baaki (pending)</div><div class="value amber">${rs(c.pending)}</div></div>` : ''}
    </div>
    ${owedCard(c)}
    ${depositCard(d, c)}
    ${eventCard(c)}
    <div class="card ${isGroup(p) && !c.fixed ? 'hidden' : ''}">
      <div class="bold" style="margin-bottom:6px">Payment status</div>
      <div class="row between small"><span>✅ Pura diya</span><b>${c.counts.ok}</b></div>
      ${c.fixed > 0 ? `<div class="row between small"><span>🟡 Thoda diya</span><b>${c.counts.part}</b></div>` : ''}
      <div class="row between small"><span>❌ Nahi diya</span><b>${c.counts.no}</b></div>
      ${c.personalExp > 0 ? `<div class="muted" style="margin-top:8px">Fund se kharcha ${rs(c.fundExp)} · Members ne khud kiya ${rs(c.personalExp)}</div>` : ''}
    </div>
    <div class="card">
      <div class="bold" style="margin-bottom:8px">📤 Export / Backup</div>
      <div class="btns">
        <button class="btn sm" id="pdfBtn">🖨️ PDF</button>
        <button class="btn sm" id="xlsBtn">📊 Excel</button>
        <button class="btn sm" id="bakBtn">💾 Backup</button>
      </div>
    </div>
    ${p.is_private ? `<div class="card">
      <div class="bold">🔒 Private program</div>
      <p class="muted" style="margin:4px 0 8px">Sirf jinke paas link hai unhe dikhta hai. Ye link trip walon ko bhejo.</p>
      <button class="btn primary block" id="shareLink">🔗 Link share karo</button>
    </div>` : ''}
    <div class="card">
      <div class="bold" style="margin-bottom:8px">⚙️ Program settings</div>
      <div class="btns">
        <button class="btn sm" id="editProg">✏️ Program edit</button>
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
      ${isGroup(p) && d.members.length ? '<button class="chip" id="roundBtn">💰 Collection lo</button>' : ''}
    </div>
    ${list.length ? (p.type === 'flat' ? floorGroups(d, c, list, row) : `<div class="list">${list.map(row).join('')}</div>`)
      : `<div class="card empty">${d.members.length ? 'Koi match nahi mila.' : `Abhi koi ${p.type === 'flat' ? 'flat' : 'member'} nahi hai. Neeche ＋ dabao, ya "Ek saath add" se poori list daalo.`}</div>`}`;

  function row(m) {
    const st = memberStatus(p, m), due = c.fixed > 0 ? Math.max(0, c.fixed * people(m) - num(m.paid)) : 0;
    const info = [p.type === 'flat' ? faces(people(m)) : '', due > 0 ? `${rs(due)} baaki` : ''].filter(Boolean).join(' · ');
    if (isGroup(p)) {
      const r = c.rows.find(x => x.id === m.id);
      return `<div class="item" data-mid="${m.id}">
        <div class="badge ${Math.abs(r.net) < 0.01 ? 'ok' : 'part'}">${Math.abs(r.net) < 0.01 ? '✅' : '🧾'}</div>
        <div class="grow"><div class="bold ellipsis" data-notr>${esc(r.label)}</div>
          <div class="muted">${isTrip(p) ? `${faces(r.people)} · ` : ''}${r.paid ? `Collection ${rs(r.paid)} · ` : ''}Kharcha ${rs(r.spent)} · Hissa ${rs(r.share)}</div></div>
        <div class="amt ${r.net > 0.009 ? 'green' : r.net < -0.009 ? 'red' : ''}">${r.net > 0.009 ? 'Dena ' + rs(r.net) : r.net < -0.009 ? 'Lena ' + rs(-r.net) : 'Barabar'}</div>
      </div>`;
    }
    return `<div class="item" data-mid="${m.id}">
      <div class="badge ${st}">${icon[st]}</div>
      <div class="grow"><div class="bold ellipsis" data-notr>${esc(memberLabel(p, m))}</div>
        ${info ? `<div class="muted">${info}</div>` : ''}</div>
      <div class="amt ${st === 'ok' ? 'green' : ''}">${rs(m.paid)}</div>
    </div>`;
  }
}

// Flat number se floor: C-202 -> 2, C-1004 -> 10 (aakhri 2 digit flat ke, baaki floor)
function floorOf(flat) {
  const nums = String(flat || '').match(/\d+/g);
  if (!nums) return null;
  const n = nums[nums.length - 1];
  return n.length >= 3 ? parseInt(n.slice(0, -2)) : null;
}

// Har floor ka alag box: upar floor ka hisaab (sab flats ka), neeche filter ke hisaab se flats
function floorGroups(d, c, list, row) {
  const p = d.program, groups = new Map();
  d.members.forEach(m => {
    const f = floorOf(m.flat_no);
    if (!groups.has(f)) groups.set(f, { all: [], shown: [] });
    groups.get(f).all.push(m);
  });
  list.forEach(m => groups.get(floorOf(m.flat_no)).shown.push(m));
  const keys = [...groups.keys()].sort((a, b) => (a ?? 1e9) - (b ?? 1e9));
  return keys.filter(k => groups.get(k).shown.length).map(k => {
    const { all, shown } = groups.get(k);
    const pendingFlats = all.filter(m => memberStatus(p, m) !== 'ok').length;
    const due = c.fixed > 0 ? all.reduce((s, m) => s + Math.max(0, c.fixed * people(m) - num(m.paid)), 0) : 0;
    const paid = all.reduce((s, m) => s + num(m.paid), 0);
    return `<div class="floor">
      <div class="floor-head">
        <div class="grow"><div class="bold">${k === null ? 'Dusre flats' : `Floor ${k}`}</div>
          <div class="muted">${all.length} flat${all.length > 1 ? 's' : ''} ·👥 ${all.reduce((s, m) => s + people(m), 0)} · Aaya ${rs(paid)}</div></div>
        <div class="floor-status ${pendingFlats ? 'pending' : 'done'}">${pendingFlats ? `❌ ${pendingFlats} baaki${due > 0 ? `<br><span class="small">${rs(due)}</span>` : ''}` : '✅ Sab diya'}</div>
      </div>
      <div class="list">${shown.map(row).join('')}</div>
    </div>`;
  }).join('');
}

function expensesView(d, c) {
  const p = d.program, q = state.q.toLowerCase();
  const byId = Object.fromEntries(d.members.map(m => [m.id, memberLabel(p, m)]));
  const evName = e => (e.event || '').trim() || 'Bina program';
  const list = d.expenses.filter(e => (!state.ev || evName(e) === state.ev) &&
    (!q || e.title.toLowerCase().includes(q) || evName(e).toLowerCase().includes(q) || (byId[e.paid_by] || '').toLowerCase().includes(q) || payer(e).toLowerCase().includes(q)));
  return `
    <div class="stats">
      <div class="stat"><div class="label">🧾 Total kharcha</div><div class="value">${rs(c.totalExp)}</div></div>
      <div class="stat"><div class="label">💰 Haath me</div><div class="value ${c.balance < 0 ? 'red' : 'green'}">${rs(c.balance)}</div></div>
    </div>
    <input type="search" class="search" id="q" placeholder="Kharcha search…" value="${esc(state.q)}">
    ${multiDay(p) ? `<div class="chips">
      <button class="chip ${!state.ev ? 'active' : ''}" data-ev="">Sab</button>
      ${c.events.map(ev => `<button class="chip ${state.ev === ev.name ? 'active' : ''}" data-ev="${esc(ev.name)}">${esc(ev.name)}</button>`).join('')}
    </div>` : ''}
    ${list.length ? eventGroups(c, list, e => `
      <div class="item" data-eid="${e.id}">
        ${e.photo_url ? `<img class="thumb" src="${esc(e.photo_url)}" alt="" loading="lazy">` : `<div class="badge part">🧾</div>`}
        <div class="grow"><div class="bold ellipsis" data-notr>${esc(e.title)}</div>
          <div class="muted ellipsis">${isDep(e) ? (depBack(e) ? `🔁 Deposit · wapas mila ${rs(e.returned)}` : '🔁 Deposit · <span class="amber">wapas aana baaki</span>') : `${fmtDate(e.spent_on)} · ${payer(e) ? `🙋 ${esc(payer(e))} ne diya · ${owedOf(e) > 0 ? `<span class="red">${rs(owedOf(e))} dena baaki</span>` : '<span class="green">chukta</span>'}` : e.paid_by ? 'Diya: ' + esc(byId[e.paid_by] || '?') : 'Fund se'}`}</div></div>
        <div class="amt ${isDep(e) && !depBack(e) ? 'amber' : ''}">${rs(e.amount)}</div>
      </div>`)
      : `<div class="card empty">${d.expenses.length ? 'Koi match nahi mila.' : 'Abhi koi kharcha nahi. Neeche ＋ dabao.'}</div>`}`;
}

// Summary: jinhone apni jeb se kharcha kiya, unhe kitna lautana baaki
function owedCard(c) {
  if (!c.owedBy.length) return '';
  return `<div class="card">
    <div class="row between"><div class="bold">💸 Logon ko dena baaki</div>
      ${c.owed > 0.009 ? `<b class="red">${rs(c.owed)}</b>` : '<b class="green">✅ Sab chuka diya</b>'}</div>
    ${c.owedBy.map(o => `<div class="row between" style="padding:8px 0;border-top:1px solid var(--line);margin-top:6px">
      <div class="grow"><div class="ellipsis bold" data-notr>${esc(o.name)}</div>
        <div class="muted">${o.items} kharcha · kul ${rs(o.total)}${o.total - o.owed > 0.009 ? ` · diya ${rs(o.total - o.owed)}` : ''}</div></div>
      ${o.owed > 0.009 ? `<b class="red" style="margin-right:8px">${rs(o.owed)}</b><button class="btn sm primary" data-repay="${esc(o.name)}">Paisa diya</button>`
        : '<span class="green small">✅ Chukta</span>'}</div>`).join('')}
  </div>`;
}

// Kisi ko paisa lautaya: pura ya thoda. Uske purane kharche pehle chukte hain.
async function repay(name) {
  const items = state.data.expenses.filter(e => payer(e) === name && owedOf(e) > 0)
    .sort((a, b) => (a.spent_on || '').localeCompare(b.spent_on || '') || (a.created_at || '').localeCompare(b.created_at || ''));
  const due = items.reduce((s, e) => s + owedOf(e), 0);
  if (!due) return;
  const v = prompt(`${name} ko kitna diya? (₹)\nBaaki ${rs(due)} hai. Pura diya to ${num(due)} hi rehne do.`, num(due));
  if (v === null) return;
  let left = num(v);
  if (left <= 0 || left > due + 0.009) return toast(`1 se ${rs(due)} ke beech daalo`);
  const paidNow = left;
  try {
    for (const e of items) {
      if (left <= 0) break;
      const take = Math.min(left, owedOf(e));
      check(await db(state.code).from('hm_expenses').update({ repaid: num(num(e.repaid) + take) }).eq('id', e.id));
      left = num(left - take);
    }
    toast(paidNow >= due - 0.009 ? `${name} ka pura hisaab chukta` : `${rs(paidNow)} diya, ${rs(due - paidNow)} abhi baaki`);
    refresh();
  } catch (err) { toast('Error: ' + err.message); refresh(); }
}

// Summary: deposit jo wapas aana baaki hai
function depositCard(d, c) {
  const deps = d.expenses.filter(isDep);
  if (!deps.length) return '';
  const open = deps.filter(e => !depBack(e));
  return `<div class="card">
    <div class="row between"><div class="bold">🔁 Deposit</div>
      ${open.length ? `<b class="amber">${rs(c.depPending)} wapas aana baaki</b>` : '<b class="green">✅ Sab wapas mil gaya</b>'}</div>
    ${open.map(e => `<div class="row between" style="padding:8px 0;border-top:1px solid var(--line);margin-top:6px">
      <div class="grow"><div class="ellipsis" data-notr>${esc(e.title)}</div><div class="muted">${(e.event || '').trim() ? esc(e.event) + ' · ' : ''}${fmtDate(e.spent_on)}</div></div>
      <b style="margin-right:8px">${rs(e.amount)}</b><button class="btn sm primary" data-depback="${e.id}">Mil gaya</button></div>`).join('')}
    ${c.depReturned || c.depLost ? `<div class="muted" style="margin-top:8px">Wapas mila ${rs(c.depReturned)}${c.depLost ? ` · Kata (kharche me juda) ${rs(c.depLost)}` : ''}</div>` : ''}
  </div>`;
}

// Deposit wapas mila: kitna mila puchho, baaki apne aap kharcha ban jata hai
async function depositBack(e) {
  const v = prompt(`Kitna wapas mila? (₹)\nPura mila to ${num(e.amount)} hi rehne do.`, num(e.amount));
  if (v === null) return;
  const back = num(v);
  if (back < 0 || back > num(e.amount)) return toast(`0 se ${rs(e.amount)} ke beech daalo`);
  try {
    check(await db(state.code).from('hm_expenses').update({ returned: back }).eq('id', e.id));
    closeModal();
    toast(back < num(e.amount) ? `${rs(back)} fund me juda, ${rs(num(e.amount) - back)} kharche me gaya` : `${rs(back)} fund me wapas juda`);
    refresh();
  } catch (err) { toast('Error: ' + err.message); }
}

// Summary me program-wise kharcha aur per member
function eventCard(c) {
  if (!multiDay(state.data.program)) return '';
  if (!c.events.length || (c.events.length === 1 && c.events[0].name === 'Bina program')) return '';
  return `<div class="card">
    <div class="bold" style="margin-bottom:8px">🎉 Program-wise kharcha</div>
    <div class="row between muted small" style="margin-bottom:4px"><span class="grow">Program</span><span style="width:90px;text-align:right">Kharcha</span><span style="width:90px;text-align:right">Per member</span></div>
    ${c.events.map(ev => `<div class="row between" style="padding:5px 0;border-top:1px solid var(--line)">
      <span class="grow ellipsis">${esc(ev.name)}</span><b style="width:90px;text-align:right">${rs(ev.total)}</b><span style="width:90px;text-align:right">${rs(ev.perPerson)}</span></div>`).join('')}
    <div class="row between bold" style="padding:6px 0 0;border-top:2px solid var(--line)">
      <span class="grow">Total</span><span style="width:90px;text-align:right">${rs(c.totalExp)}</span><span style="width:90px;text-align:right">${rs(c.perPerson)}</span></div>
    <div class="muted" style="margin-top:6px">Per member = program ka kharcha ÷ ${c.persons} members</div>
  </div>`;
}

// Kharcha tab: har program ka alag box
function eventGroups(c, list, row) {
  const groups = new Map();
  list.forEach(e => { const k = (e.event || '').trim() || 'Bina program'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); });
  const order = c.events.map(ev => ev.name).filter(k => groups.has(k));
  if (!multiDay(state.data.program)) return `<div class="list">${list.map(row).join('')}</div>`;
  if (order.length === 1 && order[0] === 'Bina program') return `<div class="list">${list.map(row).join('')}</div>`;
  return order.map(k => {
    const ev = c.events.find(x => x.name === k);
    return `<div class="floor">
      <div class="floor-head"><div class="grow"><div class="bold">${esc(k)}</div><div class="muted">${groups.get(k).length} entry · Per member ${rs(ev.perPerson)}</div></div>
        <div class="floor-status">${rs(ev.total)}</div></div>
      <div class="list">${groups.get(k).map(row).join('')}</div>
    </div>`;
  }).join('');
}

// Friends: sabse hissa lo, jisne zyada kharcha kiya use wapas do
function friendsSettle(d, c) {
  const left = c.rows.filter(r => Math.abs(r.net) > 0.009).length;
  return `<div class="card">
    <div class="bold">💰 Collection aur wapsi</div>
    <p class="muted small" style="margin:4px 0 8px">Har vyakti ka hissa ${rs(c.perPerson)}${isTrip(state.data.program) ? ' (couple ka double)' : ''}. Jisne kam kharcha kiya usse paisa lo, jisne zyada kiya use wapas do.</p>
    ${c.rows.map(r => `<div class="row between" style="padding:8px 0;border-top:1px solid var(--line)">
      <div class="grow"><div class="bold ellipsis" data-notr>${esc(r.label)}</div>
        <div class="muted">${isTrip(state.data.program) ? `${faces(r.people)} · ` : ''}Kharcha ${rs(r.spent)} · Hissa ${rs(r.share)}${r.paid ? ` · ${r.paid > 0 ? 'Diya' : 'Wapas mila'} ${rs(Math.abs(r.paid))}` : ''}</div></div>
      ${r.net < -0.009 ? `<b class="red" style="margin-right:8px">${rs(-r.net)} lena</b><button class="btn sm primary" data-settle="${r.id}">Le liya</button>`
        : r.net > 0.009 ? `<b class="green" style="margin-right:8px">${rs(r.net)} dena</b><button class="btn sm primary" data-settle="${r.id}">De diya</button>`
        : '<span class="green small">✅ Barabar</span>'}</div>`).join('')}
    <div class="muted" style="margin-top:8px">${left ? `${left} dost ka hisaab baaki · Abhi haath me ${rs(c.balance)}` : '🎉 Sabka hisaab ho gaya'}</div>
  </div>`;
}

// Le liya: dost ne collection me diya. De diya: dost ko wapas diya (minus me likha jata hai)
async function friendSettle(id) {
  const c = calc(state.data), r = c.rows.find(x => x.id === id), m = state.data.members.find(x => x.id === id);
  if (!r || Math.abs(r.net) < 0.01) return;
  const due = Math.abs(r.net), take = r.net < 0;
  const v = prompt(`${r.label} ${take ? 'se kitna liya' : 'ko kitna diya'}? (₹)`, num(due));
  if (v === null) return;
  const amt = num(v);
  if (amt <= 0 || amt > due + 0.009) return toast(`1 se ${rs(due)} ke beech daalo`);
  try {
    check(await db(state.code).from('hm_members').update({ paid: num(num(m.paid) + (take ? amt : -amt)) }).eq('id', id));
    toast(amt >= due - 0.009 ? `${r.label} ka hisaab barabar` : `${rs(due - amt)} abhi baaki`);
    refresh();
  } catch (err) { toast('Error: ' + err.message); }
}

function hisaabView(d, c) {
  const p = d.program, unit = p.type === 'flat' ? 'flat' : 'member';
  if (!c.n) return `<div class="card empty">Pehle ${unit}s add karo.</div>`;
  return `
    <div class="card">
      <div class="row between"><span>Total kharcha</span><b>${rs(c.totalExp)}</b></div>
      <div class="row between"><span>${c.persons} members me baanta</span><b>${rs(c.perPerson)} / member</b></div>
      <div class="row between"><span>Collector ke haath me</span><b>${rs(c.balance)}</b></div>
      ${c.owed || c.depPending ? `<div class="row between"><span>Sab chukane ke baad bachega</span><b class="${c.finalBal < 0 ? 'red' : 'green'}">${rs(c.finalBal)}</b></div>` : ''}
    </div>
    ${isGroup(p) ? friendsSettle(d, c) : ''}
    <div class="bold" style="margin:4px 2px 8px">🤝 ${isGroup(p) ? 'Ya seedha aapas me: kaun kisko de' : 'Kaun kisko de'}</div>
    ${c.settlements.length ? `<div class="list" style="margin-bottom:14px">${c.settlements.map(s => `
      <div class="settle"><div class="grow"><b>${esc(s.from)}</b> <span class="muted">➜</span> <b>${esc(s.to)}</b></div><div class="amt">${rs(s.amt)}</div></div>`).join('')}</div>`
      : `<div class="card empty" style="padding:16px">Sab barabar hai, kisi ko kuchh nahi dena 🎉</div>`}
    ${isGroup(p) ? '' : `<div class="bold" style="margin:4px 2px 8px">Har ${unit} ka hisaab</div>
    <div class="list">${c.rows.map(r => `
      <div class="item" style="cursor:default">
        <div class="grow"><div class="bold ellipsis" data-notr>${esc(r.label)}</div>
          <div class="muted">${p.type === 'flat' ? `${faces(r.people)} · ` : ''}Diya ${rs(r.paid)}${r.spent ? ` + kharcha ${rs(r.spent)}` : ''} · Hissa ${rs(r.share)}</div></div>
        <div class="amt ${r.net > 0.009 ? 'green' : r.net < -0.009 ? 'red' : ''}">${r.net > 0.009 ? 'Lena ' + rs(r.net) : r.net < -0.009 ? 'Dena ' + rs(-r.net) : 'Barabar'}</div>
      </div>`).join('')}</div>`}`;
}

function bindProgram() {
  const p = state.data.program;
  const q = $('#q');
  if (q) q.oninput = () => { state.q = q.value; renderProgram(); const n = $('#q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
  app.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { state.filter = b.dataset.f; renderProgram(); });
  app.querySelectorAll('[data-settle]').forEach(b => b.onclick = () => friendSettle(b.dataset.settle));
  app.querySelectorAll('[data-repay]').forEach(b => b.onclick = () => repay(b.dataset.repay));
  app.querySelectorAll('[data-depback]').forEach(b => b.onclick = () => depositBack(state.data.expenses.find(e => e.id === b.dataset.depback)));
  app.querySelectorAll('[data-ev]').forEach(b => b.onclick = () => { state.ev = b.dataset.ev; renderProgram(); });
  app.querySelectorAll('[data-mid]').forEach(el => el.onclick = () => memberForm(state.data.members.find(m => m.id === el.dataset.mid)));
  app.querySelectorAll('[data-eid]').forEach(el => el.onclick = () => expenseForm(state.data.expenses.find(e => e.id === el.dataset.eid)));
  const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
  on('bulkBtn', bulkForm);
  on('roundBtn', roundForm);
  on('roundBtn2', roundForm);
  on('copyCode', async () => { try { await navigator.clipboard.writeText(p.code); toast('Code copy ho gaya'); } catch { toast('Code: ' + p.code); } });
  on('editProg', () => programForm(p));
  on('shareLink', async () => {
    const url = `${location.origin}${location.pathname}#p=${p.code}`;
    const text = `${p.name} ka hisaab HisaabMitra me dekho:`;
    try {
      if (navigator.share) await navigator.share({ title: p.name, text, url });
      else { await navigator.clipboard.writeText(`${text} ${url}`); toast('Link copy ho gaya, WhatsApp par bhej do'); }
    } catch (e) { if (e.name !== 'AbortError') { try { await navigator.clipboard.writeText(url); toast('Link copy ho gaya'); } catch { prompt('Ye link copy karo:', url); } } }
  });
  on('forgetProg', async () => {
    if (!await confirmBox('Program sirf is phone ki list se hatega. Online data rahega, share code se dobara khol sakte ho. Pakka?')) return;
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
    ${isFlat || isTrip(p) ? `<label>${isFlat ? 'Kitne member (log)' : 'Kitne log (couple = 2)'}</label><input type="number" id="mPeople" inputmode="numeric" min="1" step="1" value="${m ? people(m) : 1}">` : ''}
    <label>Kitna diya (₹)</label>
    <input type="number" id="mPaid" inputmode="decimal" ${isFlat ? 'min="0"' : ''} value="${m ? num(m.paid) || '' : ''}" placeholder="0">
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
  on('mFull', () => $('#mPaid').value = num(fixed * ($('#mPeople') ? Math.max(1, parseInt($('#mPeople').value) || 1) : 1)));
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
      people: isFlat || isTrip(p) ? Math.max(1, parseInt($('#mPeople').value) || 1) : 1 };
    if (!row.name && !row.flat_no) return toast(isFlat ? 'Flat number daalo' : 'Naam daalo');
    if (isFlat && row.flat_no && state.data.members.some(x => x.id !== m?.id && flatKey(x.flat_no) === flatKey(row.flat_no)))
      return toast(`Flat ${row.flat_no} is program me pehle se hai`);
    $('#mSave').disabled = true;
    try {
      const c = db(p.code);
      if (m) check(await c.from('hm_members').update(row).eq('id', m.id));
      else check(await c.from('hm_members').insert({ ...row, program_id: p.id }));
      closeModal(); toast('Save ho gaya'); refresh();
    } catch (e) { $('#mSave').disabled = false; toast('Error: ' + e.message); }
  };
}

// "C-202-2" jaisa likha ho to flat C-202 aur 2 member. Flat number me koi digit hona zaroori hai.
// "c-202", "C 202", "C202" aur "C-202" ek hi flat maane jayenge
const flatKey = f => String(f || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const COMPACT =/^(.*\d.*?)\s*-\s*(\d{1,2})$/;

function parseBulk(text, isFlat, withCount) {
  const out = [];
  for (const line of text.split('\n').map(l => l.trim()).filter(Boolean)) {
    const parts = line.split(',').map(x => x.trim()).filter(Boolean);
    if (!isFlat && withCount) {
      // "Rahul & Neha, 2" -> naam, log
      let count = parts.length > 1 && /^\d+$/.test(parts[parts.length - 1]) ? Math.max(1, parseInt(parts.pop())) : 1;
      out.push({ name: parts.join(', '), flat_no: '', people: count });
      continue;
    }
    if (!isFlat) { parts.forEach(n => out.push({ name: n, flat_no: '', people: 1 })); continue; }
    // Ek line me comma se kai flats: "C-202-2, C-402-3, ..."
    if (parts.length > 1 && parts.every(x => COMPACT.test(x))) {
      parts.forEach(x => { const [, flat, n] = x.match(COMPACT); out.push({ flat_no: flat, name: '', people: Math.max(1, +n) }); });
      continue;
    }
    // Ek line me ek flat: "A-101, Patel, 4" ya "A-101, 4" ya "C-202-2"
    let count = 1;
    if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) count = Math.max(1, parseInt(parts.pop()));
    let [flat, ...rest] = parts;
    if (count === 1 && rest.length === 0 && COMPACT.test(flat)) { const m = flat.match(COMPACT); flat = m[1]; count = Math.max(1, +m[2]); }
    out.push({ flat_no: flat, name: rest.join(', '), people: count });
  }
  return out;
}

// Collection round: sabse ek saath paisa lo (per vyakti x log), jitni baar zarurat ho
function roundForm() {
  const d = state.data, p = d.program, last = store.get('hm_round_' + p.id, '');
  openModal(`<h2>💰 Collection lo</h2>
    <p class="muted">Har vyakti se kitna lena hai? Couple se apne aap double. Kisi ka alag ho to neeche badal do.</p>
    <label>Har vyakti se (₹)</label><input type="number" id="rPer" inputmode="decimal" min="0" value="${last}" placeholder="Jaise 2000">
    <div class="list" style="margin-top:10px">${d.members.map(m => `<div class="item" style="cursor:default">
      <div class="grow"><div class="bold ellipsis" data-notr>${esc(memberLabel(p, m))}</div><div class="muted">${faces(people(m))} · ab tak ${rs(m.paid)}</div></div>
      <input type="number" inputmode="decimal" min="0" data-rm="${m.id}" data-ppl="${people(m)}" style="width:110px;text-align:right" placeholder="0"></div>`).join('')}</div>
    <div class="muted" id="rTot" style="margin-top:8px"></div>
    <div class="actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="rSave">Save</button></div>`);
  const ins = [...$('#sheet').querySelectorAll('[data-rm]')];
  const total = () => { $('#rTot').innerHTML = `Is round me kul: <b>${rs(ins.reduce((s, i) => s + num(i.value), 0))}</b>`; };
  const fill = () => { const v = num($('#rPer').value); ins.forEach(i => i.value = v ? num(v * +i.dataset.ppl) : ''); total(); };
  $('#rPer').oninput = fill; ins.forEach(i => i.oninput = total);
  if (last) fill(); $('#rPer').focus();
  $('#rSave').onclick = async () => {
    const adds = ins.map(i => ({ m: d.members.find(x => x.id === i.dataset.rm), amt: num(i.value) })).filter(x => x.amt > 0);
    if (!adds.length) return toast('Kisi ka amount daalo');
    $('#rSave').disabled = true;
    try {
      await Promise.all(adds.map(x => db(p.code).from('hm_members').update({ paid: num(num(x.m.paid) + x.amt) }).eq('id', x.m.id).then(check)));
      store.set('hm_round_' + p.id, $('#rPer').value);
      closeModal(); toast(`${rs(adds.reduce((s, x) => s + x.amt, 0))} collection juda`); refresh();
    } catch (e) { $('#rSave').disabled = false; toast('Error: ' + e.message); refresh(); }
  };
}

function bulkForm() {
  const p = state.data.program, isFlat = p.type === 'flat';
  openModal(`<h2>Ek saath add karo</h2>
    <p class="muted">${isFlat ? 'Har line me ek flat: <b>Flat, Naam, Kitne member</b>, jaise <b>A-101, Sharma ji, 4</b>.<br>Ya ek hi line me comma se: <b>C-202-2, C-402-3, C-602-4</b> (aakhri number = members).' : isTrip(p) ? 'Har line me ek couple / group: <b>Naam, Kitne log</b>, jaise <b>Rahul &amp; Neha, 2</b>.' : 'Har line me ek naam, ya comma se alag karke.'}</p>
    <textarea id="bulk" rows="8" placeholder="${isFlat ? 'C-202-2, C-402-3, C-602-4\nya\nA-101, Sharma ji, 4' : isTrip(p) ? 'Rahul & Neha, 2\nAmit & Pooja, 2\nSandeep, 1' : 'Rahul\nAmit\nPriya'}"></textarea>
    <div id="bPrev" class="muted" style="margin-top:8px"></div>
    <div class="actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="bSave">Add karo</button></div>`);
  const preview = () => {
    const rows = parseBulk($('#bulk').value, isFlat, isTrip(p));
    const { fresh, dups } = splitDups(rows);
    if (!rows.length) return $('#bPrev').innerHTML = '';
    const total = fresh.reduce((s, r) => s + r.people, 0);
    $('#bPrev').innerHTML = (fresh.length ? `<b>${fresh.length} ${isFlat ? 'flats' : 'members'}${isFlat || isTrip(p) ? `, ${total} log` : ''}</b> add honge:<br>` +
      fresh.map(r => esc(isFlat ? `${r.flat_no}${r.name ? ' (' + r.name + ')' : ''} 👥${r.people}` : isTrip(p) ? `${r.name} 👥${r.people}` : r.name)).join(' · ') : '') +
      (dups.length ? `<div class="red" style="margin-top:6px">⚠️ Repeat flat, add nahi honge: ${esc(dups.join(', '))}</div>` : '');
  };
  // Flat number program me pehle se ho, ya list me do baar likha ho, to use chhod do
  const splitDups = rows => {
    if (!isFlat) return { fresh: rows, dups: [] };
    const seen = new Set(state.data.members.map(m => flatKey(m.flat_no)));
    const fresh = [], dups = [];
    rows.forEach(r => { const k = flatKey(r.flat_no); if (seen.has(k)) dups.push(r.flat_no); else { seen.add(k); fresh.push(r); } });
    return { fresh, dups };
  };
  $('#bulk').oninput = preview;
  $('#bSave').onclick = async () => {
    const { fresh, dups } = splitDups(parseBulk($('#bulk').value, isFlat, isTrip(p)));
    const rows = fresh.map(r => ({ ...r, program_id: p.id, paid: 0 }));
    if (!rows.length) return toast(dups.length ? 'Ye sab flats pehle se hain' : 'Kuchh likho');
    $('#bSave').disabled = true;
    try {
      check(await db(p.code).from('hm_members').insert(rows)); closeModal();
      toast(`${rows.length} add ho gaye${dups.length ? `, ${dups.length} repeat chhod diye` : ''}`); refresh();
    }
    catch (e) { $('#bSave').disabled = false; toast('Error: ' + e.message); }
  };
}

// ---------- expense form ----------
function expenseForm(e) {
  const d = state.data, p = d.program;
  openModal(`<h2>${e ? 'Kharcha edit' : 'Naya kharcha'}</h2>
    ${multiDay(p) ? (() => {
      const evs = [...new Set([...dayNames(p), ...d.expenses.map(x => (x.event || '').trim()).filter(Boolean)])];
      const cur = e ? (e.event || '') : (state.lastEv && evs.includes(state.lastEv) ? state.lastEv : evs[0]);
      return `<label>Kis din / program ka</label>
        <div class="chips" style="margin-bottom:0">${evs.map(x => `<button type="button" class="chip ${x === cur ? 'active' : ''}" data-pick="${esc(x)}">${esc(x)}</button>`).join('')}</div>
        <input type="hidden" id="eEvent" value="${esc(cur)}">`;
    })() : `<input type="hidden" id="eEvent" value="${esc(e?.event || '')}">`}
    <label>Amount (₹)</label><input type="number" id="eAmt" inputmode="decimal" min="0" value="${e ? num(e.amount) : ''}">
    <label class="row" style="gap:8px;color:var(--text);margin-top:12px"><input type="checkbox" id="eDep" ${e?.is_deposit ? 'checked' : ''} style="width:20px;height:20px">
      🔁 Ye deposit hai (wapas milega)</label>
    ${e?.is_deposit ? `<div class="card" style="margin:8px 0 0;padding:10px">${depBack(e)
      ? `<div class="row between"><span class="green">✅ Wapas mila ${rs(e.returned)}</span><button type="button" class="btn sm" id="eUnback">Wapas nahi mila</button></div>`
      : `<div class="row between"><span class="amber">Wapas aana baaki</span><button type="button" class="btn sm primary" id="eBack">✅ Mil gaya</button></div>`}</div>` : ''}
    <label>Kis cheez ka</label><input type="text" id="eTitle" placeholder="Jaise Tent, Prasad, Petrol" value="${esc(e?.title)}">
    <label>Date</label><input type="date" id="eDate" value="${e?.spent_on || today()}">
    ${isGroup(p) ? (() => {
      // Friends: jo dost ne kharida, uska naam chuno (baad me hisaab me uska kharcha judta hai)
      const cur = e ? (e.paid_by || '') : (state.lastPayer ?? (d.members[0]?.id || ''));
      return `<div id="ePaidBox" class="${e?.is_deposit ? 'hidden' : ''}"><label>Kisne kharcha kiya (paisa kisne diya)</label>
        <div class="chips" style="margin-bottom:0">${d.members.map(m => `<button type="button" class="chip ${cur === m.id ? 'active' : ''}" data-buyer="${m.id}">${esc(memberLabel(p, m))}</button>`).join('')}
          <button type="button" class="chip ${cur === '' ? 'active' : ''}" data-buyer="">💰 Collection se</button></div>
        <input type="hidden" id="eBuyer" value="${cur}">
        ${d.members.length ? '' : '<p class="muted small">Pehle Members tab me dost add karo.</p>'}</div>`;
    })() : `
    <div id="ePaidBox" class="${e?.is_deposit ? 'hidden' : ''}"><label>Paisa kisne diya</label>
      <div class="seg"><button type="button" class="btn ${!payer(e || {}) ? 'primary' : ''}" data-who="fund">💰 Fund se (maine)</button>
        <button type="button" class="btn ${payer(e || {}) ? 'primary' : ''}" data-who="other">🙋 Kisi aur ne</button></div>
      <div id="ePayerBox" class="${payer(e || {}) ? '' : 'hidden'}">
        <label>Kisne diya (naam / flat)</label>
        <input type="text" id="ePayer" list="payerList" placeholder="Jaise Rameshbhai C-402" value="${esc(payer(e || {}))}">
        <datalist id="payerList">${[...new Set([...d.expenses.map(payer).filter(Boolean), ...d.members.map(m => memberLabel(p, m))])].map(x => `<option value="${esc(x)}">`).join('')}</datalist>
        <p class="muted small" style="margin:6px 0 0">Ye paisa use lautana hai. Summary me "Logon ko dena baaki" me dikhega.</p>
        ${e && payer(e) && num(e.repaid) > 0 ? `<p class="small" style="margin:6px 0 0">Ab tak diya: <b>${rs(e.repaid)}</b> · Baaki: <b class="${owedOf(e) ? 'red' : 'green'}">${rs(owedOf(e))}</b></p>` : ''}
      </div></div>`}
    <label>Bill photo (optional)</label>
    ${e?.photo_url ? `<div class="row" style="margin-bottom:6px"><a href="${esc(e.photo_url)}" target="_blank" rel="noopener"><img class="thumb" src="${esc(e.photo_url)}" alt="Bill"></a>
      <label class="small" style="margin:0"><input type="checkbox" id="eRmPhoto"> Photo hatao</label></div>` : ''}
    <input type="file" id="ePhoto" accept="image/*">
    <div class="actions">
      ${e ? `<button class="btn danger" id="eDel">Delete</button>` : `<button class="btn" onclick="closeModal()">Cancel</button>`}
      <button class="btn primary" id="eSave">Save</button>
    </div>`);
  $('#eDep').onchange = () => $('#ePaidBox').classList.toggle('hidden', $('#eDep').checked);
  let who = payer(e || {}) ? 'other' : 'fund';
  $('#sheet').querySelectorAll('[data-buyer]').forEach(b => b.onclick = () => {
    $('#eBuyer').value = b.dataset.buyer;
    $('#sheet').querySelectorAll('[data-buyer]').forEach(x => x.classList.toggle('active', x === b));
  });
  $('#sheet').querySelectorAll('[data-who]').forEach(b => b.onclick = () => {
    who = b.dataset.who;
    $('#sheet').querySelectorAll('[data-who]').forEach(x => x.classList.toggle('primary', x === b));
    $('#ePayerBox').classList.toggle('hidden', who !== 'other');
    if (who === 'other') $('#ePayer').focus();
  });
  if ($('#eBack')) $('#eBack').onclick = () => depositBack(e);
  if ($('#eUnback')) $('#eUnback').onclick = async () => {
    try { check(await db(p.code).from('hm_expenses').update({ returned: null }).eq('id', e.id)); closeModal(); toast('Deposit dobara baaki me'); refresh(); }
    catch (err) { toast('Error: ' + err.message); }
  };
  $('#sheet').querySelectorAll('[data-pick]').forEach(b => b.onclick = () => {
    $('#eEvent').value = b.dataset.pick;
    $('#sheet').querySelectorAll('[data-pick]').forEach(x => x.classList.toggle('active', x === b));
  });
  if (!e) $('#eAmt').focus();
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
      const event = $('#eEvent').value.trim();
      state.lastEv = event;
      const is_deposit = $('#eDep').checked;
      const payer_name = !is_deposit && who === 'other' ? $('#ePayer').value.trim() : '';
      if (!is_deposit && who === 'other' && !payer_name) { btn.disabled = false; btn.textContent = 'Save'; return toast('Kisne paisa diya, naam likho'); }
      const buyer = isGroup(p) && !is_deposit ? ($('#eBuyer').value || null) : null;
      if (isGroup(p)) state.lastPayer = $('#eBuyer')?.value ?? '';
      const row = { title, amount, event, is_deposit, payer_name, repaid: payer_name ? Math.min(num(e?.repaid), amount) : 0,
        spent_on: $('#eDate').value || today(), paid_by: buyer, photo_url };
      if (!is_deposit) row.returned = null;
      else if (e?.returned != null && num(e.returned) > amount) row.returned = amount;
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
      ['Program', p.name], ['Type', (TYPE_LABEL[p.type] || '').replace(/^\S+ /, '')],
      ...(p.type === 'flat' ? [['Total flats', c.n]] : []), ['Total members', c.persons], ['Total collection', num(c.collected)],
      ...(c.fixed > 0 ? [['Fixed amount / member', c.fixed], ['Expected total', num(c.expected)], ['Pending', num(c.pending)]] : []),
      ['Total kharcha', num(c.totalExp)], ...(c.depPending || c.depReturned || c.depLost ? [['Deposit wapas aana baaki', num(c.depPending)], ['Deposit wapas mila', num(c.depReturned)]] : []), ['Fund se kharcha', num(c.fundExp)], ['Members ne khud kiya', num(c.personalExp)],
      ['Per member kharcha', num(c.perPerson)], ['Collector ke haath me', num(c.balance)], ...(c.owed ? [['Logon ko dena baaki', num(c.owed)]] : []), ['Sab chukane ke baad bachega', num(c.finalBal)],
    ],
    members: [[p.type === 'flat' ? 'Flat' : 'Naam', 'Naam', 'Members', 'Diya (₹)', 'Status'],
      ...d.members.map(m => [m.flat_no || m.name, p.type === 'flat' ? m.name : '', people(m), num(m.paid), status[memberStatus(p, m)]])],
    expenses: [['Program', 'Date', 'Kharcha', 'Amount (₹)', 'Deposit', 'Kisne diya', 'Dena baaki (₹)', 'Bill photo'],
      ...d.expenses.map(e => [(e.event || '').trim() || 'Bina program', e.spent_on, e.title, num(e.amount),
        isDep(e) ? (depBack(e) ? `Wapas mila ${num(e.returned)}` : 'Wapas aana baaki') : '', payer(e) || (e.paid_by ? byId[e.paid_by] || '' : 'Fund'), num(owedOf(e)), e.photo_url || ''])],
    hisaab: [['Member', 'Log', 'Diya (₹)', 'Khud kharcha (₹)', 'Hissa (₹)', 'Lena(+)/Dena(−) (₹)'],
      ...c.rows.map(r => [r.label, r.people, num(r.paid), num(r.spent), num(r.share), num(r.net)])],
    events: [['Program', 'Kharcha (₹)', 'Per member (₹)'], ...c.events.map(ev => [ev.name, num(ev.total), num(ev.perPerson)])],
    settle: [['Kaun', 'Kisko', 'Kitna (₹)'], ...c.settlements.map(s => [s.from, s.to, num(s.amt)])],
  };
}

function exportPdf() {
  const t = reportTables();
  const table = rows => `<table><thead><tr>${rows[0].map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map(r => `<tr>${r.map(v => `<td>${esc(typeof v === 'number' ? rs(v) : (String(v).startsWith('http') ? 'Haan' : v))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  $('#printArea').innerHTML = `<h1>${esc(t.p.name)}</h1><div>HisaabMitra · ${new Date().toLocaleDateString('en-IN')}</div>
    <h2>Summary</h2><table><tbody>${t.summary.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(typeof v === 'number' && !['Total members', 'Total flats'].includes(k) ? rs(v) : v)}</td></tr>`).join('')}</tbody></table>
    <h2>Collection</h2>${table(t.members)}
    ${multiDay(t.p) ? `<h2>Program-wise kharcha</h2>${table(t.events)}` : ''}
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
  if (multiDay(t.p)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(t.events), 'Program-wise');
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
    if (!SPACE) throw new Error('Pehle space banao');
    const prog = check(await c.from('hm_programs').insert({
      code, name: data.program.name + ' (restore)', type: data.program.type, fixed_amount: num(data.program.fixed_amount), days: daysOf(data.program), is_private: !!data.program.is_private, space: SPACE,
    }).select().single());
    const idMap = {};
    for (const m of data.members || []) {
      const nm = check(await c.from('hm_members').insert({ program_id: prog.id, name: m.name || '', flat_no: m.flat_no || '', people: people(m), paid: num(m.paid) }).select('id').single());
      idMap[m.id] = nm.id;
    }
    const ex = (data.expenses || []).map(e => ({
      program_id: prog.id, title: e.title, event: e.event || '', is_deposit: !!e.is_deposit, returned: e.returned ?? null, payer_name: e.payer_name || '', repaid: num(e.repaid), amount: num(e.amount), spent_on: e.spent_on || today(),
      paid_by: e.paid_by ? idMap[e.paid_by] || null : null, photo_url: e.photo_url || null,
    }));
    if (ex.length) check(await c.from('hm_expenses').insert(ex));
    saveMyProgram(prog); toast('Restore ho gaya!'); openProgram(code);
  } catch (e) { toast('Restore nahi hua: ' + e.message); }
}

// ---------- settings & app lock ----------
// Lock sirf is phone/browser par lagta hai. PIN ka hash hi save hota hai, asli PIN nahi.
const lock = {
  get pinHash() { return store.get('hm_pin', null); },
  get bioId() { return store.get('hm_bio', null); },
  get on() { return !!this.pinHash; },
};
const unstore = k => { try { localStorage.removeItem(k); } catch {} };
async function hashPin(pin) {
  let salt = store.get('hm_pin_salt', null);
  if (!salt) { salt = crypto.randomUUID(); store.set('hm_pin_salt', salt); }
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function bioAvailable() {
  try { return !!window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch { return false; }
}
// Phone ka fingerprint/face lock (WebAuthn) use hota hai. Fingerprint data phone se bahar nahi jata.
async function bioRegister() {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: { name: 'HisaabMitra' },
    user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'hisaabmitra', displayName: 'HisaabMitra' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
    timeout: 60000,
  } });
  store.set('hm_bio', b64(cred.rawId));
}
async function bioCheck() {
  await navigator.credentials.get({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    allowCredentials: [{ type: 'public-key', id: unb64(lock.bioId) }],
    userVerification: 'required', timeout: 60000,
  } });
}

function askPin(title, hint) {
  return new Promise(resolve => {
    openModal(`<h2>${title}</h2>${hint ? `<p class="muted">${hint}</p>` : ''}
      <input type="password" id="pinIn" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" placeholder="4 se 6 number" style="font-size:22px;letter-spacing:8px;text-align:center">
      <div class="actions"><button class="btn" id="pinNo">Cancel</button><button class="btn primary" id="pinOk">OK</button></div>`);
    const done = v => { closeModal(); resolve(v); };
    $('#pinIn').focus();
    $('#pinNo').onclick = () => done(null);
    $('#pinOk').onclick = () => { const v = $('#pinIn').value.trim(); if (!/^\d{4,6}$/.test(v)) return toast('4 se 6 number ka PIN daalo'); done(v); };
    $('#pinIn').onkeydown = e => { if (e.key === 'Enter') $('#pinOk').click(); };
  });
}

async function openSettings() {
  const bioOk = await bioAvailable();
  const dark = document.documentElement.dataset.theme === 'dark';
  openModal(`<h2>⚙️ Settings</h2>
    <div class="bold" style="margin-top:12px">🔒 App lock</div>
    <p class="muted">App kholte waqt PIN ya fingerprint maangega. Sirf is phone/browser par lagta hai.</p>
    ${lock.on ? `
      <div class="row between" style="padding:8px 0"><span>PIN lock</span><b class="green">On</b></div>
      <div class="btns"><button class="btn sm" id="sChange">PIN badlo</button><button class="btn sm danger" id="sOff">Lock hatao</button></div>
      <div class="row between" style="padding:12px 0 4px"><span>👆 Fingerprint / Face se kholo</span>
        ${bioOk ? `<button class="btn sm ${lock.bioId ? 'danger' : 'primary'}" id="sBio">${lock.bioId ? 'Band karo' : 'Chalu karo'}</button>` : '<span class="muted small">Is device par nahi hai</span>'}</div>`
    : `<button class="btn primary block" id="sSet">PIN set karo</button>
       <p class="muted small" style="margin-top:6px">Fingerprint / Face lock ke liye pehle PIN set karo. Fingerprint na chale to PIN kaam aayega.</p>`}
    <div class="bold" style="margin-top:16px">🎨 Theme</div>
    <div class="seg" style="margin-top:6px"><button class="btn ${!dark ? 'primary' : ''}" data-th="light">☀️ Light</button><button class="btn ${dark ? 'primary' : ''}" data-th="dark">🌙 Dark</button></div>
    <div class="bold" style="margin-top:16px">🌐 Language / भाषा / ભાષા</div>
    <div class="seg" style="margin-top:6px">${Object.entries(LANGS).map(([k, l]) => `<button class="btn ${LANG === k ? 'primary' : ''}" data-lang="${k}" data-notr>${l}</button>`).join('')}</div>
    <div class="bold" style="margin-top:16px">💾 Backup restore</div>
    <p class="muted" style="margin:4px 0 8px">Kisi program ki backup file (.json) se uski nayi copy banao. Backup program ke Summary me 💾 Backup se milta hai.</p>
    <button class="btn block" id="sRestore">📂 Backup file chuno</button>
    <input type="file" id="restoreFile" accept=".json,application/json" hidden>
    <div class="actions"><button class="btn block" onclick="closeModal()">Band karo</button></div>`);
  const on = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
  $('#sheet').querySelectorAll('[data-lang]').forEach(b => b.onclick = () => {
    if (b.dataset.lang === LANG) return;
    store.set('hm_lang', b.dataset.lang); location.reload();
  });
  on('sRestore', () => $('#restoreFile').click());
  $('#restoreFile').onchange = e => { closeModal(); restoreBackup(e.target.files[0]); };
  $('#sheet').querySelectorAll('[data-th]').forEach(b => b.onclick = () => { store.set('hm_theme', b.dataset.th); applyTheme(b.dataset.th); openSettings(); });
  const setNew = async () => {
    const a = await askPin('Naya PIN', '4 se 6 number ka PIN chuno.'); if (!a) return openSettings();
    const b = await askPin('PIN dobara daalo'); if (!b) return openSettings();
    if (a !== b) { toast('Dono PIN alag hain, dobara try karo'); return openSettings(); }
    store.set('hm_pin', await hashPin(a)); session.ok = true; toast('PIN set ho gaya'); openSettings();
  };
  const verifyOld = async () => {
    const o = await askPin('Purana PIN daalo');
    if (o && await hashPin(o) === lock.pinHash) return true;
    if (o) toast('Galat PIN');
    openSettings(); return false;
  };
  on('sSet', setNew);
  on('sChange', async () => { if (await verifyOld()) setNew(); });
  on('sOff', async () => {
    if (!await verifyOld()) return;
    unstore('hm_pin'); unstore('hm_bio'); toast('Lock hata diya'); openSettings();
  });
  on('sBio', async () => {
    if (lock.bioId) { unstore('hm_bio'); toast('Fingerprint lock band'); return openSettings(); }
    try { await bioRegister(); toast('Fingerprint / Face lock chalu'); }
    catch (e) { toast('Chalu nahi hua: ' + (e.name === 'NotAllowedError' ? 'cancel ho gaya' : e.message)); }
    openSettings();
  });
}
$('#settingsBtn').onclick = openSettings;

// Lock screen: sab kuchh dhak deta hai jab tak PIN / fingerprint sahi na ho
// Unlock is tab/app session tak yaad rehta hai: reload par PIN nahi, app band karke kholne par maangega
const session = {
  get ok() { try { return sessionStorage.getItem('hm_unlocked') === '1'; } catch { return false; } },
  set ok(v) { try { v ? sessionStorage.setItem('hm_unlocked', '1') : sessionStorage.removeItem('hm_unlocked'); } catch {} },
};
function showLock(force) {
  if (!lock.on || $('#lockScreen') || (!force && session.ok)) return;
  session.ok = false;
  const el = document.createElement('div');
  el.id = 'lockScreen'; el.className = 'lock';
  el.innerHTML = `<div class="lock-box">
    <div style="font-size:44px">🔒</div><h2>HisaabMitra</h2>
    <input type="password" id="lkPin" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" placeholder="PIN">
    <button class="btn primary block" id="lkGo">Kholo</button>
    ${lock.bioId ? `<button class="btn block" id="lkBio" style="margin-top:8px">👆 Fingerprint / Face se kholo</button>` : ''}
    <div id="lkMsg" class="red small" style="min-height:20px;margin-top:8px"></div></div>`;
  document.body.appendChild(el);
  const unlock = () => { el.remove(); session.ok = true; };
  const tryPin = async () => {
    const v = $('#lkPin').value.trim(); if (!v) return;
    if (await hashPin(v) === lock.pinHash) unlock();
    else if (v.length >= 6 || $('#lkGo') === document.activeElement) { $('#lkMsg').textContent = 'Galat PIN'; $('#lkPin').value = ''; $('#lkPin').focus(); }
  };
  const tryBio = async () => {
    try { await bioCheck(); unlock(); }
    catch { $('#lkMsg').textContent = 'Fingerprint nahi chala, PIN daalo'; $('#lkPin').focus(); }
  };
  $('#lkGo').onclick = async () => { const v = $('#lkPin').value.trim(); if (await hashPin(v) === lock.pinHash) unlock(); else { $('#lkMsg').textContent = 'Galat PIN'; $('#lkPin').value = ''; $('#lkPin').focus(); } };
  $('#lkPin').oninput = () => { if ($('#lkPin').value.length >= 4) tryPin(); };
  $('#lkPin').onkeydown = e => { if (e.key === 'Enter') $('#lkGo').click(); };
  if (lock.bioId) { $('#lkBio').onclick = tryBio; tryBio(); } else $('#lkPin').focus();
}
// App 1 minute se zyada background me rahe to dobara lock
document.addEventListener('visibilitychange', () => {
  if (document.hidden) state.hiddenAt = Date.now();
  else if (state.hiddenAt && Date.now() - state.hiddenAt > 60000) showLock(true);
});

// ---------- start ----------
i18n.start();
showLock();
const spaceFromLink = location.hash.match(/space=([A-Z0-9]+)/i)?.[1];
if (spaceFromLink) {
  // Space ka link khola
  if (spaces.list().some(x => x.code === spaceFromLink.toUpperCase())) { store.set('hm_space', spaceFromLink.toUpperCase()); history.replaceState(null, '', location.pathname); location.reload(); }
  else setTimeout(() => joinSpace(spaceFromLink), 300);
} else if (!SPACE && myPrograms().length) {
  // Pehle se use kar rahe the: kisi khule program se apna space pehchano
  (async () => {
    for (const x of myPrograms()) {
      try {
        const r = await db(x.code).from('hm_programs').select('space,is_private').eq('code', x.code).maybeSingle();
        if (r.data?.space && !r.data.is_private) { spaces.use(r.data.space, 'Mera space'); return location.reload(); }
      } catch {}
    }
    startApp();
  })();
} else startApp();

function startApp() {
  const startRoute = readRoute();
  if (startRoute.code) openProgram(startRoute.code, null, startRoute.tab, true);
  else goHome();
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
