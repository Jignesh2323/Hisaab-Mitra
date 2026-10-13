// Language: app ka Hinglish text chuni hui bhasha me badal deta hai.
// Screen par jo bhi text aata hai (modal, toast, prompt bhi), use I18N_DICT se replace karta hai.
const LANGS = { hinglish: 'Hinglish', en: 'English', hi: 'हिंदी', gu: 'ગુજરાતી' };
const LANG = (() => { try { return JSON.parse(localStorage.getItem('hm_lang')) || 'hinglish'; } catch { return 'hinglish'; } })();

const i18n = (() => {
  const col = { en: 1, hi: 2, gu: 3 }[LANG];
  const dict = typeof I18N_DICT !== 'undefined' ? I18N_DICT : [];
  if (!col || !dict.length) return { tr: s => s, start() {} };

  const map = new Map();
  // Key ke aage-peeche ka space translation me bhi bana rahe ("Din 1" -> "દિવસ 1")
  const ws = (k, v) => k.match(/^\s*/)[0] + v.trim() + k.match(/\s*$/)[0];
  dict.forEach(r => { if (r[0] && r[col] && !map.has(r[0])) map.set(r[0], ws(r[0], r[col])); });
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Lambe phrase pehle. Shabd ke beech me match nahi hota (jaise "Din" se "Dinesh" nahi badlega).
  const keys = [...map.keys()].sort((a, b) => b.length - a.length);
  // Boundary sirf tab jab key letter se shuru/khatam ho (" se search…" jaise tukde bhi match hon)
  const pat = k => (/^[A-Za-z]/.test(k) ? '(?<![A-Za-z])' : '') + esc(k) + (/[A-Za-z]$/.test(k) ? '(?![A-Za-z])' : '');
  const re = new RegExp(keys.map(pat).join('|'), 'g');
  const tr = s => (s && /[A-Za-z]/.test(s)) ? s.replace(re, m => map.get(m) ?? m) : s;

  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'OPTION']);
  const ATTRS = ['placeholder', 'title', 'aria-label'];
  function walk(root) {
    if (root.nodeType === 3) { const t = tr(root.data); if (t !== root.data) root.data = t; return; }
    if (root.nodeType !== 1 || SKIP.has(root.tagName) || root.closest?.('[data-notr]')) {
      if (root.tagName === 'OPTION' || root.tagName === 'INPUT' || root.tagName === 'TEXTAREA') attrs(root);
      if (root.tagName === 'OPTION') root.textContent = tr(root.textContent);
      return;
    }
    attrs(root);
    root.querySelectorAll?.('[placeholder],[title],[aria-label],option').forEach(el => {
      attrs(el);
      if (el.tagName === 'OPTION') { const t = tr(el.textContent); if (t !== el.textContent) el.textContent = t; }
    });
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => (n.parentElement && (SKIP.has(n.parentElement.tagName) || n.parentElement.closest('[data-notr]'))) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach(n => { const t = tr(n.data); if (t !== n.data) n.data = t; });
  }
  function attrs(el) {
    ATTRS.forEach(a => { const v = el.getAttribute?.(a); if (v) { const t = tr(v); if (t !== v) el.setAttribute(a, t); } });
  }

  function start() {
    document.documentElement.lang = { en: 'en', hi: 'hi', gu: 'gu' }[LANG];
    const obs = new MutationObserver(muts => {
      obs.disconnect();
      muts.forEach(m => {
        if (m.type === 'characterData') walk(m.target);
        else m.addedNodes.forEach(walk);
      });
      obs.observe(document.body, opts);
    });
    const opts = { childList: true, subtree: true, characterData: true };
    walk(document.body);
    obs.observe(document.body, opts);
    // Browser ke prompt / confirm box ka text bhi
    const p = window.prompt.bind(window), c = window.confirm.bind(window);
    window.prompt = (m, d) => p(tr(m), d);
    window.confirm = m => c(tr(m));
  }
  return { tr, start };
})();
