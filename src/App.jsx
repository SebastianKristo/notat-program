import React, { useEffect, useRef, useState } from 'react';
import { C, ST, ORDER, EVENTS, INBOX, BLOCK_TYPES, seedPages, seedRows, seedRecent, seedPrivate, seedAutomations, toIso } from './data.js';
import { Icon, Logo, LineIcon } from './icons.jsx';
import { usePrefs } from './prefs.js';
import { configureApi, api, fileUrl, uploadFile, pickFile } from './api.js';
import { printPages } from './io.js';
import { ShareModal, HistoryModal, AnalyticsModal, CoverPicker, coverCss, Comments, MeetingModal, SidePeek, Modal } from './PageExtras.jsx';
import DbViews, { VIEWS, AutomationsModal } from './DbViews.jsx';
import { useSync } from './sync.js';
import SettingsView from './SettingsView.jsx';
import EmojiPicker from './EmojiPicker.jsx';
import { AppIcon } from './appicons.jsx';

const KEY = 'marg:v1';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
const withIds = d => { Object.values(d.pages).forEach(p => (p.blocks || []).forEach(b => { if (!b.id) b.id = uid(); })); return d; };
const seedInbox = () => INBOX.map((n, i) => ({ ...n, key: 'seed' + i, read: !n.unread }));
// Fyller inn felt som er lagt til i nyere versjoner
const migrate = d => ({
  ...d,
  rows: (d.rows || []).map(r => r.d !== undefined ? r : { ...r, d: toIso(r.dato) }),
  automations: d.automations || seedAutomations(),
  inbox: d.inbox || seedInbox(),
  templates: d.templates || []
});
const initial = () => withIds(migrate(load() || { pages: seedPages(), rows: seedRows(), recent: seedRecent, priv: seedPrivate, server: 'https://notes.kristo.no' }));
const uid = () => Math.random().toString(36).slice(2, 9);
const glass = { background: 'var(--glass)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.08),0 8px 24px rgba(0,0,0,.4)' };
const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const WD = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
// Demohendelsene i designet gjelder uke 44 i 2026
const DEMO_EVENTS = Object.entries(EVENTS).flatMap(([d, l]) => l.map(([t, n, sub, c, id]) => ({ date: `2026-${+d < 20 ? '11' : '10'}-${String(d).padStart(2, '0')}`, time: t, title: n, sub, color: c, pageId: id })));

function useWide() {
  const q = '(min-width: 820px)';
  const [w, setW] = useState(() => window.matchMedia(q).matches);
  useEffect(() => { const m = window.matchMedia(q), f = () => setW(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, []);
  return w;
}

function PageIcon({ icon, size = 23 }) {
  const px = Math.round(size * 0.95);
  if (!icon || icon === 'doc') return <Icon.doc size={px} />;
  if (icon === 'db') return <Icon.db size={px} />;
  if (icon.startsWith('i:')) { const [, n, c] = icon.split(':'); return <LineIcon name={n} color={c} size={px} />; }
  if (icon.startsWith('u:')) return <img src={fileUrl(icon.slice(2))} alt="" style={{ width: px, height: px, objectFit: 'cover', borderRadius: 4, display: 'block' }} />;
  return <span style={{ fontSize: size, lineHeight: 1 }}>{icon}</span>;
}

function Editable({ text, onChange, style, placeholder, onKeyDown, autoFocus, readOnly }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current && ref.current.innerText !== text) ref.current.innerText = text || ''; }, [text]);
  useEffect(() => {
    if (!autoFocus || !ref.current) return;
    const el = ref.current; el.focus();
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }, [autoFocus]);
  return <div ref={ref} className="editable" contentEditable={!readOnly} suppressContentEditableWarning data-ph={placeholder}
    style={{ outline: 'none', minWidth: 0, flex: 1, ...style }}
    onInput={e => onChange(e.currentTarget.innerText)} onKeyDown={onKeyDown} />;
}

export default function App() {
  const wide = useWide();
  const [data, setData] = useState(initial);
  // Faner med egen tilbake/frem-historikk (vises på iPad/Mac; mobil bruker én fane)
  const [tabs, setTabs] = useState(() => { const m = location.hash.match(/page=([\w-]+)/); return [{ id: 't1', screen: m ? 'page' : 'home', pageId: m ? m[1] : null, back: [], fwd: [] }]; });
  const [activeTab, setActiveTab] = useState('t1');
  const cur = tabs.find(t => t.id === activeTab) || tabs[0];
  const screen = cur.screen, pageId = cur.pageId || 'velkommen';
  const go = loc => setTabs(ts => ts.map(t => t.id !== cur.id || (t.screen === loc.screen && t.pageId === (loc.pageId ?? t.pageId)) ? t
    : { ...t, pageId: t.pageId, ...loc, back: [...t.back, { screen: t.screen, pageId: t.pageId }].slice(-50), fwd: [] }));
  const setScreen = s => go({ screen: s });
  const goBack = () => setTabs(ts => ts.map(t => t.id !== cur.id || !t.back.length ? t : { ...t, ...t.back[t.back.length - 1], back: t.back.slice(0, -1), fwd: [{ screen: t.screen, pageId: t.pageId }, ...t.fwd] }));
  const goFwd = () => setTabs(ts => ts.map(t => t.id !== cur.id || !t.fwd.length ? t : { ...t, ...t.fwd[0], fwd: t.fwd.slice(1), back: [...t.back, { screen: t.screen, pageId: t.pageId }] }));
  const newTab = (loc = { screen: 'home', pageId: null }) => { const id = 't' + Date.now(); setTabs(ts => [...ts, { id, ...loc, back: [], fwd: [] }]); setActiveTab(id); };
  const closeTab = id => setTabs(ts => { if (ts.length === 1) return [{ ...ts[0], screen: 'home', pageId: null, back: [], fwd: [] }]; const i = ts.findIndex(t => t.id === id), n = ts.filter(t => t.id !== id); if (id === activeTab) setActiveTab(n[Math.max(0, i - 1)].id); return n; });
  const [prefs, setPref] = usePrefs();
  const [modal, setModal] = useState(null);     // { type: 'share' | 'history' | 'analytics' | 'meeting' | 'automations' | 'templates' }
  const [cover, setCover] = useState(false);
  const [comments, setComments] = useState(false);
  const [peek, setPeek] = useState(null);
  const [settingsTab, setSettingsTab] = useState(null);
  const [filling, setFilling] = useState(false);
  const [calEvents, setCalEvents] = useState([]);
  const [weekStart, setWeekStart] = useState(() => { const d = new Date(); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return isoDay(d); });
  const [selDay, setSelDay] = useState(() => isoDay(new Date()));
  const [closed, setClosed] = useState({ Nylig: true });
  const [tog, setTog] = useState({});
  const [ai, setAi] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [model, setModel] = useState(0);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(0);
  const [menu, setMenu] = useState(false);
  const [toast, setToastS] = useState(null);
  const [focus, setFocus] = useState(null);
  const [slash, setSlash] = useState(null);
  const [settings, setSettings] = useState(false);
  const tt = useRef(); const msgRef = useRef();
  const sync = useSync(data, setData);
  configureApi(data.server, sync.authHeader);
  // Modeller fra serveren som "leverandør:modell". Tom streng = serverens standardmodell.
  const [MODELS, setModels] = useState(['']);
  useEffect(() => {
    if (!sync.auth.token) return;
    fetch(data.server.replace(/\/$/, '') + '/api/models', { headers: sync.authHeader }).then(r => r.ok ? r.json() : null)
      .then(m => { if (m?.models) setModels(['', ...m.models]); }).catch(() => {});
  }, [sync.auth.token, data.server]);
  const modelLabel = m => m ? m.split(':').slice(1).join(':') + ' · ' + { ollama: 'Ollama', gemini: 'Gemini', claude: 'Claude' }[m.split(':')[0]] : 'Standardmodell';
  const [exp, setExp] = useState({});          // åpne noder i sidetreet
  const [ctxMenu, setCtxMenu] = useState(null); // { id, x, y }
  const [renaming, setRenaming] = useState(null);
  const [picker, setPicker] = useState(null);   // { id, x, y } for ikonvelger
  const [drag, setDrag] = useState({ id: null, over: null });
  const [slashQ, setSlashQ] = useState('');
  const appIcon = data.appIcon || 'b';
  const iconRef = useRef();
  useEffect(() => { // favicon følger valgt appikon
    const svg = iconRef.current?.innerHTML; if (!svg) return;
    let l = document.querySelector('link[rel=icon]'); if (!l) { l = document.createElement('link'); l.rel = 'icon'; document.head.appendChild(l); }
    l.href = 'data:image/svg+xml,' + encodeURIComponent(svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'));
  }, [appIcon]);

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* full */ } }, [data]);
  useEffect(() => { if (msgRef.current) msgRef.current.scrollTop = msgRef.current.scrollHeight; }, [msgs, ai]);

  const showToast = t => { clearTimeout(tt.current); setToastS(t); tt.current = setTimeout(() => setToastS(null), 2200); };
  const pages = data.pages, page = pages[pageId] || pages.velkommen || Object.values(pages)[0];
  const isPg = screen === 'page' || screen === 'db';
  const alive = id => pages[id] && !pages[id].trashed;
  const sortIds = ids => prefs.sort === 'alpha' ? [...ids].sort((a, b) => (pages[a].title || '').localeCompare(pages[b].title || '', 'nb'))
    : prefs.sort === 'edited' ? [...ids].sort((a, b) => (pages[b].t || 0) - (pages[a].t || 0)) : ids;

  const open = (id, how) => {
    if (!alive(id)) return;
    const loc = { screen: pages[id].db ? 'db' : 'page', pageId: id };
    if (how === 'tab') newTab(loc); else go(loc);
    setMenu(false); setAi(false); setSlash(null); setPeek(null); setComments(false);
    setData(d => ({ ...d, recent: [id, ...d.recent.filter(x => x !== id)].slice(0, 12) }));
  };
  const openWindow = id => { const u = location.href.split('#')[0] + '#page=' + id; if (!window.open(u, '_blank')) showToast('Kunne ikke åpne nytt vindu'); };
  const back = () => { if (cur.back.length) goBack(); else setScreen('home'); setMenu(false); setSlash(null); };

  // Innboks: hendelser fra automatiseringer, møtenotater, import m.m.
  const addInbox = item => {
    setData(d => ({ ...d, inbox: [{ key: uid(), a: '⚡', c: 'var(--s6)', when: new Date().toISOString(), read: false, ...item }, ...(d.inbox || [])].slice(0, 200) }));
    if (prefs.notifyDesktop && 'Notification' in window && Notification.permission === 'granted') new Notification('Marg', { body: `${item.who} ${item.t}` });
  };
  const updPage = (id, f) => setData(d => ({ ...d, pages: { ...d.pages, [id]: { ...f(d.pages[id]), t: Date.now() } } }));
  const updBlock = (i, patch) => updPage(pageId, p => ({ ...p, blocks: p.blocks.map((b, j) => j === i ? { ...b, ...patch } : b) }));
  const insertBlock = (i, b) => { updPage(pageId, p => { const bl = [...p.blocks]; bl.splice(i, 0, b); return { ...p, blocks: bl }; }); setFocus(b.id); };
  const removeBlock = i => updPage(pageId, p => ({ ...p, blocks: p.blocks.filter((_, j) => j !== i) }));

  const newPage = (parent = null) => {
    const id = 'p' + uid();
    const b = { id: uid(), type: 'p', text: '' };
    setData(d => ({ ...d, pages: { ...d.pages, [id]: { icon: 'doc', title: '', props: [], blocks: [b], parent, t: Date.now(), fullWidth: prefs.fullWidth || undefined } }, priv: parent ? d.priv : [id, ...d.priv] }));
    if (parent) setExp(e => ({ ...e, [parent]: true }));
    go({ screen: 'page', pageId: id }); setAi(false); setFocus('title');
    showToast(parent ? 'Ny underside opprettet' : 'Ny side opprettet');
  };
  const children = id => sortIds(Object.keys(pages).filter(k => !pages[k].trashed && (pages[k].parent || null) === id));
  const isDescendant = (anc, id) => { for (let p = pages[id]?.parent; p; p = pages[p]?.parent) if (p === anc) return true; return false; };
  const setParent = (id, parent) => {
    if (id === parent || (parent && isDescendant(id, parent))) { showToast('Kan ikke flytte en side inn i seg selv'); return; }
    updPage(id, p => ({ ...p, parent }));
    setData(d => ({ ...d, priv: parent ? d.priv.filter(x => x !== id) : d.priv.includes(id) ? d.priv : [...d.priv, id] }));
    if (parent) setExp(e => ({ ...e, [parent]: true }));
    showToast(parent ? `Flyttet inn i «${pages[parent].title || 'Uten tittel'}»` : 'Flyttet til toppnivå');
  };
  // Papirkurv: sletting flytter siden (og undersidene) dit; tømmes etter 30 dager
  const subtree = id => [id, ...Object.keys(pages).filter(k => pages[k].parent === id).flatMap(subtree)];
  const deletePage = (id = pageId) => {
    const ids = subtree(id), now = Date.now();
    setData(d => ({ ...d, pages: Object.fromEntries(Object.entries(d.pages).map(([k, p]) => [k, ids.includes(k) ? { ...p, trashed: now, t: now } : p])) }));
    if (ids.includes(pageId) && isPg) setScreen('home'); showToast('Flyttet til papirkurven');
  };
  const restorePage = id => { const ids = subtree(id); setData(d => ({ ...d, pages: Object.fromEntries(Object.entries(d.pages).map(([k, p]) => [k, ids.includes(k) ? { ...p, trashed: undefined, t: Date.now(), parent: k === id && p.parent && d.pages[p.parent]?.trashed ? null : p.parent } : p])) })); showToast('Gjenopprettet'); };
  const purgePage = id => setData(d => { const p = { ...d.pages }; for (const k of subtree(id)) delete p[k]; return { ...d, pages: p, recent: d.recent.filter(x => p[x]), priv: d.priv.filter(x => p[x]) }; });
  useEffect(() => { const old = Object.keys(pages).filter(k => pages[k].trashed && Date.now() - pages[k].trashed > 30 * 864e5); if (old.length) setData(d => { const p = { ...d.pages }; old.forEach(k => delete p[k]); return { ...d, pages: p }; }); }, []);
  const saveTemplate = id => { const p = pages[id]; setData(d => ({ ...d, templates: [...(d.templates || []), { id: uid(), title: p.title || 'Uten tittel', icon: p.icon, cover: p.cover, blocks: (p.blocks || []).map(b => ({ ...b, done: false })) }] })); showToast('Lagret som mal'); };
  const fromTemplate = (tpl, parent = null) => {
    const id = 'p' + uid();
    setData(d => ({ ...d, pages: { ...d.pages, [id]: { icon: tpl.icon || 'doc', cover: tpl.cover, title: tpl.title, props: [], blocks: tpl.blocks.map(b => ({ ...b, id: uid() })), parent, t: Date.now() } }, priv: parent ? d.priv : [id, ...d.priv] }));
    go({ screen: 'page', pageId: id }); setModal(null); showToast('Ny side fra mal');
  };
  const duplicate = id => {
    const nid = 'p' + uid(), src = pages[id];
    setData(d => ({ ...d, pages: { ...d.pages, [nid]: { ...src, title: (src.title || 'Uten tittel') + ' (kopi)', blocks: (src.blocks || []).map(b => ({ ...b, id: uid() })), fav: false, t: Date.now() } }, priv: src.parent ? d.priv : [...d.priv, nid] }));
    showToast('Duplisert');
  };

  // Databaserader og automatiseringer
  const setRow = (id, patch) => {
    const r = data.rows.find(x => x.id === id); if (!r) return;
    let next = { ...r, ...patch }, moveTop = false;
    if (patch.st && patch.st !== r.st) for (const a of (data.automations || []).filter(a => a.on && a.when === patch.st)) {
      if (a.action === 'today') next.d = isoDay(new Date());
      if (a.action === 'week') { const d = new Date((next.d || isoDay(new Date())) + 'T12:00'); d.setDate(d.getDate() + 7); next.d = isoDay(d); }
      if (a.action === 'top') moveTop = true;
      if (a.action === 'notify') addInbox({ who: 'Automatisering', t: `flyttet «${r.n}» til ${patch.st}`, page: pages[pageId]?.title || 'Database', id: pageId });
      showToast('⚡ Automatisering: ' + a.label.split('→')[1].trim());
    }
    setData(d => { const rows = d.rows.map(x => x.id === id ? next : x); return { ...d, rows: moveTop ? [next, ...rows.filter(x => x.id !== id)] : rows }; });
  };
  const cycle = r => setRow(r.id, { st: ORDER[(ORDER.indexOf(r.st) + 1) % 3] });

  const ctx = isPg ? (page.title || 'Uten tittel') : null;
  const pageText = p => (p.blocks || []).map(b => b.text + (b.body ? '\n' + b.body : '')).join('\n');
  const reply = qq => /karnaugh/i.test(qq) ? 'Tre øvingsoppgaver:\n\n1. F(A,B,C,D) = Σm(0,2,5,7,8,10,13,15)\n2. F(A,B,C) = Σm(0,1,2,4,6) med X på 7\n3. Finn minimal POS for Σm(1,3,4,6)\n\nSkal jeg legge dem i Eksamensøving?'
    : /uke/i.test(qq) ? 'Denne uken:\n• Tir 09:00 Lab ELEK1100\n• Tir 14:00 Gruppemøte Øving 7\n• Ons 12:15 Forelesning MATA1100\n• Ons 23:59 Frist Øving 7\n\nKilder: Kalender · Øving 7 · Møtenotater 27. okt.'
    : /oppsummer/i.test(qq) ? `«${ctx || 'Øving 7'}» kort fortalt: ${(page.blocks || []).filter(b => b.type === 'p' || b.type === 'callout').map(b => b.text).slice(0, 2).join(' ') || 'Ingen tekst å oppsummere ennå.'}`
    : /minterm/i.test(qq) ? 'Fant 2 notater: «Booleske funksjoner, minterm og maksterm» og «Booleske forenklinger og Karnaugh-diagram».'
    : `Fikk ikke kontakt med ${data.server}. Logg inn og sjekk Marg AI under Innstillinger.`;
  const ask = async qq => {
    setAi(true); setInput(''); setQ('');
    setMsgs(m => [...m, { r: 'u', t: qq }, { r: 'a', t: '…' }]);
    const set = t => setMsgs(m => { const n = [...m]; n[n.length - 1] = { r: 'a', t }; return n; });
    try {
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 20000);
      const res = await fetch(data.server.replace(/\/$/, '') + '/api/ai', { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', ...sync.authHeader },
        body: JSON.stringify({ model: MODELS[model % MODELS.length], prompt: qq, context: isPg ? { pageId, text: pageText(page), private: !!page.private } : { workspace: true } }) });
      clearTimeout(to);
      if (res.status !== 200 && res.status !== 0) { const j = await res.json().catch(() => ({})); if (j.error) { set(j.error); return; } }
      if (!res.ok || !res.body) throw new Error();
      const rd = res.body.getReader(), dec = new TextDecoder(); let acc = '';
      for (;;) { const { done, value } = await rd.read(); if (done) break; acc += dec.decode(value, { stream: true }); set(acc); }
      if (!acc) throw new Error();
    } catch { setTimeout(() => set(reply(qq)), 400); }
  };
  const askText = async (prompt, context = { workspace: true }) => {
    const res = await fetch(data.server.replace(/\/$/, '') + '/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json', ...sync.authHeader }, body: JSON.stringify({ model: MODELS[model % MODELS.length], prompt, context }) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'AI svarte ikke');
    return (await res.text()).trim();
  };
  const autofill = async () => {
    if (!sync.auth.token) return showToast('Logg inn for å bruke AI');
    setFilling(true);
    try { for (const r of data.rows.filter(r => !r.sum)) { const t = await askText(`Skriv ett kort sammendrag (maks 12 ord, norsk, ingen innledning) av hva øvingsoppgaven «${r.n}» i emnet ${r.emne} handler om.`); setData(d => ({ ...d, rows: d.rows.map(x => x.id === r.id ? { ...x, sum: t.split('\n')[0].slice(0, 140) } : x) })); } showToast('AI-autofyll ferdig'); }
    catch (e) { showToast(e.message); }
    setFilling(false);
  };
  // Kalenderabonnement (ICS) fra serveren
  useEffect(() => { if (sync.auth.token) api('/api/calendar').then(r => setCalEvents(r.events || [])).catch(() => {}); }, [sync.auth.token, data.server]);
  // ⌘K / Ctrl K åpner søk, ⌘[ / ⌘] blar i historikken
  useEffect(() => {
    const f = e => { if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === 'k') { e.preventDefault(); setScreen('search'); }
      if (e.key === '[') { e.preventDefault(); goBack(); } if (e.key === ']') { e.preventDefault(); goFwd(); }
      if (e.key === 't' && wide) { e.preventDefault(); newTab(); } };
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f);
  });
  const sugg = [['📝', ctx ? 'Oppsummer denne siden' : 'Oppsummer Øving 7'], ['🗺️', 'Lag øvingsoppgaver om Karnaugh'], ['🔎', 'Finn notatene mine om minterm'], ['📅', 'Hva har jeg denne uken?']];

  // ---------- pieces ----------
  const row = id => { const p = pages[id]; if (!p || p.trashed) return null;
    return <div key={id} className="press" onClick={() => open(id)} style={{ display: 'flex', alignItems: 'center', gap: 15, height: 50, padding: '0 22px', cursor: 'pointer' }}>
      <span style={{ width: 28, flex: 'none', display: 'grid', placeItems: 'center', color: 'var(--muted2)' }}><PageIcon icon={p.icon} size={23} /></span>
      <span style={{ fontSize: 17.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title || 'Uten tittel'}</span>
    </div>; };

  // Sidetre for iPad/Mac: undersider, dra og slipp, kontekstmeny og ikonvelger
  const treeRow = (id, depth = 0) => { const p = pages[id]; if (!p || p.trashed) return null;
    const kids = children(id), open_ = !!exp[id], act = isPg && id === pageId, over = drag.over === id && drag.id !== id;
    return <div key={id}>
      <div className="press tree-row" draggable={renaming !== id}
        onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); setDrag({ id, over: null }); }}
        onDragEnd={() => setDrag({ id: null, over: null })}
        onDragOver={e => { e.preventDefault(); if (drag.over !== id) setDrag(d => ({ ...d, over: id })); }}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); const src = e.dataTransfer.getData('text/plain'); setDrag({ id: null, over: null }); if (src && src !== id) setParent(src, id); }}
        onClick={e => renaming !== id && open(id, e.metaKey || e.ctrlKey ? 'tab' : undefined)} onAuxClick={e => e.button === 1 && open(id, 'tab')}
        onContextMenu={e => { e.preventDefault(); setCtxMenu({ id, x: e.clientX, y: e.clientY }); }}
        style={{ display: 'flex', alignItems: 'center', gap: 4, height: 30, paddingLeft: 6 + depth * 14, paddingRight: 6, margin: '0 6px', borderRadius: 6, cursor: 'pointer', background: over ? 'var(--blue-bg)' : act ? 'var(--s3)' : 'transparent', boxShadow: over ? 'inset 0 0 0 1px #2f80ed' : 'none' }}>
        <span onClick={e => { e.stopPropagation(); setExp(x => ({ ...x, [id]: !open_ })); }} style={{ width: 16, flex: 'none', color: 'var(--faint)', fontSize: 10, textAlign: 'center', visibility: kids.length ? 'visible' : 'hidden', transform: open_ ? 'rotate(90deg)' : 'none' }}>▶</span>
        <span onClick={e => { e.stopPropagation(); setPicker({ id, x: e.clientX, y: e.clientY + 12 }); }} title="Endre ikon" style={{ width: 22, flex: 'none', display: 'grid', placeItems: 'center', color: 'var(--muted2)' }}><PageIcon icon={p.icon} size={15} /></span>
        {renaming === id
          ? <input autoFocus defaultValue={p.title} onClick={e => e.stopPropagation()} onBlur={e => { updPage(id, x => ({ ...x, title: e.target.value })); setRenaming(null); }}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null); }}
              style={{ flex: 1, minWidth: 0, height: 22, border: 0, borderRadius: 4, background: 'var(--s4)', color: 'var(--text)', font: 'inherit', fontSize: 14, padding: '0 6px', outline: '1px solid #2f80ed' }} />
          : <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: act ? 'var(--text)' : 'var(--text2)' }}>{p.title || 'Uten tittel'}{p.private && <span title="Privat – bare lokal AI" style={{ marginLeft: 5, fontSize: 11 }}>🔒</span>}</span>}
        <span className="hover-show" onClick={e => { e.stopPropagation(); setCtxMenu({ id, x: e.clientX, y: e.clientY }); }} style={{ color: 'var(--muted)', letterSpacing: 1, padding: '0 3px' }}>···</span>
        <span className="hover-show" onClick={e => { e.stopPropagation(); newPage(id); }} title="Legg til underside" style={{ color: 'var(--muted)', fontSize: 15, padding: '0 3px' }}>+</span>
      </div>
      {open_ && kids.map(k => treeRow(k, depth + 1))}
    </div>; };
  const dropZone = (name, f) => ({
    onDragOver: e => { e.preventDefault(); if (drag.over !== name) setDrag(d => ({ ...d, over: name })); },
    onDrop: e => { e.preventDefault(); const src = e.dataTransfer.getData('text/plain'); setDrag({ id: null, over: null }); if (src) f(src); }
  });
  const sectionHead = (name, extra, dz) => { const op = !closed[name];
    return <div {...(dz || {})} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: wide ? '16px 18px 4px' : '22px 24px 6px', borderRadius: 6, background: dz && drag.over === name ? 'var(--blue-bg)' : 'transparent' }}>
      <span onClick={() => setClosed(c => ({ ...c, [name]: op }))} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: wide ? 12.5 : 15, fontWeight: 600, color: 'var(--muted)', cursor: 'pointer' }}>{name} <span style={{ fontSize: 11, transform: op ? 'none' : 'rotate(-90deg)', display: 'inline-block' }}>⌄</span></span>
      {extra}
    </div>; };
  const roots = sortIds(Object.keys(pages).filter(k => !pages[k].parent && !pages[k].trashed));
  const favs = Object.keys(pages).filter(k => pages[k].fav && !pages[k].trashed);
  const trashCount = Object.values(pages).filter(p => p.trashed).length;
  const sidebarTree = <>
    {prefs.sbFav && favs.length > 0 && <div>{sectionHead('Favoritter')}{!closed.Favoritter && favs.map(id => treeRow(id))}</div>}
    {prefs.sbRecent && <div>{sectionHead('Nylig')}{!closed.Nylig && data.recent.filter(alive).slice(0, 6).map(id => treeRow(id))}</div>}
    <div>{sectionHead('Sider', <span onClick={() => newPage()} style={{ color: 'var(--muted)', fontSize: 18, cursor: 'pointer' }}>+</span>, dropZone('Sider', id => setParent(id, null)))}
      {!closed.Sider && roots.map(id => treeRow(id))}</div>
  </>;
  const sections = [['Nylige', data.recent.filter(alive)], ['Privat', sortIds(data.priv.filter(id => alive(id) && !pages[id]?.parent))]].map(([name, ids]) =>
    <div key={name}>{sectionHead(name, name === 'Privat' && <span onClick={() => newPage()} style={{ color: 'var(--muted)', fontSize: 18, cursor: 'pointer' }}>+</span>)}
      {!closed[name] && ids.filter(id => pages[id]).map(row)}</div>);

  const unread = (data.inbox || []).filter(n => !n.read).length;
  const quick = [['cal', 'Kalender', Icon.cal], ['inbox', 'Innboks', Icon.inbox], ...(trashCount ? [['trash', 'Papirkurv', () => <span style={{ fontSize: 20 }}>🗑️</span>]] : [])];
  const Home = () => <div>
    <div style={{ paddingTop: 10 }}>{quick.map(([k, l, Ic]) => <div key={k} className="press" onClick={() => setScreen(k)} style={{ display: 'flex', alignItems: 'center', gap: 15, height: 50, padding: '0 22px', cursor: 'pointer' }}>
      <span style={{ width: 28, display: 'grid', placeItems: 'center', color: 'var(--muted2)' }}><Ic /></span><span style={{ fontSize: 17.5, fontWeight: 500 }}>{l}</span>
      {k === 'inbox' && unread > 0 && <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--muted)' }}>{unread} uleste</span>}</div>)}</div>
    {sections}</div>;

  const pill = (v, c) => <span style={{ fontSize: 14, padding: '3px 9px', borderRadius: 5, background: C[c]?.bg, color: C[c]?.fg }}>{v}</span>;

  const locked = !!page.locked;
  const onBlockKey = (i, b) => e => {
    if (locked) return;
    if (e.key === 'Enter' && (prefs.enterNewBlock ? !e.shiftKey : e.shiftKey) && b.type !== 'math') {
      e.preventDefault();
      const cont = ['li', 'todo'].includes(b.type) && b.text ? b.type : 'p';
      if (['li', 'todo'].includes(b.type) && !b.text) { updBlock(i, { type: 'p' }); return; }
      insertBlock(i + 1, { id: uid(), type: cont, text: '', done: false });
    } else if (e.key === 'Backspace' && !e.currentTarget.innerText) {
      e.preventDefault();
      if (b.type !== 'p') updBlock(i, { type: 'p' });
      else if (page.blocks.length > 1) { removeBlock(i); const pb = page.blocks[i - 1]; if (pb) { if (!pb.id) updBlock(i - 1, { id: uid() }); setFocus(pb.id || null); } }
    } else if (e.key === '/' && !e.currentTarget.innerText) {
      e.preventDefault(); setSlashQ(''); setSlash(i);
    } else if (e.key === 'Escape') setSlash(null);
  };

  const Block = ({ b, i }) => {
    const key = pageId + i, open_ = !!tog[key];
    const ed = (style, ph) => <Editable readOnly={locked} text={b.text} placeholder={ph} autoFocus={focus && focus === b.id} style={style}
      onChange={t => updBlock(i, { text: t })} onKeyDown={onBlockKey(i, b)} />;
    const wrap = (c, st) => <div style={{ position: 'relative', ...st }}>{c}{slash === i && SlashMenu(i)}</div>;
    switch (b.type) {
      case 'h': return wrap(ed({ fontSize: 22, fontWeight: 700, margin: '22px 0 6px' }, 'Overskrift'));
      case 'li': return wrap(<div style={{ display: 'flex', gap: 10, fontSize: 17, lineHeight: 1.55, color: 'var(--text2)', padding: '2px 0' }}><span>•</span>{ed({}, 'Liste')}</div>);
      case 'todo': { const done = !!b.done;
        return wrap(<div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', fontSize: 17, lineHeight: 1.55, padding: '3px 0' }}>
          <span onClick={() => locked ? showToast('Siden er låst') : updBlock(i, { done: !done })} style={{ width: 19, height: 19, flex: 'none', marginTop: 4, borderRadius: 4, border: `1.5px solid ${done ? '#2f80ed' : 'var(--faint)'}`, background: done ? '#2f80ed' : 'transparent', display: 'grid', placeItems: 'center', fontSize: 13, color: '#fff', cursor: 'pointer' }}>{done ? '✓' : ''}</span>
          {ed({ color: done ? 'var(--faint)' : 'var(--text2)', textDecoration: done ? 'line-through' : 'none' }, 'Gjøremål')}</div>); }
      case 'callout': return wrap(<div style={{ display: 'flex', gap: 12, background: 'var(--s2)', borderRadius: 8, padding: '14px 16px', margin: '8px 0', fontSize: 16.5, lineHeight: 1.5 }}><span>{b.icon || '💡'}</span>{ed({}, 'Callout')}</div>);
      case 'math': return wrap(<div style={{ background: 'var(--s1)', boxShadow: 'inset 0 0 0 1px var(--line2)', borderRadius: 8, padding: '16px', margin: '10px 0', textAlign: 'center' }}>{ed({ fontFamily: 'Georgia,"Times New Roman",serif', fontStyle: 'italic', fontSize: 21 }, 'Formel')}</div>);
      case 'toggle': return wrap(<div style={{ padding: '3px 0' }}>
        <div style={{ display: 'flex', gap: 10, fontSize: 17, lineHeight: 1.55 }}><span onClick={() => setTog(t => ({ ...t, [key]: !open_ }))} style={{ cursor: 'pointer', color: 'var(--muted2)', width: 14 }}>{open_ ? '▾' : '▸'}</span>{ed({ fontWeight: 500 }, 'Utvidbar liste')}</div>
        {open_ && <div style={{ padding: '4px 0 4px 24px', fontSize: 16.5, lineHeight: 1.55, color: 'var(--text3)', display: 'flex' }}>
          <Editable text={b.body || ''} placeholder="Tomt innhold" onChange={t => updBlock(i, { body: t })} /></div>}</div>);
      case 'quote': return wrap(<div style={{ borderLeft: '3px solid var(--text)', padding: '2px 0 2px 14px', margin: '6px 0', fontSize: 17.5, lineHeight: 1.55 }}>{ed({}, 'Sitat')}</div>);
      case 'image': return wrap(<figure style={{ margin: '10px 0' }}>
        {b.url ? <img src={fileUrl(b.url)} alt={b.text || ''} style={{ maxWidth: '100%', borderRadius: 8, display: 'block' }} />
          : <div onClick={async () => { if (locked) return; const f = await pickFile('image/*'); if (!f) return; try { const r = await uploadFile(f); updBlock(i, { url: r.url }); } catch (err) { showToast(err.message); } }} style={{ padding: 18, borderRadius: 8, background: 'var(--s2)', color: 'var(--muted)', cursor: 'pointer', fontSize: 15 }}>🖼️ Klikk for å laste opp et bilde</div>}
        {b.url && <figcaption style={{ fontSize: 14, color: 'var(--muted)', marginTop: 6 }}>{ed({}, 'Bildetekst')}</figcaption>}</figure>);
      case 'divider': return wrap(<div tabIndex={0} onKeyDown={onBlockKey(i, { ...b, text: '' })} style={{ padding: '10px 0', outline: 'none' }}><div style={{ height: 1, background: 'var(--s6)' }} /></div>);
      default: return wrap(ed({ fontSize: 17, lineHeight: 1.55, color: 'var(--text2)', padding: '3px 0' }, wide ? 'Skriv, eller trykk «/» for kommandoer' : 'Skriv noe …'));
    }
  };

  const applyType = (i, t) => {
    setSlash(null); setSlashQ('');
    if (t === 'ai') { setAi(true); return; }
    if (t === 'image') { const id = page.blocks[i].id || uid(); updBlock(i, { type: 'image', id }); pickFile('image/*').then(f => f && uploadFile(f).then(r => updBlock(i, { url: r.url })).catch(e => showToast(e.message))); return; }
    const id = page.blocks[i].id || uid(); updBlock(i, { type: t, id }); setFocus(id + '-' + t); setTimeout(() => setFocus(id), 0);
  };
  const SlashMenu = i => { const ql = slashQ.trim().toLowerCase();
    const list = BLOCK_TYPES.filter(([t, l, , , w]) => !ql || (l + ' ' + w).toLowerCase().includes(ql));
    const groups = ql ? [['Treff', list]] : [...new Set(list.map(x => x[3]))].map(g => [g, list.filter(x => x[3] === g && (g !== 'Standardblokker' || !['p', 'todo', 'h'].includes(x[0])))]);
    return <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', left: 0, top: '100%', zIndex: 15, width: 280, maxHeight: 360, display: 'flex', flexDirection: 'column', background: 'var(--menu)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: 14, boxShadow: '0 12px 32px rgba(0,0,0,.5)', overflow: 'hidden' }}>
      <input autoFocus value={slashQ} onChange={e => setSlashQ(e.target.value)} placeholder="Søk etter blokktype"
        onKeyDown={e => { if (e.key === 'Escape') { setSlash(null); setSlashQ(''); } if (e.key === 'Enter' && list[0]) { e.preventDefault(); applyType(i, list[0][0]); } }}
        style={{ margin: 8, height: 32, borderRadius: 8, border: 0, background: 'var(--s0)', color: 'var(--text)', padding: '0 10px', font: 'inherit', fontSize: 14 }} />
      <div style={{ overflow: 'auto', padding: '0 6px 6px' }}>
        {groups.filter(([, l]) => l.length).map(([g, l]) => <div key={g}>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, padding: '6px 8px 2px' }}>{g}</div>
          {l.map(([t, label, ic]) => <div key={t} className="press" onMouseDown={e => e.preventDefault()} onClick={() => applyType(i, t)}
            style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '7px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 14.5 }}>
            <span style={{ width: 26, height: 26, borderRadius: 5, background: 'var(--s5)', display: 'grid', placeItems: 'center', fontSize: 13 }}>{ic}</span>{label}
            {(t === 'ai' || t === 'divider') && <span style={{ marginLeft: 'auto', fontSize: 11, padding: '1px 6px', borderRadius: 4, background: 'var(--blue-bg)', color: 'var(--blue-fg)' }}>Ny</span>}</div>)}
        </div>)}
        {!list.length && <div style={{ color: 'var(--muted)', fontSize: 13.5, padding: 10 }}>Ingen treff</div>}
      </div>
      <div onClick={() => { setSlash(null); setSlashQ(''); }} style={{ fontSize: 12.5, color: 'var(--muted)', padding: '8px 14px', boxShadow: 'inset 0 1px 0 var(--s6)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}><span>Lukk menyen</span><span>esc</span></div>
    </div>; };

  const crumbs = id => { const out = []; for (let p = pages[id]?.parent; p && pages[p]; p = pages[p].parent) out.unshift(p); return out; };
  const full = page.fullWidth ?? prefs.fullWidth;
  const PageView = () => <div>
    {page.cover && <div style={{ position: 'relative', height: wide ? 220 : 160, background: coverCss(page.cover), backgroundSize: 'cover', backgroundPosition: 'center' }}>
      {!locked && <div className="cover-actions" style={{ position: 'absolute', right: 16, bottom: 12, display: 'flex', gap: 6 }}>
        <span onClick={() => setCover(true)} style={chip}>Endre forsidebilde</span><span onClick={() => updPage(pageId, p => ({ ...p, cover: undefined }))} style={chip}>Fjern</span></div>}
      {cover && <CoverPicker onClose={() => setCover(false)} onPick={c => { updPage(pageId, p => ({ ...p, cover: c })); setCover(false); }} onRemove={() => { updPage(pageId, p => ({ ...p, cover: undefined })); setCover(false); }} />}
    </div>}
    <div style={{ padding: wide ? '0 0 30px' : '0 24px 30px', maxWidth: full ? 'none' : 760, margin: '0 auto', paddingLeft: wide ? 56 : 24, paddingRight: wide ? 56 : 24 }}>
    <div className="page-head" style={{ position: 'relative', paddingTop: page.cover ? 0 : wide ? 40 : 30 }}>
      {page.icon !== 'doc' || locked ? <div onClick={() => !locked && setPicker({ id: pageId, inline: true })} title="Endre ikon" style={{ marginTop: page.cover ? -36 : 0, marginBottom: 12, cursor: locked ? 'default' : 'pointer', display: 'inline-block', position: 'relative', zIndex: 2 }}><PageIcon icon={page.icon} size={58} /></div> : null}
      {!locked && <div className="head-actions" style={{ display: 'flex', gap: 4, marginBottom: 6, minHeight: 26, flexWrap: 'wrap' }}>
        {page.icon === 'doc' && <span onClick={() => setPicker({ id: pageId, inline: true })} style={ghost}>☺ Legg til ikon</span>}
        {!page.cover && <span onClick={() => { updPage(pageId, p => ({ ...p, cover: 'linear-gradient(135deg,#f3cfa9,#c4703f)' })); }} style={ghost}>🖼 Legg til forsidebilde</span>}
        <span onClick={() => setComments(true)} style={ghost}>💬 {(page.comments || []).filter(c => !c.resolved).length ? `${(page.comments || []).filter(c => !c.resolved).length} kommentarer` : 'Legg til en kommentar'}</span>
      </div>}
      {picker?.inline && picker.id === pageId && <EmojiPicker custom={data.customEmoji || []} style={{ left: 0, top: page.cover ? 40 : 100 }} onClose={() => setPicker(null)} onPick={e => { updPage(pageId, p => ({ ...p, icon: e })); setPicker(null); }} onRemove={() => { updPage(pageId, p => ({ ...p, icon: 'doc' })); setPicker(null); }} />}
    </div>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
      {page.private && <span style={{ ...badge, color: 'var(--yellow-fg)', background: 'var(--yellow-bg)' }}>🔒 Privat · bare lokal AI</span>}
      {page.locked && <span style={{ ...badge, color: 'var(--muted)', background: 'var(--s3)' }}>🔐 Låst</span>}
      {page.wiki && <span style={{ ...badge, color: 'var(--green-fg)', background: 'var(--green-bg)' }}>✓ Verifisert wiki</span>}
      {page.todosToTasks?.length > 0 && <span onClick={() => { setData(d => ({ ...d, rows: [...d.rows, ...page.todosToTasks.map((t, i) => ({ id: Date.now() + i, icon: '🎙️', n: t, emne: 'DATA1200', st: 'Ikke startet', d: isoDay(new Date()) }))] })); updPage(pageId, p => ({ ...p, todosToTasks: undefined })); showToast(`${page.todosToTasks.length} gjøremål lagt i ${pages.eksamen?.title || 'Oppgaver'}`); }} style={{ ...badge, cursor: 'pointer', color: 'var(--blue-fg)', background: 'var(--blue-bg)' }}>＋ Legg gjøremål i Oppgaver</span>}
    </div>
    <Editable readOnly={locked} text={page.title} placeholder="Uten tittel" autoFocus={focus === 'title'} style={{ fontSize: wide ? 'clamp(28px, 3.2vw, 40px)' : 30, fontWeight: 700, lineHeight: 1.2, marginBottom: 14 }}
      onChange={t => updPage(pageId, p => ({ ...p, title: t }))} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const b = page.blocks[0]; if (b) { const id = b.id || uid(); updBlock(0, { id }); setFocus(id); } } }} />
    {(page.props || []).map((p, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', height: 34 }}><span style={{ width: 110, color: 'var(--muted)', fontSize: 15 }}>{p.k}</span>{pill(p.v, p.c)}</div>)}
    <div style={{ height: 1, background: 'var(--line2)', margin: '14px 0 10px' }} />
    {(page.blocks || []).map((b, i) => <React.Fragment key={b.id || i}>{Block({ b, i })}</React.Fragment>)}
    {!locked && <div onClick={() => insertBlock(page.blocks.length, { id: uid(), type: 'p', text: '' })} style={{ color: 'var(--faint)', fontSize: 15, padding: '14px 0', cursor: 'text' }}>+ Ny blokk</div>}
    {(children(pageId).length > 0 || !wide) && <div style={{ marginTop: 18, borderTop: '1px solid var(--line2)', paddingTop: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Undersider</div>
      {children(pageId).map(id => <div key={id} className="press" onClick={() => open(id)} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 4px', borderRadius: 6, cursor: 'pointer', fontSize: 16 }}>
        <span style={{ width: 24, display: 'grid', placeItems: 'center', color: 'var(--muted2)' }}><PageIcon icon={pages[id].icon} size={18} /></span><span style={{ textDecoration: 'underline', textDecorationColor: 'var(--s7)', textUnderlineOffset: 3 }}>{pages[id].title || 'Uten tittel'}</span></div>)}
      {!locked && <div onClick={() => newPage(pageId)} style={{ color: 'var(--faint)', fontSize: 15, padding: '8px 4px', cursor: 'pointer' }}>+ Ny underside</div>}
    </div>}
    {(() => { const links = Object.entries(pages).filter(([id, p]) => id !== pageId && !p.trashed && (p.blocks || []).some(b => (b.text || '').includes(`[[${page.title}]]`) || (b.text || '').includes(page.title) && page.title.length > 5)).slice(0, 8);
      return links.length > 0 && <div style={{ marginTop: 22, borderTop: '1px solid var(--line2)', paddingTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>{links.length} tilbakelenke{links.length > 1 ? 'r' : ''}</div>
        {links.map(([id, p]) => <div key={id} className="press" onClick={() => open(id)} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 4px', borderRadius: 6, cursor: 'pointer', fontSize: 15, color: 'var(--text3)' }}><PageIcon icon={p.icon} size={16} />{p.title || 'Uten tittel'}</div>)}
      </div>; })()}
    </div>
  </div>;

  const DbView = () => { const view = page.view || (wide ? 'table' : 'list');
    return <div style={{ padding: wide ? '40px 56px' : '30px 24px' }}>
      <div style={{ fontSize: 40, color: 'var(--muted2)' }}><PageIcon icon={page.icon} size={44} /></div>
      <div style={{ fontSize: 30, fontWeight: 700, margin: '8px 0 16px' }}>{page.title}</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 2 }}>
        {VIEWS.map(([k, l]) => <span key={k} onClick={() => updPage(pageId, p => ({ ...p, view: k }))} style={{ padding: '7px 14px', borderRadius: 16, fontSize: 14.5, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', background: view === k ? 'var(--text)' : 'var(--s3)', color: view === k ? 'var(--bg)' : 'var(--text)' }}>{l}</span>)}
        <span onClick={() => setModal({ type: 'automations' })} style={{ padding: '7px 14px', borderRadius: 16, fontSize: 14.5, cursor: 'pointer', background: 'var(--s3)', whiteSpace: 'nowrap' }}>⚡ Automatiseringer</span>
        <span onClick={() => { const n = prompt('Navn på ny rad'); if (n) setData(d => ({ ...d, rows: [...d.rows, { id: Date.now(), icon: '📝', n, emne: 'DATA1200', st: 'Ikke startet', d: isoDay(new Date()) }] })); }} style={{ padding: '7px 14px', borderRadius: 16, fontSize: 14.5, cursor: 'pointer', background: 'var(--s3)', whiteSpace: 'nowrap' }}>+ Ny</span>
      </div>
      <DbViews rows={data.rows} view={view} wide={wide} setRow={setRow} cycle={cycle} autofill={autofill} filling={filling}
        addRow={r => { setData(d => ({ ...d, rows: [...d.rows, { id: Date.now(), ...r }] })); showToast('Ny rad lagt til'); }}
        removeRow={id => setData(d => ({ ...d, rows: d.rows.filter(x => x.id !== id) }))} />
    </div>; };

  // Kalender: egne hendelser fra ICS-abonnement, datoer i databasen og demo-hendelser
  const eventsOn = ds => [
    ...DEMO_EVENTS.filter(e => e.date === ds),
    ...calEvents.filter(e => (e.allDay ? e.start.slice(0, 10) : isoDay(new Date(e.start))) === ds).map(e => ({ time: e.allDay ? 'Hele' : new Date(e.start).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' }), title: e.title, sub: e.location || 'Kalender', color: '#86b6ec' })),
    ...data.rows.filter(r => r.d === ds).map(r => ({ time: '', title: r.n, sub: `${pages.eksamen?.title || 'Database'} · ${r.st}`, color: '#e3b665', pageId: 'eksamen' }))
  ].sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
  const Cal = () => { const today = isoDay(new Date()), days = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart + 'T12:00'); d.setDate(d.getDate() + i); return isoDay(d); });
    const shift = n => { const d = new Date(weekStart + 'T12:00'); d.setDate(d.getDate() + n * 7); setWeekStart(isoDay(d)); }, evs = eventsOn(selDay);
    return <div style={{ padding: '18px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 28, fontWeight: 700, textTransform: 'capitalize', flex: 1 }}>{new Date(selDay + 'T12:00').toLocaleDateString('nb-NO', { month: 'long' })}</div>
        <span onClick={() => shift(-1)} style={navBtn}>‹</span><span onClick={() => { const d = new Date(); d.setDate(d.getDate() - (d.getDay() + 6) % 7); setWeekStart(isoDay(d)); setSelDay(today); }} style={{ ...navBtn, width: 'auto', padding: '0 12px', fontSize: 14 }}>I dag</span><span onClick={() => shift(1)} style={navBtn}>›</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', textAlign: 'center', gap: 4, maxWidth: 560 }}>
        {days.map((ds, i) => { const sel = ds === selDay, isToday = ds === today, n = +ds.slice(8);
          return <div key={ds} onClick={() => setSelDay(ds)} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{WD[i]}</span>
            <span style={{ width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 600, background: sel ? (isToday ? '#eb5757' : 'var(--text)') : 'transparent', color: sel ? (isToday ? '#fff' : 'var(--bg)') : isToday ? '#eb5757' : 'var(--text)' }}>{n}</span>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: eventsOn(ds).length ? 'var(--faint)' : 'transparent' }} /></div>; })}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--muted)', margin: '24px 0 10px' }}>{(selDay === today ? 'I dag · ' : '') + new Date(selDay + 'T12:00').toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      {!evs.length && <div style={{ color: 'var(--faint)', fontSize: 15 }}>Ingen hendelser</div>}
      {evs.map((e, i) => <div key={i} className="press" onClick={() => e.pageId && open(e.pageId)} style={{ display: 'flex', gap: 12, padding: '10px 0', cursor: e.pageId ? 'pointer' : 'default' }}>
        <span style={{ width: 46, fontSize: 14, color: 'var(--muted)', paddingTop: 2 }}>{e.time}</span><span style={{ width: 3, borderRadius: 2, background: e.color }} />
        <div><div style={{ fontSize: 16.5, fontWeight: 500 }}>{e.title}</div><div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 2 }}>{e.sub}</div></div></div>)}
      {!sync.auth.token && <div style={{ fontSize: 13, color: 'var(--faint)', marginTop: 20 }}>Logg inn og legg til en ICS-adresse under Innstillinger → E-post og kalender for å se din egen kalender her.</div>}
    </div>; };

  const when = w => { if (!w || !/^\d{4}-/.test(w)) return w; const m = (Date.now() - new Date(w)) / 6e4; return m < 1 ? 'nå' : m < 60 ? Math.round(m) + ' min' : m < 1440 ? Math.round(m / 60) + ' t' : new Date(w).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }); };
  const Inbox = () => <div style={{ padding: '18px 0' }}>
    <div style={{ display: 'flex', alignItems: 'center', padding: '0 22px 12px' }}><div style={{ fontSize: 28, fontWeight: 700, flex: 1 }}>Innboks</div>
      {unread > 0 && <span onClick={() => setData(d => ({ ...d, inbox: d.inbox.map(n => ({ ...n, read: true })) }))} style={{ fontSize: 14, color: 'var(--muted)', cursor: 'pointer' }}>Merk alle som lest</span>}</div>
    {!(data.inbox || []).length && <div style={{ color: 'var(--faint)', padding: '0 22px' }}>Ingenting her.</div>}
    {(data.inbox || []).map(n => <div key={n.key} className="press" onClick={() => { setData(d => ({ ...d, inbox: d.inbox.map(x => x.key === n.key ? { ...x, read: true } : x) })); n.id && open(n.id); }} style={{ display: 'flex', gap: 12, padding: '12px 22px', cursor: 'pointer', alignItems: 'flex-start' }}>
      <span style={{ width: 34, height: 34, flex: 'none', borderRadius: '50%', background: n.c, display: 'grid', placeItems: 'center', fontWeight: 600, fontSize: 15, color: '#fff' }}>{n.a}</span>
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15.5, lineHeight: 1.4 }}><b>{n.who}</b> {n.t}</div><div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>{n.page} · {when(n.when)}</div></div>
      {!n.read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2f80ed', marginTop: 8 }} />}</div>)}
  </div>;
  const Trash = () => { const list = Object.entries(pages).filter(([, p]) => p.trashed && !(p.parent && pages[p.parent]?.trashed));
    return <div style={{ padding: '18px 22px' }}>
      <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 6 }}>Papirkurv</div>
      <div style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 14 }}>Sider slettes for godt etter 30 dager.</div>
      {!list.length && <div style={{ color: 'var(--faint)' }}>Papirkurven er tom.</div>}
      {list.map(([id, p]) => <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
        <PageIcon icon={p.icon} size={20} /><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15.5, fontWeight: 500 }}>{p.title || 'Uten tittel'}</div><div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Slettet {when(new Date(p.trashed).toISOString())} siden</div></div>
        <button onClick={() => restorePage(id)} style={smallBtn}>Gjenopprett</button>
        <button onClick={() => confirm('Slette for godt?') && purgePage(id)} style={{ ...smallBtn, background: 'var(--red-bg)', color: 'var(--red-fg)' }}>Slett for godt</button></div>)}
    </div>; };

  const qq = q.trim().toLowerCase();
  const results = Object.entries(pages).filter(([, p]) => !p.trashed && (filter !== 1 || !p.db) && (filter !== 2 || p.db) && (!qq || (p.title || '').toLowerCase().includes(qq) || (p.blocks || []).some(b => (b.text || '').toLowerCase().includes(qq)))).slice(0, 20);
  const Search = <div style={{ padding: '10px 18px' }}>
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <div style={{ flex: 1, height: 44, borderRadius: 22, background: 'var(--s3)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px' }}><Icon.search size={18} />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Søk" style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', color: 'var(--text)', font: 'inherit', fontSize: 16.5 }} /></div>
      {!wide && <span onClick={() => { setScreen('home'); setQ(''); }} style={{ fontSize: 16, cursor: 'pointer' }}>Avbryt</span>}
    </div>
    <div style={{ display: 'flex', gap: 8, margin: '14px 0', flexWrap: 'wrap' }}>{['Alle', 'Sider', 'Databaser'].map((l, i) => <span key={l} onClick={() => setFilter(i)} style={{ padding: '6px 13px', borderRadius: 16, fontSize: 14, cursor: 'pointer', boxShadow: 'inset 0 0 0 1px var(--s5)', background: filter === i ? 'var(--text)' : 'transparent', color: filter === i ? 'var(--bg)' : 'var(--text)' }}>{l}</span>)}</div>
    <div style={{ fontSize: 13.5, color: 'var(--muted)', margin: '6px 4px' }}>{qq ? `${results.length} treff` : 'Alle sider'}</div>
    {results.map(([id, p]) => { const hit = qq && (p.blocks || []).find(b => (b.text || '').toLowerCase().includes(qq));
      return <div key={id} className="press" onClick={() => open(id)} style={{ display: 'flex', gap: 12, padding: '10px 4px', cursor: 'pointer', alignItems: 'center' }}>
        <span style={{ width: 28, display: 'grid', placeItems: 'center', color: 'var(--muted2)' }}><PageIcon icon={p.icon} size={20} /></span>
        <div style={{ minWidth: 0 }}><div style={{ fontSize: 16, fontWeight: 500 }}>{p.title || 'Uten tittel'}</div><div style={{ fontSize: 13.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hit ? hit.text : p.db ? 'Database' : 'Privat'}</div></div></div>; })}
    {qq && <div onClick={() => ask(q)} style={{ marginTop: 10, padding: '12px 14px', borderRadius: 12, background: 'var(--s3)', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center' }}><Logo size={26} /> Spør AI: «{q}»</div>}
  </div>;

  const AiSheet = <div onClick={e => e.target === e.currentTarget && setAi(false)} style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(0,0,0,.45)' }}>
    <div style={wide ? { position: 'absolute', right: 0, top: 0, bottom: 0, width: 380, background: 'var(--s1)', boxShadow: 'inset 1px 0 0 var(--line2)', display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top)' }
      : { position: 'absolute', left: 0, right: 0, bottom: 0, top: 'calc(58px + env(safe-area-inset-top))', background: 'var(--s1)', borderRadius: '22px 22px 0 0', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.07)', display: 'flex', flexDirection: 'column' }}>
      {!wide && <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 0' }}><span style={{ width: 38, height: 5, borderRadius: 3, background: 'var(--s7)' }} /></div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 18px 8px' }}>
        <span onClick={() => setAi(false)} style={{ fontSize: 16, cursor: 'pointer' }}>Lukk</span>
        <label style={{ position: 'relative', display: 'flex', gap: 6, fontSize: 14, fontWeight: 600, padding: '6px 12px', borderRadius: 16, background: 'var(--line2)', cursor: 'pointer', maxWidth: '60%' }}>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{modelLabel(MODELS[model % MODELS.length])}</span><span style={{ color: 'var(--muted)', fontWeight: 400 }}>⌄</span>
          <select value={model % MODELS.length} onChange={e => setModel(+e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}>
            {MODELS.map((m, i) => <option key={m || 'std'} value={i}>{modelLabel(m)}</option>)}</select></label>
        <span onClick={() => setMsgs([])} style={{ fontSize: 16, color: 'var(--muted)', cursor: 'pointer' }}>Ny</span>
      </div>
      <div ref={msgRef} style={{ flex: '1 1 0', overflow: 'auto', padding: '10px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!msgs.length && <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 30 }}>
          <Logo size={52} /><div style={{ fontSize: 27, fontWeight: 700, lineHeight: 1.2 }}>Hva kan jeg hjelpe med?</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{sugg.map(([i, l]) => <div key={l} onClick={() => ask(l)} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '13px 14px', borderRadius: 12, background: 'var(--s3)', cursor: 'pointer', fontSize: 15.5 }}><span style={{ width: 22, textAlign: 'center' }}>{i}</span>{l}</div>)}</div></div>}
        {msgs.map((m, i) => m.r === 'u'
          ? <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '82%', background: 'var(--s4)', padding: '10px 14px', borderRadius: 18, fontSize: 16, lineHeight: 1.45 }}>{m.t}</div>
          : <div key={i} style={{ alignSelf: 'flex-start', maxWidth: '96%', fontSize: 16, lineHeight: 1.55, whiteSpace: 'pre-wrap', color: 'var(--text2)' }}>{m.t}</div>)}
      </div>
      <form onSubmit={e => { e.preventDefault(); const v = input.trim(); if (v) ask(v); }} style={{ margin: '8px 14px calc(14px + env(safe-area-inset-bottom))', background: 'var(--s3)', borderRadius: 22, padding: '10px 10px 10px 16px', display: 'flex', flexDirection: 'column', gap: 8, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.06)' }}>
        {ctx && <span style={{ alignSelf: 'flex-start', fontSize: 13, color: 'var(--text3)', background: 'var(--s5)', padding: '3px 9px', borderRadius: 10, maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>@ {ctx}{page.private ? ' · 🔒 lokal AI' : ''}</span>}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input value={input} onChange={e => setInput(e.target.value)} placeholder="Spør om hva som helst …" style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', color: 'var(--text)', font: 'inherit', fontSize: 16.5 }} />
          <button type="submit" style={{ width: 34, height: 34, borderRadius: '50%', border: 0, background: 'var(--text)', color: 'var(--bg)', fontSize: 17, fontWeight: 700, cursor: 'pointer' }}>↑</button></div>
      </form>
    </div>
  </div>;

  const Settings = <SettingsView wide={wide} data={data} setData={setData} sync={sync} appIcon={appIcon} toast={showToast} prefs={prefs} setPref={setPref} initialTab={settingsTab}
    onImport={({ pages: np, roots }, label) => { setData(d => ({ ...d, pages: { ...d.pages, ...np }, priv: [...roots, ...d.priv] })); addInbox({ a: '↓', who: 'Import', t: `${label.toLowerCase()} · ${Object.keys(np).length} sider`, page: 'Arbeidsområde', id: roots[0] }); showToast(`${label}: ${Object.keys(np).length} sider`); }}
    onRestorePage={(id, pg) => setData(d => ({ ...d, pages: { ...d.pages, [id]: { ...pg, trashed: undefined, t: Date.now(), parent: pg.parent && d.pages[pg.parent] ? pg.parent : null } }, priv: d.priv.includes(id) || pg.parent ? d.priv : [id, ...d.priv] }))}
    setAppIcon={k => setData(d => ({ ...d, appIcon: k }))} onClose={() => { setSettings(false); setSettingsTab(null); }}
    onModels={m => setModels(['', ...m])}
    onReset={() => { if (confirm('Tilbakestille alle notater på denne enheten til eksempeldata?')) { setData(d => withIds({ ...d, pages: seedPages(), rows: seedRows(), recent: seedRecent, priv: seedPrivate })); setSettings(false); setScreen('home'); } }} />;

  // Kontekstmeny for en side (sidetre og ···-menyen)
  const pageActions = id => { const p = pages[id]; if (!p) return [];
    return [
      ...(wide ? [['Åpne i ny fane', () => open(id, 'tab')], ['Åpne i nytt vindu', () => openWindow(id)], ['Åpne i sidekikk', () => setPeek(id)]] : []),
      [p.fav ? 'Fjern fra favoritter' : 'Legg til i favoritter', () => updPage(id, x => ({ ...x, fav: !x.fav }))],
      ...(id === pageId && isPg ? [['Del og publiser', () => setModal({ type: 'share' })], ['Sidehistorikk', () => setModal({ type: 'history' })], ['Sideanalyse', () => setModal({ type: 'analytics' })], ['Kommentarer', () => setComments(true)]] : []),
      [(p.fullWidth ?? prefs.fullWidth) ? 'Vanlig bredde' : 'Full bredde', () => updPage(id, x => ({ ...x, fullWidth: !(x.fullWidth ?? prefs.fullWidth) }))],
      [p.locked ? 'Lås opp siden' : 'Lås side', () => { updPage(id, x => ({ ...x, locked: !x.locked })); showToast(p.locked ? 'Siden er låst opp' : 'Siden er låst'); }],
      [p.wiki ? 'Fjern wiki-merke' : 'Gjør om til wiki', () => updPage(id, x => ({ ...x, wiki: !x.wiki }))],
      ...(wide ? [['Gi nytt navn', () => setRenaming(id)]] : []),
      ['Dupliser', () => duplicate(id)],
      ['Legg til underside', () => newPage(id)],
      ...(p.parent ? [['Flytt til toppnivå', () => setParent(id, null)]] : []),
      [p.private ? 'Fjern privat-merking' : 'Merk som privat (bare lokal AI)', () => { updPage(id, x => ({ ...x, private: !x.private })); showToast(p.private ? 'Ikke lenger privat' : 'Privat · sendes aldri til Gemini eller Claude'); }],
      ['Flytt til …', () => setModal({ type: 'move', id })],
      ['Kopier tekst', () => { navigator.clipboard?.writeText((p.title || '') + '\n\n' + pageText(p)); showToast('Kopiert'); }],
      ['Eksporter som PDF', () => printPages([p], fileUrl) || showToast('Tillat popup-vinduer for å skrive ut')],
      ['Lagre som mal', () => saveTemplate(id)],
      ['Spør AI om siden', () => { open(id); setAi(true); }],
      ...(p.db ? [] : [['Flytt til papirkurven', () => deletePage(id)]])
    ]; };
  const menuBox = { position: 'fixed', zIndex: 45, width: 250, background: 'var(--menu)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: 12, padding: '6px 0', boxShadow: '0 12px 32px rgba(0,0,0,.5)' };
  const menuItems = (id, close) => <>{pageActions(id).map(([l, f]) => <div key={l} className="press" onClick={() => { close(); f(); }} style={{ padding: wide ? '8px 14px' : '13px 16px', fontSize: wide ? 14 : 16, cursor: 'pointer', color: l === 'Flytt til papirkurven' ? 'var(--red-fg)' : 'var(--text)' }}>{l}</div>)}
    {pages[id]?.t && <div style={{ fontSize: 12, color: 'var(--faint)', padding: '8px 14px 4px', boxShadow: 'inset 0 1px 0 var(--s6)', marginTop: 4 }}>Sist redigert {new Date(pages[id].t).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>}</>;
  const CtxMenu = ctxMenu && <><div onClick={() => setCtxMenu(null)} onContextMenu={e => { e.preventDefault(); setCtxMenu(null); }} style={{ position: 'fixed', inset: 0, zIndex: 44 }} />
    <div style={{ ...menuBox, left: Math.min(ctxMenu.x, window.innerWidth - 260), top: Math.max(8, Math.min(ctxMenu.y, window.innerHeight - 560)), maxHeight: 'calc(100vh - 16px)', overflow: 'auto' }}>{menuItems(ctxMenu.id, () => setCtxMenu(null))}</div></>;
  const Picker = picker && !picker.inline && <EmojiPicker custom={data.customEmoji || []} style={{ position: 'fixed', left: Math.min(picker.x, window.innerWidth - 350), top: Math.min(picker.y, window.innerHeight - 360) }}
    onClose={() => setPicker(null)} onPick={e => { updPage(picker.id, p => ({ ...p, icon: e })); setPicker(null); }} onRemove={() => { updPage(picker.id, p => ({ ...p, icon: 'doc' })); setPicker(null); }} />;

  const PageMenu = <><div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 11 }} />
    <div style={{ ...menuBox, position: 'absolute', zIndex: 12, right: 16, top: wide ? 44 : 'calc(64px + env(safe-area-inset-top))', maxHeight: wide ? 'calc(100% - 60px)' : '70vh', overflow: 'auto' }}>{menuItems(pageId, () => setMenu(false))}</div></>;

  const meetingDone = r => {
    const id = 'p' + uid(), date = new Date().toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
    const blocks = [{ type: 'callout', icon: '🎙️', text: `Transkribert med whisper på serveren · ${r.minutes} min` }, { type: 'h', text: 'Sammendrag' }, { type: 'p', text: r.summary },
      ...(r.decisions.length ? [{ type: 'h', text: 'Beslutninger' }, ...r.decisions.map(t => ({ type: 'li', text: t }))] : []),
      ...(r.todos.length ? [{ type: 'h', text: 'Gjøremål' }, ...r.todos.map(t => ({ type: 'todo', text: t, done: false }))] : []),
      { type: 'toggle', text: 'Transkripsjon', body: r.transcript }].map(b => ({ id: uid(), ...b }));
    setData(d => ({ ...d, pages: { ...d.pages, [id]: { icon: 'i:snakk:blå', title: `Møtenotater ${date}`, props: [{ k: 'Type', v: 'AI-møtenotat', c: 'yellow' }], blocks, t: Date.now(), todosToTasks: r.todos } }, priv: [id, ...d.priv] }));
    addInbox({ a: 'M', who: 'Marg AI', t: 'lagde sammendrag av møtet ditt', page: `Møtenotater ${date}`, id });
    setModal(null); open(id); showToast('Møtenotat opprettet');
  };
  const Modals = <>
    {modal?.type === 'share' && <ShareModal page={page} pageId={pageId} server={data.server} toast={showToast} onClose={() => setModal(null)} onLock={() => updPage(pageId, x => ({ ...x, locked: !x.locked }))} />}
    {modal?.type === 'history' && <HistoryModal pageId={pageId} current={page} onClose={() => setModal(null)} onRestore={old => { updPage(pageId, p => ({ ...p, ...old })); setModal(null); showToast('Versjonen er gjenopprettet'); }} />}
    {modal?.type === 'analytics' && <AnalyticsModal page={page} pageId={pageId} onClose={() => setModal(null)} />}
    {modal?.type === 'meeting' && <MeetingModal onClose={() => setModal(null)} toast={showToast} onDone={meetingDone} ask={p => askText(p)} />}
    {modal?.type === 'automations' && <AutomationsModal list={data.automations || []} onChange={l => setData(d => ({ ...d, automations: l }))} onClose={() => setModal(null)} />}
    {modal?.type === 'templates' && <Modal title="Ny side fra mal" onClose={() => setModal(null)}>
      {!(data.templates || []).length ? <div style={{ color: 'var(--muted)', fontSize: 14 }}>Ingen maler ennå. Åpne en side og velg ··· → Lagre som mal.</div>
        : data.templates.map(t => <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--line)' }}>
          <PageIcon icon={t.icon} size={18} /><span style={{ flex: 1 }}>{t.title}</span>
          <button style={smallBtn} onClick={() => fromTemplate(t)}>Bruk</button>
          <span onClick={() => setData(d => ({ ...d, templates: d.templates.filter(x => x.id !== t.id) }))} style={{ cursor: 'pointer', color: 'var(--faint)' }}>×</span></div>)}
    </Modal>}
    {modal?.type === 'move' && <Modal title={`Flytt «${pages[modal.id]?.title || 'Uten tittel'}»`} onClose={() => setModal(null)}>
      <div className="press" onClick={() => { setParent(modal.id, null); setModal(null); }} style={{ padding: '8px 6px', borderRadius: 6, cursor: 'pointer' }}>⤒ Toppnivå</div>
      {Object.entries(pages).filter(([k, p]) => !p.trashed && !p.db && k !== modal.id && !isDescendant(modal.id, k)).map(([k, p]) => <div key={k} className="press" onClick={() => { setParent(modal.id, k); setModal(null); }} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 6px', borderRadius: 6, cursor: 'pointer' }}><PageIcon icon={p.icon} size={16} />{p.title || 'Uten tittel'}</div>)}
    </Modal>}
    {comments && isPg && <Comments wide={wide} comments={page.comments} me={sync.auth.email || 'Deg'} onClose={() => setComments(false)} onChange={c => updPage(pageId, p => ({ ...p, comments: c }))} />}
  </>;
  const content = screen === 'page' ? PageView() : screen === 'db' ? DbView() : screen === 'cal' ? Cal() : screen === 'inbox' ? Inbox() : screen === 'trash' ? Trash() : screen === 'search' ? Search : Home();

  // ---------- wide (iPad / Mac) ----------
  if (wide) {
    const nav = (k, label, ic, f, extra) => <div className="press" onClick={f || (() => { setScreen(k); setMenu(false); })} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 30, padding: '0 12px', margin: '0 6px', borderRadius: 6, cursor: 'pointer', fontSize: 14, color: screen === k ? 'var(--text)' : 'var(--text3)', background: screen === k ? 'var(--s3)' : 'transparent' }}><span style={{ width: 17, display: 'grid', placeItems: 'center' }}>{ic}</span>{label}{extra}</div>;
    const tabLabel = t => t.screen === 'page' || t.screen === 'db' ? (pages[t.pageId]?.title || 'Uten tittel') : { home: 'Hjem', cal: 'Kalender', inbox: 'Innboks', search: 'Søk', trash: 'Papirkurv' }[t.screen];
    const isMac = /Mac/.test(navigator.platform) && /Electron/.test(navigator.userAgent);
    return <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* Fanelinje med tilbake/frem, lukk og + (trafikklysene sitter her på macOS) */}
      <div className="drag" style={{ height: 38, flex: 'none', display: 'flex', alignItems: 'flex-end', gap: 2, padding: `0 8px 0 ${isMac ? 78 : 8}px`, background: 'var(--s1)', boxShadow: 'inset 0 -1px 0 var(--line)', paddingTop: 'env(safe-area-inset-top)' }}>
        <span className="nodrag" onClick={goBack} title="Tilbake (⌘[)" style={{ ...tabNav, opacity: cur.back.length ? 1 : .35 }}>‹</span>
        <span className="nodrag" onClick={goFwd} title="Frem (⌘])" style={{ ...tabNav, opacity: cur.fwd.length ? 1 : .35 }}>›</span>
        {tabs.map(t => <div key={t.id} className="nodrag" onClick={() => setActiveTab(t.id)} onAuxClick={e => e.button === 1 && closeTab(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32, maxWidth: 200, minWidth: 90, padding: '0 8px 0 12px', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontSize: 13, background: t.id === cur.id ? 'var(--bg)' : 'transparent', color: t.id === cur.id ? 'var(--text)' : 'var(--muted)' }}>
          {(t.screen === 'page' || t.screen === 'db') && pages[t.pageId] && <PageIcon icon={pages[t.pageId].icon} size={13} />}
          <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tabLabel(t)}</span>
          <span onClick={e => { e.stopPropagation(); closeTab(t.id); }} style={{ color: 'var(--faint)', padding: '0 2px' }}>×</span></div>)}
        <span className="nodrag" onClick={() => newTab()} title="Ny fane (⌘T)" style={tabNav}>+</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
      <aside style={{ width: 250, flex: 'none', background: 'var(--s1)', boxShadow: 'inset -1px 0 0 var(--line)', display: 'flex', flexDirection: 'column' }}>
        <div onClick={() => setSettings(true)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px 10px', cursor: 'pointer' }}><AppIcon variant={appIcon} size={28} /><div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 15 }}>{data.workspaceName || 'Marg'}</div><div style={{ fontSize: 11.5, color: sync.status === 'synket' ? 'var(--green-fg)' : 'var(--muted)', fontFamily: 'ui-monospace,monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>● {data.server.replace(/^https?:\/\//, '')} · {sync.auth.token ? sync.status : 'lokal'}</div></div></div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {nav('search', 'Søk', <Icon.search size={16} />, null, <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--faint)' }}>{/Mac/.test(navigator.platform) ? '⌘K' : 'Ctrl K'}</span>)}
          {nav('ai', 'Assistent', <Icon.chat size={16} />, () => setAi(true))}
          {nav('mote', 'Møtenotater', <LineIcon name="snakk" size={16} color="var(--text3)" />, () => setModal({ type: 'meeting' }))}
          {nav('import', 'Importer', <span style={{ fontSize: 14 }}>⇣</span>, () => { setSettingsTab('import'); setSettings(true); })}
          {prefs.sbHome && nav('home', 'Hjem', <Icon.home size={16} />)}
          {prefs.sbCal && nav('cal', 'Kalender', <Icon.cal size={16} />)}
          {prefs.sbInbox && nav('inbox', 'Innboks', <Icon.inbox size={16} />, null, unread > 0 && <span style={{ marginLeft: 'auto', fontSize: 11.5, background: '#eb5757', color: '#fff', borderRadius: 8, padding: '0 6px' }}>{unread}</span>)}
          {sidebarTree}
          <div style={{ height: 10 }} />
          {nav('tpl', 'Maler', <span style={{ fontSize: 13 }}>▤</span>, () => setModal({ type: 'templates' }))}
          {nav('trash', 'Papirkurv', <span style={{ fontSize: 13 }}>🗑</span>, null, trashCount > 0 && <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--faint)' }}>{trashCount}</span>)}
        </div>
        <div className="press" onClick={() => setSettings(true)} style={{ padding: '10px 18px', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, boxShadow: 'inset 0 1px 0 var(--line)', display: 'flex', gap: 10, alignItems: 'center' }}>⚙️ Innstillinger</div>
        <div className="press" onClick={() => newPage()} style={{ padding: '12px 18px calc(12px + env(safe-area-inset-bottom))', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, boxShadow: 'inset 0 1px 0 var(--line)' }}>+ Ny side</div>
      </aside>
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <div style={{ height: 44, flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 4, alignItems: 'center', fontSize: 14, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden' }}>
            {isPg && [...crumbs(pageId), pageId].map((id, i, a) => <React.Fragment key={id}>{i > 0 && <span style={{ color: 'var(--faint)' }}>/</span>}
              <span className="press" onClick={() => open(id)} style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '2px 5px', borderRadius: 4, cursor: 'pointer', color: i === a.length - 1 ? 'var(--text)' : 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}><PageIcon icon={pages[id].icon} size={14} />{pages[id].title || 'Uten tittel'}</span></React.Fragment>)}
            {isPg && page.t && <span style={{ fontSize: 12.5, color: 'var(--faint)', marginLeft: 8 }}>Redigert {when(new Date(page.t).toISOString())}</span>}
          </div>
          {isPg && <div style={{ display: 'flex', gap: 14, fontSize: 14, color: 'var(--text3)', alignItems: 'center' }}>
            <span style={{ cursor: 'pointer' }} onClick={() => setModal({ type: 'share' })}>Del</span>
            <span style={{ cursor: 'pointer' }} onClick={() => setComments(!comments)} title="Kommentarer">💬{(page.comments || []).filter(c => !c.resolved).length || ''}</span>
            <span style={{ cursor: 'pointer' }} onClick={() => setModal({ type: 'history' })} title="Sidehistorikk">🕘</span>
            <span style={{ cursor: 'pointer' }} onClick={() => setAi(true)}>✦ AI</span>
            <span style={{ cursor: 'pointer', letterSpacing: 2 }} onClick={() => setMenu(!menu)}>···</span></div>}
        </div>
        <div style={{ flex: '1 1 0', overflow: 'auto', paddingBottom: 60 }} onClick={() => slash !== null && setSlash(null)}>{content}</div>
        {menu && PageMenu}
        {peek && pages[peek] && <SidePeek page={pages[peek]} onOpen={() => open(peek)} onClose={() => setPeek(null)} />}
        {!ai && <div onClick={() => setAi(true)} title="Spør AI" style={{ position: 'absolute', right: 22, bottom: 22, width: 48, height: 48, borderRadius: '50%', ...glass, display: 'grid', placeItems: 'center', cursor: 'pointer', zIndex: 6 }}><Logo size={34} round /></div>}
        {ai && AiSheet}
        {toast && <div style={toastSt(30)}>{toast}</div>}
      </main>
      </div>
      {CtxMenu}{Picker}{Modals}
      {settings && Settings}
      <div ref={iconRef} style={{ display: 'none' }}><AppIcon variant={appIcon} size={64} /></div>
    </div>;
  }

  // ---------- mobile (iPhone / Android) ----------
  return <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top)' }}>
    {!isPg && screen !== 'search' && <div style={{ flex: 'none', display: 'flex', gap: 8, padding: '10px 14px 4px', alignItems: 'center' }}>
      <div onClick={() => setSettings(true)} style={{ position: 'relative', width: 50, height: 50, flex: 'none', borderRadius: '50%', background: 'var(--s3)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.06)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><span style={{ borderRadius: 8, overflow: 'hidden', display: 'flex' }}><AppIcon variant={appIcon} size={30} /></span>{sync.status !== 'synket' && sync.auth.token && <span style={{ position: 'absolute', top: 6, right: 6, width: 9, height: 9, borderRadius: '50%', background: '#eb5757', boxShadow: '0 0 0 2px var(--s3)' }} />}</div>
      <div onClick={() => { go({ screen: 'home' }); setMenu(false); }} style={{ flex: '1 1 auto', height: 50, borderRadius: 25, background: screen === 'home' ? 'var(--s4)' : 'var(--s2)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, cursor: 'pointer' }}>
        <Icon.home /><span style={{ fontSize: 17, fontWeight: 600 }}>{{ cal: 'Kalender', inbox: 'Innboks', trash: 'Papirkurv' }[screen] || 'Hjem'}</span></div>
    </div>}
    {isPg && <div style={{ height: 60, flex: 'none' }} />}
    <div style={{ flex: '1 1 0', minHeight: 0, overflow: 'auto', paddingBottom: 140 }} onClick={() => slash !== null && setSlash(null)}>{content}</div>
    {isPg && <>
      <div onClick={back} style={{ position: 'absolute', left: 16, top: 'calc(8px + env(safe-area-inset-top))', width: 44, height: 44, borderRadius: '50%', ...glass, display: 'grid', placeItems: 'center', cursor: 'pointer', zIndex: 5 }}><Icon.back /></div>
      <div style={{ position: 'absolute', right: 16, top: 'calc(8px + env(safe-area-inset-top))', height: 44, borderRadius: 22, ...glass, display: 'flex', alignItems: 'center', gap: 16, padding: '0 16px', zIndex: 5 }}>
        <span onClick={() => setModal({ type: 'share' })} style={{ cursor: 'pointer', display: 'flex' }}><Icon.share /></span>
        <span onClick={() => setMenu(!menu)} style={{ cursor: 'pointer', letterSpacing: 2, fontSize: 18 }}>···</span></div>
    </>}
    {menu && PageMenu}
    {screen !== 'search' && <>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 150, background: 'linear-gradient(transparent,var(--bg))', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', left: 18, right: 18, bottom: 'calc(18px + env(safe-area-inset-bottom))', display: 'flex', gap: 10 }}>
        <div onClick={() => { setScreen('search'); setMenu(false); }} style={{ width: 58, height: 58, flex: 'none', borderRadius: '50%', ...glass, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Icon.search /></div>
        <div onClick={() => setAi(true)} style={{ flex: 1, height: 58, borderRadius: 29, ...glass, display: 'flex', alignItems: 'center', gap: 12, padding: '0 9px', cursor: 'pointer', minWidth: 0 }}><Logo size={40} round /><span style={{ fontSize: 17, color: 'var(--muted)' }}>Spør AI</span></div>
        <div onClick={() => newPage()} style={{ width: 58, height: 58, flex: 'none', borderRadius: '50%', ...glass, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Icon.write /></div>
      </div></>}
    {ai && AiSheet}
    {Modals}
    {settings && Settings}
    {toast && <div style={toastSt(104)}>{toast}</div>}
    <div ref={iconRef} style={{ display: 'none' }}><AppIcon variant={appIcon} size={64} /></div>
  </div>;
}

const btn = (bg, fg) => ({ height: 40, padding: '0 18px', borderRadius: 20, border: 0, background: bg, color: fg, font: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer' });
const toastSt = b => ({ position: 'absolute', left: '50%', bottom: `calc(${b}px + env(safe-area-inset-bottom))`, transform: 'translateX(-50%)', zIndex: 30, background: 'var(--text)', color: 'var(--bg)', fontSize: 14.5, fontWeight: 500, padding: '10px 16px', borderRadius: 20, whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,.4)' });
const chip = { fontSize: 12.5, padding: '4px 9px', borderRadius: 6, background: 'rgba(0,0,0,.55)', color: '#fff', cursor: 'pointer' };
const ghost = { fontSize: 13.5, padding: '3px 7px', borderRadius: 5, color: 'var(--muted)', cursor: 'pointer' };
const badge = { display: 'inline-flex', gap: 6, fontSize: 12.5, padding: '3px 8px', borderRadius: 5 };
const navBtn = { width: 32, height: 32, borderRadius: 16, background: 'var(--s3)', display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 18 };
const smallBtn = { height: 32, padding: '0 12px', borderRadius: 8, border: 0, background: 'var(--s3)', color: 'var(--text)', font: 'inherit', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' };
const tabNav = { width: 28, height: 32, display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--muted)', fontSize: 18 };
