import React, { useEffect, useRef, useState } from 'react';
import { C, ST, ORDER, EVENTS, INBOX, BLOCK_TYPES, seedPages, seedRows, seedRecent, seedPrivate } from './data.js';
import { Icon, Logo } from './icons.jsx';
import { useSync } from './sync.js';
import SettingsView from './SettingsView.jsx';
import EmojiPicker from './EmojiPicker.jsx';
import { AppIcon } from './appicons.jsx';

const KEY = 'marg:v1';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
const withIds = d => { Object.values(d.pages).forEach(p => (p.blocks || []).forEach(b => { if (!b.id) b.id = uid(); })); return d; };
const initial = () => withIds(load() || { pages: seedPages(), rows: seedRows(), recent: seedRecent, priv: seedPrivate, server: 'https://notes.kristo.no' });
const uid = () => Math.random().toString(36).slice(2, 9);
const glass = { background: 'rgba(48,48,48,.82)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.08),0 8px 24px rgba(0,0,0,.4)' };
const DAYS = [['Man', 26], ['Tir', 27], ['Ons', 28], ['Tor', 29], ['Fre', 30], ['Lør', 31], ['Søn', 1]];

function useWide() {
  const q = '(min-width: 820px)';
  const [w, setW] = useState(() => window.matchMedia(q).matches);
  useEffect(() => { const m = window.matchMedia(q), f = () => setW(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, []);
  return w;
}

function PageIcon({ icon, size = 23 }) {
  if (icon === 'doc') return <Icon.doc />;
  if (icon === 'db') return <Icon.db />;
  return <span style={{ fontSize: size }}>{icon}</span>;
}

function Editable({ text, onChange, style, placeholder, onKeyDown, autoFocus }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current && ref.current.innerText !== text) ref.current.innerText = text || ''; }, [text]);
  useEffect(() => {
    if (!autoFocus || !ref.current) return;
    const el = ref.current; el.focus();
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }, [autoFocus]);
  return <div ref={ref} className="editable" contentEditable suppressContentEditableWarning data-ph={placeholder}
    style={{ outline: 'none', minWidth: 0, flex: 1, ...style }}
    onInput={e => onChange(e.currentTarget.innerText)} onKeyDown={onKeyDown} />;
}

export default function App() {
  const wide = useWide();
  const [data, setData] = useState(initial);
  const [screen, setScreen] = useState('home');
  const [pageId, setPageId] = useState('karnaugh');
  const [prev, setPrev] = useState('home');
  const [closed, setClosed] = useState({});
  const [tog, setTog] = useState({});
  const [ai, setAi] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [model, setModel] = useState(0);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(0);
  const [dbv, setDbv] = useState('list');
  const [day, setDay] = useState(27);
  const [menu, setMenu] = useState(false);
  const [toast, setToastS] = useState(null);
  const [focus, setFocus] = useState(null);
  const [slash, setSlash] = useState(null);
  const [settings, setSettings] = useState(false);
  const tt = useRef(); const msgRef = useRef();
  const sync = useSync(data, setData);
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

  const open = id => {
    if (!pages[id]) return;
    setPrev(isPg ? prev : screen); setScreen(pages[id].db ? 'db' : 'page'); setPageId(id); setMenu(false); setAi(false); setSlash(null);
    setData(d => ({ ...d, recent: [id, ...d.recent.filter(x => x !== id)].slice(0, 12) }));
  };
  const back = () => { setScreen(prev || 'home'); setMenu(false); setSlash(null); };
  const updPage = (id, f) => setData(d => ({ ...d, pages: { ...d.pages, [id]: { ...f(d.pages[id]), t: Date.now() } } }));
  const updBlock = (i, patch) => updPage(pageId, p => ({ ...p, blocks: p.blocks.map((b, j) => j === i ? { ...b, ...patch } : b) }));
  const insertBlock = (i, b) => { updPage(pageId, p => { const bl = [...p.blocks]; bl.splice(i, 0, b); return { ...p, blocks: bl }; }); setFocus(b.id); };
  const removeBlock = i => updPage(pageId, p => ({ ...p, blocks: p.blocks.filter((_, j) => j !== i) }));

  const newPage = (parent = null) => {
    const id = 'p' + uid();
    const b = { id: uid(), type: 'p', text: '' };
    setData(d => ({ ...d, pages: { ...d.pages, [id]: { icon: 'doc', title: '', props: [], blocks: [b], parent, t: Date.now() } }, priv: parent ? d.priv : [id, ...d.priv] }));
    if (parent) setExp(e => ({ ...e, [parent]: true }));
    setPrev(isPg ? prev : screen); setPageId(id); setScreen('page'); setAi(false); setFocus('title');
    showToast(parent ? 'Ny underside opprettet' : 'Ny side opprettet');
  };
  const children = id => Object.keys(pages).filter(k => (pages[k].parent || null) === id);
  const isDescendant = (anc, id) => { for (let p = pages[id]?.parent; p; p = pages[p]?.parent) if (p === anc) return true; return false; };
  const setParent = (id, parent) => {
    if (id === parent || (parent && isDescendant(id, parent))) { showToast('Kan ikke flytte en side inn i seg selv'); return; }
    updPage(id, p => ({ ...p, parent }));
    setData(d => ({ ...d, priv: parent ? d.priv.filter(x => x !== id) : d.priv.includes(id) ? d.priv : [...d.priv, id] }));
    if (parent) setExp(e => ({ ...e, [parent]: true }));
    showToast(parent ? `Flyttet inn i «${pages[parent].title || 'Uten tittel'}»` : 'Flyttet til toppnivå');
  };
  const deletePage = (id = pageId) => {
    if (!confirm(`Slette «${pages[id]?.title || 'Uten tittel'}»?`)) return;
    setData(d => { const p = { ...d.pages }; const par = p[id]?.parent || null; delete p[id];
      for (const k in p) if (p[k].parent === id) p[k] = { ...p[k], parent: par, t: Date.now() };
      return { ...d, pages: p, recent: d.recent.filter(x => x !== id), priv: d.priv.filter(x => x !== id) }; });
    if (id === pageId) setScreen('home'); showToast('Siden er slettet');
  };
  const duplicate = id => {
    const nid = 'p' + uid(), src = pages[id];
    setData(d => ({ ...d, pages: { ...d.pages, [nid]: { ...src, title: (src.title || 'Uten tittel') + ' (kopi)', blocks: (src.blocks || []).map(b => ({ ...b, id: uid() })), fav: false, t: Date.now() } }, priv: src.parent ? d.priv : [...d.priv, nid] }));
    showToast('Duplisert');
  };

  const stOf = r => r.st;
  const cycle = r => {
    const nx = ORDER[(ORDER.indexOf(r.st) + 1) % 3];
    setData(d => ({ ...d, rows: d.rows.map(x => x.id === r.id ? { ...x, st: nx } : x) }));
    if (nx === 'Ferdig') showToast('⚡ Automatisering: markert som fullført');
  };

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
  const sugg = [['📝', ctx ? 'Oppsummer denne siden' : 'Oppsummer Øving 7'], ['🗺️', 'Lag øvingsoppgaver om Karnaugh'], ['🔎', 'Finn notatene mine om minterm'], ['📅', 'Hva har jeg denne uken?']];

  // ---------- pieces ----------
  const row = id => { const p = pages[id]; if (!p) return null;
    return <div key={id} className="press" onClick={() => open(id)} style={{ display: 'flex', alignItems: 'center', gap: 15, height: 50, padding: '0 22px', cursor: 'pointer' }}>
      <span style={{ width: 28, flex: 'none', display: 'grid', placeItems: 'center', color: '#9b9a97' }}><PageIcon icon={p.icon} size={23} /></span>
      <span style={{ fontSize: 17.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title || 'Uten tittel'}</span>
    </div>; };

  // Sidetre for iPad/Mac: undersider, dra og slipp, kontekstmeny og ikonvelger
  const treeRow = (id, depth = 0) => { const p = pages[id]; if (!p) return null;
    const kids = children(id), open_ = !!exp[id], act = isPg && id === pageId, over = drag.over === id && drag.id !== id;
    return <div key={id}>
      <div className="press tree-row" draggable={renaming !== id}
        onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); setDrag({ id, over: null }); }}
        onDragEnd={() => setDrag({ id: null, over: null })}
        onDragOver={e => { e.preventDefault(); if (drag.over !== id) setDrag(d => ({ ...d, over: id })); }}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); const src = e.dataTransfer.getData('text/plain'); setDrag({ id: null, over: null }); if (src && src !== id) setParent(src, id); }}
        onClick={() => renaming !== id && open(id)}
        onContextMenu={e => { e.preventDefault(); setCtxMenu({ id, x: e.clientX, y: e.clientY }); }}
        style={{ display: 'flex', alignItems: 'center', gap: 4, height: 30, paddingLeft: 6 + depth * 14, paddingRight: 6, margin: '0 6px', borderRadius: 6, cursor: 'pointer', background: over ? '#1f3a5a' : act ? '#2a2a2a' : 'transparent', boxShadow: over ? 'inset 0 0 0 1px #2f80ed' : 'none' }}>
        <span onClick={e => { e.stopPropagation(); setExp(x => ({ ...x, [id]: !open_ })); }} style={{ width: 16, flex: 'none', color: '#6f6e6a', fontSize: 10, textAlign: 'center', visibility: kids.length ? 'visible' : 'hidden', transform: open_ ? 'rotate(90deg)' : 'none' }}>▶</span>
        <span onClick={e => { e.stopPropagation(); setPicker({ id, x: e.clientX, y: e.clientY + 12 }); }} title="Endre ikon" style={{ width: 22, flex: 'none', display: 'grid', placeItems: 'center', color: '#9b9a97' }}><PageIcon icon={p.icon} size={15} /></span>
        {renaming === id
          ? <input autoFocus defaultValue={p.title} onClick={e => e.stopPropagation()} onBlur={e => { updPage(id, x => ({ ...x, title: e.target.value })); setRenaming(null); }}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null); }}
              style={{ flex: 1, minWidth: 0, height: 22, border: 0, borderRadius: 4, background: '#2f2f2f', color: '#ebebe9', font: 'inherit', fontSize: 14, padding: '0 6px', outline: '1px solid #2f80ed' }} />
          : <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: act ? '#ebebe9' : '#cfcfcc' }}>{p.title || 'Uten tittel'}{p.private && <span title="Privat – bare lokal AI" style={{ marginLeft: 5, fontSize: 11 }}>🔒</span>}</span>}
        <span className="hover-show" onClick={e => { e.stopPropagation(); setCtxMenu({ id, x: e.clientX, y: e.clientY }); }} style={{ color: '#8f8e8a', letterSpacing: 1, padding: '0 3px' }}>···</span>
        <span className="hover-show" onClick={e => { e.stopPropagation(); newPage(id); }} title="Legg til underside" style={{ color: '#8f8e8a', fontSize: 15, padding: '0 3px' }}>+</span>
      </div>
      {open_ && kids.map(k => treeRow(k, depth + 1))}
    </div>; };
  const dropZone = (name, f) => ({
    onDragOver: e => { e.preventDefault(); if (drag.over !== name) setDrag(d => ({ ...d, over: name })); },
    onDrop: e => { e.preventDefault(); const src = e.dataTransfer.getData('text/plain'); setDrag({ id: null, over: null }); if (src) f(src); }
  });
  const sectionHead = (name, extra, dz) => { const op = !closed[name];
    return <div {...(dz || {})} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: wide ? '16px 18px 4px' : '22px 24px 6px', borderRadius: 6, background: dz && drag.over === name ? '#1f3a5a' : 'transparent' }}>
      <span onClick={() => setClosed(c => ({ ...c, [name]: op }))} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: wide ? 12.5 : 15, fontWeight: 600, color: '#8f8e8a', cursor: 'pointer' }}>{name} <span style={{ fontSize: 11, transform: op ? 'none' : 'rotate(-90deg)', display: 'inline-block' }}>⌄</span></span>
      {extra}
    </div>; };
  const roots = Object.keys(pages).filter(k => !pages[k].parent);
  const favs = Object.keys(pages).filter(k => pages[k].fav);
  const sidebarTree = <>
    {favs.length > 0 && <div>{sectionHead('Favoritter')}{!closed.Favoritter && favs.map(id => treeRow(id))}</div>}
    <div>{sectionHead('Sider', <span onClick={() => newPage()} style={{ color: '#8f8e8a', fontSize: 18, cursor: 'pointer' }}>+</span>, dropZone('Sider', id => setParent(id, null)))}
      {!closed.Sider && roots.map(id => treeRow(id))}</div>
  </>;
  const sections = [['Nylige', data.recent], ['Privat', data.priv.filter(id => !pages[id]?.parent)]].map(([name, ids]) =>
    <div key={name}>{sectionHead(name, name === 'Privat' && <span onClick={() => newPage()} style={{ color: '#8f8e8a', fontSize: 18, cursor: 'pointer' }}>+</span>)}
      {!closed[name] && ids.filter(id => pages[id]).map(row)}</div>);

  const quick = [['cal', 'Kalender', Icon.cal], ['inbox', 'Innboks', Icon.inbox]];
  const Home = () => <div>
    <div style={{ paddingTop: 10 }}>{quick.map(([k, l, Ic]) => <div key={k} className="press" onClick={() => setScreen(k)} style={{ display: 'flex', alignItems: 'center', gap: 15, height: 50, padding: '0 22px', cursor: 'pointer' }}>
      <span style={{ width: 28, display: 'grid', placeItems: 'center', color: '#9b9a97' }}><Ic /></span><span style={{ fontSize: 17.5, fontWeight: 500 }}>{l}</span>
      {k === 'inbox' && <span style={{ marginLeft: 'auto', fontSize: 13, color: '#8f8e8a' }}>{INBOX.filter(n => n.unread).length} uleste</span>}</div>)}</div>
    {sections}</div>;

  const pill = (v, c) => <span style={{ fontSize: 14, padding: '3px 9px', borderRadius: 5, background: C[c]?.bg, color: C[c]?.fg }}>{v}</span>;

  const onBlockKey = (i, b) => e => {
    if (e.key === 'Enter' && !e.shiftKey && b.type !== 'math') {
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
    const ed = (style, ph) => <Editable text={b.text} placeholder={ph} autoFocus={focus && focus === b.id} style={style}
      onChange={t => updBlock(i, { text: t })} onKeyDown={onBlockKey(i, b)} />;
    const wrap = (c, st) => <div style={{ position: 'relative', ...st }}>{c}{slash === i && SlashMenu(i)}</div>;
    switch (b.type) {
      case 'h': return wrap(ed({ fontSize: 22, fontWeight: 700, margin: '22px 0 6px' }, 'Overskrift'));
      case 'li': return wrap(<div style={{ display: 'flex', gap: 10, fontSize: 17, lineHeight: 1.55, color: '#dcdcda', padding: '2px 0' }}><span>•</span>{ed({}, 'Liste')}</div>);
      case 'todo': { const done = !!b.done;
        return wrap(<div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', fontSize: 17, lineHeight: 1.55, padding: '3px 0' }}>
          <span onClick={() => updBlock(i, { done: !done })} style={{ width: 19, height: 19, flex: 'none', marginTop: 4, borderRadius: 4, border: `1.5px solid ${done ? '#2f80ed' : '#6f6e6a'}`, background: done ? '#2f80ed' : 'transparent', display: 'grid', placeItems: 'center', fontSize: 13, color: '#fff', cursor: 'pointer' }}>{done ? '✓' : ''}</span>
          {ed({ color: done ? '#7a7976' : '#dcdcda', textDecoration: done ? 'line-through' : 'none' }, 'Gjøremål')}</div>); }
      case 'callout': return wrap(<div style={{ display: 'flex', gap: 12, background: '#252525', borderRadius: 8, padding: '14px 16px', margin: '8px 0', fontSize: 16.5, lineHeight: 1.5 }}><span>{b.icon || '💡'}</span>{ed({}, 'Callout')}</div>);
      case 'math': return wrap(<div style={{ background: '#202020', boxShadow: 'inset 0 0 0 1px #2c2c2c', borderRadius: 8, padding: '16px', margin: '10px 0', textAlign: 'center' }}>{ed({ fontFamily: 'Georgia,"Times New Roman",serif', fontStyle: 'italic', fontSize: 21 }, 'Formel')}</div>);
      case 'toggle': return wrap(<div style={{ padding: '3px 0' }}>
        <div style={{ display: 'flex', gap: 10, fontSize: 17, lineHeight: 1.55 }}><span onClick={() => setTog(t => ({ ...t, [key]: !open_ }))} style={{ cursor: 'pointer', color: '#9b9a97', width: 14 }}>{open_ ? '▾' : '▸'}</span>{ed({ fontWeight: 500 }, 'Utvidbar liste')}</div>
        {open_ && <div style={{ padding: '4px 0 4px 24px', fontSize: 16.5, lineHeight: 1.55, color: '#bcbcb9', display: 'flex' }}>
          <Editable text={b.body || ''} placeholder="Tomt innhold" onChange={t => updBlock(i, { body: t })} /></div>}</div>);
      case 'quote': return wrap(<div style={{ borderLeft: '3px solid #ebebe9', padding: '2px 0 2px 14px', margin: '6px 0', fontSize: 17.5, lineHeight: 1.55 }}>{ed({}, 'Sitat')}</div>);
      case 'divider': return wrap(<div tabIndex={0} onKeyDown={onBlockKey(i, { ...b, text: '' })} style={{ padding: '10px 0', outline: 'none' }}><div style={{ height: 1, background: '#3a3a3a' }} /></div>);
      default: return wrap(ed({ fontSize: 17, lineHeight: 1.55, color: '#dcdcda', padding: '3px 0' }, wide ? 'Skriv, eller trykk «/» for kommandoer' : 'Skriv noe …'));
    }
  };

  const applyType = (i, t) => {
    setSlash(null); setSlashQ('');
    if (t === 'ai') { setAi(true); return; }
    const id = page.blocks[i].id || uid(); updBlock(i, { type: t, id }); setFocus(id + '-' + t); setTimeout(() => setFocus(id), 0);
  };
  const SlashMenu = i => { const ql = slashQ.trim().toLowerCase();
    const list = BLOCK_TYPES.filter(([t, l, , , w]) => !ql || (l + ' ' + w).toLowerCase().includes(ql));
    const groups = ql ? [['Treff', list]] : [...new Set(list.map(x => x[3]))].map(g => [g, list.filter(x => x[3] === g && (g !== 'Standardblokker' || !['p', 'todo', 'h'].includes(x[0])))]);
    return <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', left: 0, top: '100%', zIndex: 15, width: 280, maxHeight: 360, display: 'flex', flexDirection: 'column', background: 'rgba(44,44,44,.97)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: 14, boxShadow: '0 12px 32px rgba(0,0,0,.5)', overflow: 'hidden' }}>
      <input autoFocus value={slashQ} onChange={e => setSlashQ(e.target.value)} placeholder="Søk etter blokktype"
        onKeyDown={e => { if (e.key === 'Escape') { setSlash(null); setSlashQ(''); } if (e.key === 'Enter' && list[0]) { e.preventDefault(); applyType(i, list[0][0]); } }}
        style={{ margin: 8, height: 32, borderRadius: 8, border: 0, background: '#1f1f1f', color: '#ebebe9', padding: '0 10px', font: 'inherit', fontSize: 14 }} />
      <div style={{ overflow: 'auto', padding: '0 6px 6px' }}>
        {groups.filter(([, l]) => l.length).map(([g, l]) => <div key={g}>
          <div style={{ fontSize: 12, color: '#8f8e8a', fontWeight: 600, padding: '6px 8px 2px' }}>{g}</div>
          {l.map(([t, label, ic]) => <div key={t} className="press" onMouseDown={e => e.preventDefault()} onClick={() => applyType(i, t)}
            style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '7px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 14.5 }}>
            <span style={{ width: 26, height: 26, borderRadius: 5, background: '#333', display: 'grid', placeItems: 'center', fontSize: 13 }}>{ic}</span>{label}
            {(t === 'ai' || t === 'divider') && <span style={{ marginLeft: 'auto', fontSize: 11, padding: '1px 6px', borderRadius: 4, background: '#1f3a5a', color: '#86b6ec' }}>Ny</span>}</div>)}
        </div>)}
        {!list.length && <div style={{ color: '#8f8e8a', fontSize: 13.5, padding: 10 }}>Ingen treff</div>}
      </div>
      <div onClick={() => { setSlash(null); setSlashQ(''); }} style={{ fontSize: 12.5, color: '#8f8e8a', padding: '8px 14px', boxShadow: 'inset 0 1px 0 #3a3a3a', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}><span>Lukk menyen</span><span>esc</span></div>
    </div>; };

  const PageView = () => <div style={{ padding: wide ? '40px 0 30px' : '30px 24px', maxWidth: 760, margin: '0 auto', paddingLeft: wide ? 56 : 24, paddingRight: wide ? 56 : 24 }}>
    <div style={{ position: 'relative' }}>
      <div onClick={() => setPicker({ id: pageId, inline: true })} title="Endre ikon" style={{ fontSize: 54, lineHeight: 1, marginBottom: 12, cursor: 'pointer', color: '#9b9a97', display: 'inline-block' }}>{page.icon === 'doc' ? <Icon.doc size={54} /> : page.icon}</div>
      {picker?.inline && picker.id === pageId && <EmojiPicker style={{ left: 0, top: 64 }} onClose={() => setPicker(null)} onPick={e => { updPage(pageId, p => ({ ...p, icon: e })); setPicker(null); }} onRemove={() => { updPage(pageId, p => ({ ...p, icon: 'doc' })); setPicker(null); }} />}
    </div>
    {page.private && <div style={{ display: 'inline-flex', gap: 6, fontSize: 12.5, color: '#e3b665', background: '#4a3b1c', padding: '3px 8px', borderRadius: 5, marginBottom: 10 }}>🔒 Privat · sendes bare til lokal AI</div>}
    <Editable text={page.title} placeholder="Uten tittel" autoFocus={focus === 'title'} style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.2, marginBottom: 14 }}
      onChange={t => updPage(pageId, p => ({ ...p, title: t }))} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const b = page.blocks[0]; if (b) { const id = b.id || uid(); updBlock(0, { id }); setFocus(id); } } }} />
    {(page.props || []).map((p, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', height: 34 }}><span style={{ width: 110, color: '#8f8e8a', fontSize: 15 }}>{p.k}</span>{pill(p.v, p.c)}</div>)}
    <div style={{ height: 1, background: '#2c2c2c', margin: '14px 0 10px' }} />
    {(page.blocks || []).map((b, i) => <React.Fragment key={b.id || i}>{Block({ b, i })}</React.Fragment>)}
    <div onClick={() => insertBlock(page.blocks.length, { id: uid(), type: 'p', text: '' })} style={{ color: '#6f6e6a', fontSize: 15, padding: '14px 0', cursor: 'text' }}>+ Ny blokk</div>
    {(children(pageId).length > 0 || !wide) && <div style={{ marginTop: 18, borderTop: '1px solid #2c2c2c', paddingTop: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#8f8e8a', marginBottom: 4 }}>Undersider</div>
      {children(pageId).map(id => <div key={id} className="press" onClick={() => open(id)} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 4px', borderRadius: 6, cursor: 'pointer', fontSize: 16 }}>
        <span style={{ width: 24, display: 'grid', placeItems: 'center', color: '#9b9a97' }}><PageIcon icon={pages[id].icon} size={18} /></span><span style={{ textDecoration: 'underline', textDecorationColor: '#444', textUnderlineOffset: 3 }}>{pages[id].title || 'Uten tittel'}</span></div>)}
      <div onClick={() => newPage(pageId)} style={{ color: '#6f6e6a', fontSize: 15, padding: '8px 4px', cursor: 'pointer' }}>+ Ny underside</div>
    </div>}
  </div>;

  const DbView = () => { const rows = data.rows;
    return <div style={{ padding: wide ? '40px 56px' : '30px 24px' }}>
      <div style={{ fontSize: 40, color: '#9b9a97' }}><Icon.db size={44} /></div>
      <div style={{ fontSize: 30, fontWeight: 700, margin: '8px 0 16px' }}>{page.title}</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[['list', 'Liste'], ['board', 'Tavle']].map(([k, l]) => <span key={k} onClick={() => setDbv(k)} style={{ padding: '7px 14px', borderRadius: 16, fontSize: 14.5, fontWeight: 500, cursor: 'pointer', background: dbv === k ? '#ebebe9' : '#2a2a2a', color: dbv === k ? '#191919' : '#ebebe9' }}>{l}</span>)}
        <span onClick={() => setScreen('cal')} style={{ padding: '7px 14px', borderRadius: 16, fontSize: 14.5, cursor: 'pointer', background: '#2a2a2a', color: '#8f8e8a' }}>Kalender</span>
        <span onClick={() => { const n = prompt('Navn på ny oppgave'); if (n) setData(d => ({ ...d, rows: [...d.rows, { id: Date.now(), icon: '📝', n, emne: 'DATA1200', st: 'Ikke startet', dato: '–' }] })); }} style={{ padding: '7px 14px', borderRadius: 16, fontSize: 14.5, cursor: 'pointer', background: '#2a2a2a' }}>+ Ny</span>
      </div>
      {dbv === 'list' ? rows.map(r => <div key={r.id} className="press" onClick={() => cycle(r)} style={{ borderTop: '1px solid #262626', padding: '12px 0', cursor: 'pointer' }}>
        <div style={{ display: 'flex', gap: 10, fontSize: 17, fontWeight: 500 }}><span>{r.icon}</span>{r.n}</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6, fontSize: 13.5, color: '#8f8e8a' }}><span style={{ padding: '2px 8px', borderRadius: 5, background: ST[r.st].bg, color: ST[r.st].fg }}>{r.st}</span>{r.emne} · {r.dato}</div>
      </div>) : <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 10 }}>
        {ORDER.map(name => { const cards = rows.filter(r => stOf(r) === name);
          return <div key={name} style={{ width: 250, flex: 'none' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, fontSize: 14 }}><span style={{ padding: '2px 8px', borderRadius: 5, background: ST[name].bg, color: ST[name].fg }}>{name}</span><span style={{ color: '#8f8e8a' }}>{cards.length}</span></div>
            {cards.map(r => <div key={r.id} onClick={() => cycle(r)} style={{ background: '#252525', borderRadius: 8, padding: 12, marginBottom: 8, cursor: 'pointer' }}>
              <div style={{ fontSize: 15.5, fontWeight: 500 }}>{r.icon} {r.n}</div><div style={{ fontSize: 13, color: '#8f8e8a', marginTop: 6 }}>{r.emne} · {r.dato}</div></div>)}
          </div>; })}
      </div>}
    </div>; };

  const Cal = () => { const evs = EVENTS[day] || [];
    return <div style={{ padding: '18px 22px' }}>
      <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>Oktober</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', textAlign: 'center', gap: 4, maxWidth: 560 }}>
        {DAYS.map(([d, n]) => { const sel = n === day, today = n === 27;
          return <div key={n} onClick={() => setDay(n)} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12.5, color: '#8f8e8a' }}>{d}</span>
            <span style={{ width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 600, background: sel ? (today ? '#eb5757' : '#ebebe9') : 'transparent', color: sel ? (today ? '#fff' : '#191919') : today ? '#eb5757' : '#ebebe9' }}>{n}</span>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: EVENTS[n] ? '#6f6e6a' : 'transparent' }} /></div>; })}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#8f8e8a', margin: '24px 0 10px' }}>{(day === 27 ? 'I dag · ' : '') + DAYS.find(x => x[1] === day)[0] + (day === 1 ? ' 1. november' : ` ${day}. oktober`)}</div>
      {!evs.length && <div style={{ color: '#6f6e6a', fontSize: 15 }}>Ingen hendelser</div>}
      {evs.map(([t, n, sub, c, id], i) => <div key={i} className="press" onClick={() => open(id)} style={{ display: 'flex', gap: 12, padding: '10px 0', cursor: 'pointer' }}>
        <span style={{ width: 46, fontSize: 14, color: '#8f8e8a', paddingTop: 2 }}>{t}</span><span style={{ width: 3, borderRadius: 2, background: c }} />
        <div><div style={{ fontSize: 16.5, fontWeight: 500 }}>{n}</div><div style={{ fontSize: 13.5, color: '#8f8e8a', marginTop: 2 }}>{sub}</div></div></div>)}
    </div>; };

  const Inbox = () => <div style={{ padding: '18px 0' }}>
    <div style={{ fontSize: 28, fontWeight: 700, padding: '0 22px 12px' }}>Innboks</div>
    {INBOX.map((n, i) => <div key={i} className="press" onClick={() => open(n.id)} style={{ display: 'flex', gap: 12, padding: '12px 22px', cursor: 'pointer', alignItems: 'flex-start' }}>
      <span style={{ width: 34, height: 34, flex: 'none', borderRadius: '50%', background: n.c, display: 'grid', placeItems: 'center', fontWeight: 600, fontSize: 15 }}>{n.a}</span>
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 15.5, lineHeight: 1.4 }}><b>{n.who}</b> {n.t}</div><div style={{ fontSize: 13, color: '#8f8e8a', marginTop: 3 }}>{n.page} · {n.when}</div></div>
      {n.unread && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2f80ed', marginTop: 8 }} />}</div>)}
  </div>;

  const qq = q.trim().toLowerCase();
  const results = Object.entries(pages).filter(([, p]) => (filter !== 1 || !p.db) && (filter !== 2 || p.db) && (!qq || (p.title || '').toLowerCase().includes(qq) || (p.blocks || []).some(b => (b.text || '').toLowerCase().includes(qq)))).slice(0, 20);
  const Search = <div style={{ padding: '10px 18px' }}>
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <div style={{ flex: 1, height: 44, borderRadius: 22, background: '#2a2a2a', display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px' }}><Icon.search size={18} />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Søk" style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', color: '#ebebe9', font: 'inherit', fontSize: 16.5 }} /></div>
      {!wide && <span onClick={() => { setScreen('home'); setQ(''); }} style={{ fontSize: 16, cursor: 'pointer' }}>Avbryt</span>}
    </div>
    <div style={{ display: 'flex', gap: 8, margin: '14px 0', flexWrap: 'wrap' }}>{['Alle', 'Sider', 'Databaser'].map((l, i) => <span key={l} onClick={() => setFilter(i)} style={{ padding: '6px 13px', borderRadius: 16, fontSize: 14, cursor: 'pointer', boxShadow: 'inset 0 0 0 1px #333', background: filter === i ? '#ebebe9' : 'transparent', color: filter === i ? '#191919' : '#ebebe9' }}>{l}</span>)}</div>
    <div style={{ fontSize: 13.5, color: '#8f8e8a', margin: '6px 4px' }}>{qq ? `${results.length} treff` : 'Alle sider'}</div>
    {results.map(([id, p]) => { const hit = qq && (p.blocks || []).find(b => (b.text || '').toLowerCase().includes(qq));
      return <div key={id} className="press" onClick={() => open(id)} style={{ display: 'flex', gap: 12, padding: '10px 4px', cursor: 'pointer', alignItems: 'center' }}>
        <span style={{ width: 28, display: 'grid', placeItems: 'center', color: '#9b9a97' }}><PageIcon icon={p.icon} size={20} /></span>
        <div style={{ minWidth: 0 }}><div style={{ fontSize: 16, fontWeight: 500 }}>{p.title || 'Uten tittel'}</div><div style={{ fontSize: 13.5, color: '#8f8e8a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hit ? hit.text : p.db ? 'Database' : 'Privat'}</div></div></div>; })}
    {qq && <div onClick={() => ask(q)} style={{ marginTop: 10, padding: '12px 14px', borderRadius: 12, background: '#2a2a2a', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center' }}><Logo size={26} /> Spør AI: «{q}»</div>}
  </div>;

  const AiSheet = <div onClick={e => e.target === e.currentTarget && setAi(false)} style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(0,0,0,.45)' }}>
    <div style={wide ? { position: 'absolute', right: 0, top: 0, bottom: 0, width: 380, background: '#202020', boxShadow: 'inset 1px 0 0 #2c2c2c', display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top)' }
      : { position: 'absolute', left: 0, right: 0, bottom: 0, top: 'calc(58px + env(safe-area-inset-top))', background: '#202020', borderRadius: '22px 22px 0 0', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.07)', display: 'flex', flexDirection: 'column' }}>
      {!wide && <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 0' }}><span style={{ width: 38, height: 5, borderRadius: 3, background: '#444' }} /></div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 18px 8px' }}>
        <span onClick={() => setAi(false)} style={{ fontSize: 16, cursor: 'pointer' }}>Lukk</span>
        <label style={{ position: 'relative', display: 'flex', gap: 6, fontSize: 14, fontWeight: 600, padding: '6px 12px', borderRadius: 16, background: '#2c2c2c', cursor: 'pointer', maxWidth: '60%' }}>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{modelLabel(MODELS[model % MODELS.length])}</span><span style={{ color: '#8f8e8a', fontWeight: 400 }}>⌄</span>
          <select value={model % MODELS.length} onChange={e => setModel(+e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}>
            {MODELS.map((m, i) => <option key={m || 'std'} value={i}>{modelLabel(m)}</option>)}</select></label>
        <span onClick={() => setMsgs([])} style={{ fontSize: 16, color: '#8f8e8a', cursor: 'pointer' }}>Ny</span>
      </div>
      <div ref={msgRef} style={{ flex: '1 1 0', overflow: 'auto', padding: '10px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!msgs.length && <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 30 }}>
          <Logo size={52} /><div style={{ fontSize: 27, fontWeight: 700, lineHeight: 1.2 }}>Hva kan jeg hjelpe med?</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{sugg.map(([i, l]) => <div key={l} onClick={() => ask(l)} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '13px 14px', borderRadius: 12, background: '#2a2a2a', cursor: 'pointer', fontSize: 15.5 }}><span style={{ width: 22, textAlign: 'center' }}>{i}</span>{l}</div>)}</div></div>}
        {msgs.map((m, i) => m.r === 'u'
          ? <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '82%', background: '#2f2f2f', padding: '10px 14px', borderRadius: 18, fontSize: 16, lineHeight: 1.45 }}>{m.t}</div>
          : <div key={i} style={{ alignSelf: 'flex-start', maxWidth: '96%', fontSize: 16, lineHeight: 1.55, whiteSpace: 'pre-wrap', color: '#dcdcda' }}>{m.t}</div>)}
      </div>
      <form onSubmit={e => { e.preventDefault(); const v = input.trim(); if (v) ask(v); }} style={{ margin: '8px 14px calc(14px + env(safe-area-inset-bottom))', background: '#2a2a2a', borderRadius: 22, padding: '10px 10px 10px 16px', display: 'flex', flexDirection: 'column', gap: 8, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.06)' }}>
        {ctx && <span style={{ alignSelf: 'flex-start', fontSize: 13, color: '#bcbcb9', background: '#333', padding: '3px 9px', borderRadius: 10, maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>@ {ctx}{page.private ? ' · 🔒 lokal AI' : ''}</span>}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input value={input} onChange={e => setInput(e.target.value)} placeholder="Spør om hva som helst …" style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', color: '#ebebe9', font: 'inherit', fontSize: 16.5 }} />
          <button type="submit" style={{ width: 34, height: 34, borderRadius: '50%', border: 0, background: '#ebebe9', color: '#191919', fontSize: 17, fontWeight: 700, cursor: 'pointer' }}>↑</button></div>
      </form>
    </div>
  </div>;

  const Settings = <SettingsView wide={wide} data={data} setData={setData} sync={sync} appIcon={appIcon} toast={showToast}
    setAppIcon={k => setData(d => ({ ...d, appIcon: k }))} onClose={() => setSettings(false)}
    onModels={m => setModels(['', ...m])}
    onReset={() => { if (confirm('Tilbakestille alle notater på denne enheten til eksempeldata?')) { setData(d => withIds({ ...d, pages: seedPages(), rows: seedRows(), recent: seedRecent, priv: seedPrivate })); setSettings(false); setScreen('home'); } }} />;

  // Kontekstmeny for en side (sidetre og ···-menyen)
  const pageActions = id => { const p = pages[id]; if (!p) return [];
    return [
      [p.fav ? 'Fjern fra favoritter' : 'Legg til i favoritter', () => updPage(id, x => ({ ...x, fav: !x.fav }))],
      ...(wide ? [['Gi nytt navn', () => setRenaming(id)]] : []),
      ['Dupliser', () => duplicate(id)],
      ['Legg til underside', () => newPage(id)],
      ...(p.parent ? [['Flytt til toppnivå', () => setParent(id, null)]] : []),
      [p.private ? 'Fjern privat-merking' : 'Merk som privat (bare lokal AI)', () => { updPage(id, x => ({ ...x, private: !x.private })); showToast(p.private ? 'Ikke lenger privat' : 'Privat · sendes aldri til Gemini eller Claude'); }],
      ['Kopier tekst', () => { navigator.clipboard?.writeText((p.title || '') + '\n\n' + pageText(p)); showToast('Kopiert'); }],
      ['Spør AI om siden', () => { open(id); setAi(true); }],
      ...(p.db ? [] : [['Slett', () => deletePage(id)]])
    ]; };
  const menuBox = { position: 'fixed', zIndex: 45, width: 250, background: 'rgba(44,44,44,.97)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: 12, padding: '6px 0', boxShadow: '0 12px 32px rgba(0,0,0,.5)' };
  const menuItems = (id, close) => <>{pageActions(id).map(([l, f]) => <div key={l} className="press" onClick={() => { close(); f(); }} style={{ padding: wide ? '8px 14px' : '13px 16px', fontSize: wide ? 14 : 16, cursor: 'pointer', color: l === 'Slett' ? '#ec8c8c' : '#ebebe9' }}>{l}</div>)}
    {pages[id]?.t && <div style={{ fontSize: 12, color: '#6f6e6a', padding: '8px 14px 4px', boxShadow: 'inset 0 1px 0 #3a3a3a', marginTop: 4 }}>Sist redigert {new Date(pages[id].t).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>}</>;
  const CtxMenu = ctxMenu && <><div onClick={() => setCtxMenu(null)} onContextMenu={e => { e.preventDefault(); setCtxMenu(null); }} style={{ position: 'fixed', inset: 0, zIndex: 44 }} />
    <div style={{ ...menuBox, left: Math.min(ctxMenu.x, window.innerWidth - 260), top: Math.min(ctxMenu.y, window.innerHeight - 380) }}>{menuItems(ctxMenu.id, () => setCtxMenu(null))}</div></>;
  const Picker = picker && !picker.inline && <EmojiPicker style={{ position: 'fixed', left: Math.min(picker.x, window.innerWidth - 350), top: Math.min(picker.y, window.innerHeight - 360) }}
    onClose={() => setPicker(null)} onPick={e => { updPage(picker.id, p => ({ ...p, icon: e })); setPicker(null); }} onRemove={() => { updPage(picker.id, p => ({ ...p, icon: 'doc' })); setPicker(null); }} />;

  const PageMenu = <><div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 11 }} />
    <div style={{ ...menuBox, position: 'absolute', zIndex: 12, right: 16, top: wide ? 44 : 'calc(64px + env(safe-area-inset-top))' }}>{menuItems(pageId, () => setMenu(false))}</div></>;

  const content = screen === 'page' ? PageView() : screen === 'db' ? DbView() : screen === 'cal' ? Cal() : screen === 'inbox' ? Inbox() : screen === 'search' ? Search : Home();

  // ---------- wide (iPad / Mac) ----------
  if (wide) {
    const nav = (k, label, ic, f) => <div className="press" onClick={f || (() => { setScreen(k); setMenu(false); })} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 32, padding: '0 12px', margin: '0 6px', borderRadius: 6, cursor: 'pointer', fontSize: 14.5, color: screen === k ? '#ebebe9' : '#bcbcb9', background: screen === k ? '#2a2a2a' : 'transparent' }}>{ic}{label}</div>;
    return <div style={{ position: 'fixed', inset: 0, display: 'flex', background: '#191919' }}>
      <aside style={{ width: 250, flex: 'none', background: '#202020', boxShadow: 'inset -1px 0 0 #262626', display: 'flex', flexDirection: 'column', paddingTop: 'max(14px, env(safe-area-inset-top))' }} className="drag">
        <div className="nodrag" onClick={() => setSettings(true)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 18px 14px', cursor: 'pointer' }}><AppIcon variant={appIcon} size={28} /><div><div style={{ fontWeight: 600, fontSize: 15 }}>Marg</div><div style={{ fontSize: 11.5, color: sync.status === 'synket' ? '#7fc495' : '#8f8e8a', fontFamily: 'ui-monospace,monospace' }}>● {data.server.replace(/^https?:\/\//, '')}</div></div></div>
        <div className="nodrag" style={{ flex: 1, overflow: 'auto' }}>
          {nav('search', 'Søk', <Icon.search size={17} />)}
          {nav('ai', 'Spør AI', <Icon.chat size={17} />, () => setAi(true))}
          {nav('home', 'Hjem', <Icon.home size={17} />)}
          {nav('cal', 'Kalender', <Icon.cal size={17} />)}
          {nav('inbox', 'Innboks', <Icon.inbox size={17} />)}
          {sidebarTree}
        </div>
        <div className="nodrag press" onClick={() => setSettings(true)} style={{ padding: '10px 18px', color: '#8f8e8a', cursor: 'pointer', fontSize: 14.5, boxShadow: 'inset 0 1px 0 #262626', display: 'flex', gap: 10, alignItems: 'center' }}>⚙️ Innstillinger</div>
        <div className="nodrag press" onClick={() => newPage()} style={{ padding: '14px 18px calc(14px + env(safe-area-inset-bottom))', color: '#8f8e8a', cursor: 'pointer', fontSize: 14.5, boxShadow: 'inset 0 1px 0 #262626' }}>+ Ny side</div>
      </aside>
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <div className="drag" style={{ height: 44, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', marginTop: 'env(safe-area-inset-top)' }}>
          <span style={{ fontSize: 14, color: '#8f8e8a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isPg ? (page.title || 'Uten tittel') : ''}</span>
          {isPg && <div className="nodrag" style={{ display: 'flex', gap: 14, fontSize: 14, color: '#bcbcb9' }}><span style={{ cursor: 'pointer' }} onClick={() => setAi(true)}>✦ AI</span><span style={{ cursor: 'pointer', letterSpacing: 2 }} onClick={() => setMenu(!menu)}>···</span></div>}
        </div>
        <div style={{ flex: '1 1 0', overflow: 'auto', paddingBottom: 60 }} onClick={() => slash !== null && setSlash(null)}>{content}</div>
        {menu && PageMenu}
        {!ai && <div onClick={() => setAi(true)} title="Spør AI" style={{ position: 'absolute', right: 22, bottom: 22, width: 48, height: 48, borderRadius: '50%', ...glass, display: 'grid', placeItems: 'center', cursor: 'pointer', zIndex: 6 }}><Logo size={34} round /></div>}
        {ai && AiSheet}
        {toast && <div style={toastSt(30)}>{toast}</div>}
      </main>
      {CtxMenu}{Picker}
      {settings && Settings}
      <div ref={iconRef} style={{ display: 'none' }}><AppIcon variant={appIcon} size={64} /></div>
    </div>;
  }

  // ---------- mobile (iPhone / Android) ----------
  return <div style={{ position: 'fixed', inset: 0, background: '#191919', display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top)' }}>
    {!isPg && screen !== 'search' && <div style={{ flex: 'none', display: 'flex', gap: 8, padding: '10px 14px 4px', alignItems: 'center' }}>
      <div onClick={() => setSettings(true)} style={{ position: 'relative', width: 50, height: 50, flex: 'none', borderRadius: '50%', background: '#2a2a2a', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.06)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><span style={{ borderRadius: 8, overflow: 'hidden', display: 'flex' }}><AppIcon variant={appIcon} size={30} /></span>{sync.status !== 'synket' && sync.auth.token && <span style={{ position: 'absolute', top: 6, right: 6, width: 9, height: 9, borderRadius: '50%', background: '#eb5757', boxShadow: '0 0 0 2px #2a2a2a' }} />}</div>
      <div onClick={() => { setScreen('home'); setMenu(false); }} style={{ flex: '1 1 auto', height: 50, borderRadius: 25, background: screen === 'home' ? '#2f2f2f' : '#252525', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, cursor: 'pointer' }}>
        <Icon.home /><span style={{ fontSize: 17, fontWeight: 600 }}>{screen === 'cal' ? 'Kalender' : screen === 'inbox' ? 'Innboks' : 'Hjem'}</span></div>
    </div>}
    {isPg && <div style={{ height: 60, flex: 'none' }} />}
    <div style={{ flex: '1 1 0', minHeight: 0, overflow: 'auto', paddingBottom: 140 }} onClick={() => slash !== null && setSlash(null)}>{content}</div>
    {isPg && <>
      <div onClick={back} style={{ position: 'absolute', left: 16, top: 'calc(8px + env(safe-area-inset-top))', width: 44, height: 44, borderRadius: '50%', ...glass, display: 'grid', placeItems: 'center', cursor: 'pointer', zIndex: 5 }}><Icon.back /></div>
      <div style={{ position: 'absolute', right: 16, top: 'calc(8px + env(safe-area-inset-top))', height: 44, borderRadius: 22, ...glass, display: 'flex', alignItems: 'center', gap: 16, padding: '0 16px', zIndex: 5 }}>
        <span onClick={() => { navigator.share ? navigator.share({ title: page.title, text: pageText(page) }).catch(() => {}) : showToast('Deling er ikke tilgjengelig'); }} style={{ cursor: 'pointer', display: 'flex' }}><Icon.share /></span>
        <span onClick={() => setMenu(!menu)} style={{ cursor: 'pointer', letterSpacing: 2, fontSize: 18 }}>···</span></div>
    </>}
    {menu && PageMenu}
    {screen !== 'search' && <>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 150, background: 'linear-gradient(transparent,#191919)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', left: 18, right: 18, bottom: 'calc(18px + env(safe-area-inset-bottom))', display: 'flex', gap: 10 }}>
        <div onClick={() => { setScreen('search'); setMenu(false); }} style={{ width: 58, height: 58, flex: 'none', borderRadius: '50%', ...glass, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Icon.search /></div>
        <div onClick={() => setAi(true)} style={{ flex: 1, height: 58, borderRadius: 29, ...glass, display: 'flex', alignItems: 'center', gap: 12, padding: '0 9px', cursor: 'pointer', minWidth: 0 }}><Logo size={40} round /><span style={{ fontSize: 17, color: '#8f8e8a' }}>Spør AI</span></div>
        <div onClick={() => newPage()} style={{ width: 58, height: 58, flex: 'none', borderRadius: '50%', ...glass, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Icon.write /></div>
      </div></>}
    {ai && AiSheet}
    {settings && Settings}
    {toast && <div style={toastSt(104)}>{toast}</div>}
    <div ref={iconRef} style={{ display: 'none' }}><AppIcon variant={appIcon} size={64} /></div>
  </div>;
}

const btn = (bg, fg) => ({ height: 40, padding: '0 18px', borderRadius: 20, border: 0, background: bg, color: fg, font: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer' });
const toastSt = b => ({ position: 'absolute', left: '50%', bottom: `calc(${b}px + env(safe-area-inset-bottom))`, transform: 'translateX(-50%)', zIndex: 30, background: '#ebebe9', color: '#191919', fontSize: 14.5, fontWeight: 500, padding: '10px 16px', borderRadius: 20, whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,.4)' });
