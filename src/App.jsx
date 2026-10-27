import React, { useEffect, useRef, useState } from 'react';
import { C, ST, ORDER, MODELS, EVENTS, INBOX, BLOCK_TYPES, seedPages, seedRows, seedRecent, seedPrivate } from './data.js';
import { Icon, Logo } from './icons.jsx';
import { useSync } from './sync.js';

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
  const [cred, setCred] = useState({ email: '', password: '', err: '' });

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

  const newPage = () => {
    const id = 'p' + uid();
    const b = { id: uid(), type: 'p', text: '' };
    setData(d => ({ ...d, pages: { ...d.pages, [id]: { icon: 'doc', title: '', props: [], blocks: [b] } }, priv: [id, ...d.priv] }));
    setPrev(isPg ? prev : screen); setPageId(id); setScreen('page'); setAi(false); setFocus('title');
    showToast('Ny side opprettet');
  };
  const deletePage = () => {
    const id = pageId;
    setData(d => { const p = { ...d.pages }; delete p[id]; return { ...d, pages: p, recent: d.recent.filter(x => x !== id), priv: d.priv.filter(x => x !== id) }; });
    setScreen('home'); showToast('Siden er slettet');
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
    : `Fikk ikke kontakt med ${MODELS[model]} på ${data.server}. Sjekk serveradressen i innstillinger (trykk på M-logoen).`;
  const ask = async qq => {
    setAi(true); setInput(''); setQ('');
    setMsgs(m => [...m, { r: 'u', t: qq }, { r: 'a', t: '…' }]);
    const set = t => setMsgs(m => { const n = [...m]; n[n.length - 1] = { r: 'a', t }; return n; });
    try {
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 4000);
      const res = await fetch(data.server.replace(/\/$/, '') + '/api/ai', { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', ...sync.authHeader },
        body: JSON.stringify({ model: MODELS[model], prompt: qq, context: isPg ? { pageId, text: pageText(page) } : { workspace: true } }) });
      clearTimeout(to);
      if (!res.ok || !res.body) throw new Error();
      const rd = res.body.getReader(), dec = new TextDecoder(); let acc = '';
      for (;;) { const { done, value } = await rd.read(); if (done) break; acc += dec.decode(value, { stream: true }); set(acc); }
      if (!acc) throw new Error();
    } catch { setTimeout(() => set(reply(qq)), 400); }
  };
  const sugg = [['📝', ctx ? 'Oppsummer denne siden' : 'Oppsummer Øving 7'], ['🗺️', 'Lag øvingsoppgaver om Karnaugh'], ['🔎', 'Finn notatene mine om minterm'], ['📅', 'Hva har jeg denne uken?']];

  // ---------- pieces ----------
  const row = id => { const p = pages[id]; if (!p) return null; const act = wide && isPg && id === pageId;
    return <div key={id} className="press" onClick={() => open(id)} style={{ display: 'flex', alignItems: 'center', gap: wide ? 10 : 15, height: wide ? 34 : 50, padding: wide ? '0 12px' : '0 22px', margin: wide ? '0 6px' : 0, borderRadius: wide ? 6 : 0, cursor: 'pointer', background: act ? '#2a2a2a' : 'transparent' }}>
      <span style={{ width: wide ? 20 : 28, flex: 'none', display: 'grid', placeItems: 'center', color: '#9b9a97' }}><PageIcon icon={p.icon} size={wide ? 16 : 23} /></span>
      <span style={{ fontSize: wide ? 14.5 : 17.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title || 'Uten tittel'}</span>
    </div>; };
  const sections = [['Nylige', data.recent], ['Privat', data.priv]].map(([name, ids]) => { const op = !closed[name];
    return <div key={name}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: wide ? '16px 18px 4px' : '22px 24px 6px' }}>
        <span onClick={() => setClosed(c => ({ ...c, [name]: op }))} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: wide ? 12.5 : 15, fontWeight: 600, color: '#8f8e8a', cursor: 'pointer' }}>{name} <span style={{ fontSize: 11, transform: op ? 'none' : 'rotate(-90deg)', display: 'inline-block' }}>⌄</span></span>
        {name === 'Privat' && <span onClick={newPage} style={{ color: '#8f8e8a', fontSize: 18, cursor: 'pointer' }}>+</span>}
      </div>
      {op && ids.filter(id => pages[id]).map(row)}
    </div>; });

  const Home = () => <div>{sections}</div>;

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
      e.preventDefault(); setSlash(i);
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
      default: return wrap(ed({ fontSize: 17, lineHeight: 1.55, color: '#dcdcda', padding: '3px 0' }, wide ? 'Skriv, eller trykk «/» for kommandoer' : 'Skriv noe …'));
    }
  };

  const SlashMenu = i => <div style={{ position: 'absolute', left: 0, top: '100%', zIndex: 15, width: 240, background: 'rgba(44,44,44,.96)', backdropFilter: 'blur(20px)', borderRadius: 14, padding: 6, boxShadow: '0 12px 32px rgba(0,0,0,.5)' }}>
    {BLOCK_TYPES.map(([t, l, ic]) => <div key={t} className="press" onMouseDown={e => e.preventDefault()} onClick={() => { const id = page.blocks[i].id || uid(); updBlock(i, { type: t, id }); setFocus(id + '-' + t); setTimeout(() => setFocus(id), 0); setSlash(null); }}
      style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '9px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 15 }}><span style={{ width: 26, height: 26, borderRadius: 5, background: '#333', display: 'grid', placeItems: 'center', fontSize: 13 }}>{ic}</span>{l}</div>)}
  </div>;

  const PageView = () => <div style={{ padding: wide ? '40px 0 30px' : '30px 24px', maxWidth: 760, margin: '0 auto', paddingLeft: wide ? 56 : 24, paddingRight: wide ? 56 : 24 }}>
    <div onClick={() => { const e = prompt('Emoji for siden', page.icon === 'doc' ? '' : page.icon); if (e !== null) updPage(pageId, p => ({ ...p, icon: e.trim() || 'doc' })); }} style={{ fontSize: 54, lineHeight: 1, marginBottom: 12, cursor: 'pointer', color: '#9b9a97' }}>{page.icon === 'doc' ? <Icon.doc size={54} /> : page.icon}</div>
    <Editable text={page.title} placeholder="Uten tittel" autoFocus={focus === 'title'} style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.2, marginBottom: 14 }}
      onChange={t => updPage(pageId, p => ({ ...p, title: t }))} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const b = page.blocks[0]; if (b) { const id = b.id || uid(); updBlock(0, { id }); setFocus(id); } } }} />
    {(page.props || []).map((p, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', height: 34 }}><span style={{ width: 110, color: '#8f8e8a', fontSize: 15 }}>{p.k}</span>{pill(p.v, p.c)}</div>)}
    <div style={{ height: 1, background: '#2c2c2c', margin: '14px 0 10px' }} />
    {(page.blocks || []).map((b, i) => <React.Fragment key={b.id || i}>{Block({ b, i })}</React.Fragment>)}
    <div onClick={() => insertBlock(page.blocks.length, { id: uid(), type: 'p', text: '' })} style={{ color: '#6f6e6a', fontSize: 15, padding: '14px 0', cursor: 'text' }}>+ Ny blokk</div>
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
        <span onClick={() => setModel((model + 1) % MODELS.length)} style={{ display: 'flex', gap: 6, fontSize: 14, fontWeight: 600, padding: '6px 12px', borderRadius: 16, background: '#2c2c2c', cursor: 'pointer' }}>{MODELS[model]} <span style={{ color: '#8f8e8a', fontWeight: 400 }}>· lokal ⌄</span></span>
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
        {ctx && <span style={{ alignSelf: 'flex-start', fontSize: 13, color: '#bcbcb9', background: '#333', padding: '3px 9px', borderRadius: 10, maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>@ {ctx}</span>}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input value={input} onChange={e => setInput(e.target.value)} placeholder="Spør om hva som helst …" style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', color: '#ebebe9', font: 'inherit', fontSize: 16.5 }} />
          <button type="submit" style={{ width: 34, height: 34, borderRadius: '50%', border: 0, background: '#ebebe9', color: '#191919', fontSize: 17, fontWeight: 700, cursor: 'pointer' }}>↑</button></div>
      </form>
    </div>
  </div>;

  const Settings = <div onClick={e => e.target === e.currentTarget && setSettings(false)} style={{ position: 'absolute', inset: 0, zIndex: 25, background: 'rgba(0,0,0,.5)', display: 'grid', placeItems: 'center', padding: 20 }}>
    <div style={{ width: '100%', maxWidth: 420, background: '#202020', borderRadius: 16, padding: 22, boxShadow: 'inset 0 0 0 1px #2c2c2c' }}>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Innstillinger</div>
      <div style={{ fontSize: 13.5, color: '#8f8e8a', marginBottom: 6 }}>Serveradresse</div>
      <input value={data.server} onChange={e => setData(d => ({ ...d, server: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', height: 42, borderRadius: 10, border: 0, background: '#2a2a2a', color: '#ebebe9', padding: '0 12px', font: 'inherit', fontFamily: 'ui-monospace,monospace', fontSize: 14 }} />
      <div style={{ fontSize: 13, color: '#6f6e6a', margin: '8px 0 14px' }}>Notater lagres lokalt og synkes til serveren når du er logget inn. AI kjører i Ollama på serveren.</div>
      {sync.auth.token ? <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, fontSize: 14.5 }}>
        <span>{sync.auth.email} · <span style={{ color: sync.status === 'synket' ? '#7fc495' : '#e3b665' }}>{sync.status}</span></span>
        <button onClick={sync.logout} style={btn('#2a2a2a', '#ebebe9')}>Logg ut</button></div>
      : <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
        {['email', 'password'].map(k => <input key={k} type={k} placeholder={k === 'email' ? 'E-post' : 'Passord'} value={cred[k]} onChange={e => setCred(c => ({ ...c, [k]: e.target.value }))} style={{ height: 42, borderRadius: 10, border: 0, background: '#2a2a2a', color: '#ebebe9', padding: '0 12px', font: 'inherit', fontSize: 15 }} />)}
        {cred.err && <div style={{ color: '#ec8c8c', fontSize: 13.5 }}>{cred.err}</div>}
        <div style={{ display: 'flex', gap: 8 }}>{[['Logg inn', false], ['Opprett konto', true]].map(([l, reg]) => <button key={l} onClick={async () => { try { await sync.login(cred.email, cred.password, reg); setCred({ email: '', password: '', err: '' }); showToast('Koblet til ' + data.server.replace(/^https?:\/\//, '')); } catch (e) { setCred(c => ({ ...c, err: e.message === 'Failed to fetch' ? 'Fikk ikke kontakt med serveren' : e.message })); } }} style={btn(reg ? '#2a2a2a' : '#ebebe9', reg ? '#ebebe9' : '#191919')}>{l}</button>)}</div>
      </div>}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
        <button onClick={() => { if (confirm('Tilbakestille alle notater til eksempeldata?')) { setData(d => withIds({ ...d, pages: seedPages(), rows: seedRows(), recent: seedRecent, priv: seedPrivate })); setSettings(false); setScreen('home'); } }} style={btn('#2a2a2a', '#ec8c8c')}>Tilbakestill</button>
        <button onClick={() => setSettings(false)} style={btn('#ebebe9', '#191919')}>Ferdig</button>
      </div>
    </div>
  </div>;

  const PageMenu = <div style={{ position: 'absolute', right: 16, top: 'calc(64px + env(safe-area-inset-top))', zIndex: 12, width: 250, background: 'rgba(44,44,44,.96)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: 14, padding: '6px 0', boxShadow: '0 12px 32px rgba(0,0,0,.5)' }}>
    {[['Kopier tekst', () => { navigator.clipboard?.writeText((page.title || '') + '\n\n' + pageText(page)); showToast('Kopiert'); }],
      ['Spør AI om siden', () => setAi(true)],
      ...(page.db ? [] : [['Slett side', deletePage]])].map(([l, f]) => <div key={l} className="press" onClick={() => { setMenu(false); f(); }} style={{ padding: '13px 16px', fontSize: 16, cursor: 'pointer', color: l === 'Slett side' ? '#ec8c8c' : '#ebebe9' }}>{l}</div>)}
  </div>;

  const content = screen === 'page' ? PageView() : screen === 'db' ? DbView() : screen === 'cal' ? Cal() : screen === 'inbox' ? Inbox() : screen === 'search' ? Search : Home();

  // ---------- wide (iPad / Mac) ----------
  if (wide) {
    const nav = (k, label, ic, f) => <div className="press" onClick={f || (() => { setScreen(k); setMenu(false); })} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 32, padding: '0 12px', margin: '0 6px', borderRadius: 6, cursor: 'pointer', fontSize: 14.5, color: screen === k ? '#ebebe9' : '#bcbcb9', background: screen === k ? '#2a2a2a' : 'transparent' }}>{ic}{label}</div>;
    return <div style={{ position: 'fixed', inset: 0, display: 'flex', background: '#191919' }}>
      <aside style={{ width: 250, flex: 'none', background: '#202020', boxShadow: 'inset -1px 0 0 #262626', display: 'flex', flexDirection: 'column', paddingTop: 'max(14px, env(safe-area-inset-top))' }} className="drag">
        <div className="nodrag" onClick={() => setSettings(true)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 18px 14px', cursor: 'pointer' }}><Logo size={26} r={7} /><div><div style={{ fontWeight: 600, fontSize: 15 }}>Marg</div><div style={{ fontSize: 11.5, color: sync.status === 'synket' ? '#7fc495' : '#8f8e8a', fontFamily: 'ui-monospace,monospace' }}>● {data.server.replace(/^https?:\/\//, '')}</div></div></div>
        <div className="nodrag" style={{ flex: 1, overflow: 'auto' }}>
          {nav('search', 'Søk', <Icon.search size={17} />)}
          {nav('ai', 'Spør AI', <Icon.chat size={17} />, () => setAi(true))}
          {nav('home', 'Hjem', <Icon.home size={17} />)}
          {nav('cal', 'Kalender', <Icon.cal size={17} />)}
          {nav('inbox', 'Innboks', <Icon.inbox size={17} />)}
          {sections}
        </div>
        <div className="nodrag press" onClick={newPage} style={{ padding: '14px 18px calc(14px + env(safe-area-inset-bottom))', color: '#8f8e8a', cursor: 'pointer', fontSize: 14.5, boxShadow: 'inset 0 1px 0 #262626' }}>+ Ny side</div>
      </aside>
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <div className="drag" style={{ height: 44, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', marginTop: 'env(safe-area-inset-top)' }}>
          <span style={{ fontSize: 14, color: '#8f8e8a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isPg ? (page.title || 'Uten tittel') : ''}</span>
          {isPg && <div className="nodrag" style={{ display: 'flex', gap: 14, fontSize: 14, color: '#bcbcb9' }}><span style={{ cursor: 'pointer' }} onClick={() => setAi(true)}>✦ AI</span><span style={{ cursor: 'pointer', letterSpacing: 2 }} onClick={() => setMenu(!menu)}>···</span></div>}
        </div>
        <div style={{ flex: '1 1 0', overflow: 'auto', paddingBottom: 60 }} onClick={() => slash !== null && setSlash(null)}>{content}</div>
        {menu && PageMenu}
        {ai && AiSheet}
        {toast && <div style={toastSt(30)}>{toast}</div>}
      </main>
      {settings && Settings}
    </div>;
  }

  // ---------- mobile (iPhone / Android) ----------
  const tabDefs = [['home', 'Hjem', Icon.home], ['ai', 'Chat', Icon.chat], ['cal', 'Kalender', Icon.cal], ['inbox', 'Innboks', Icon.inbox]];
  return <div style={{ position: 'fixed', inset: 0, background: '#191919', display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top)' }}>
    {!isPg && screen !== 'search' && <div style={{ flex: 'none', display: 'flex', gap: 8, padding: '10px 14px 4px', alignItems: 'center' }}>
      <div onClick={() => setSettings(true)} style={{ position: 'relative', width: 50, height: 50, flex: 'none', borderRadius: '50%', background: '#2a2a2a', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.06)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Logo size={30} r={8} /><span style={{ position: 'absolute', top: 6, right: 6, width: 9, height: 9, borderRadius: '50%', background: '#eb5757', boxShadow: '0 0 0 2px #2a2a2a' }} /></div>
      {tabDefs.map(([k, label, Ic]) => { const active = screen === k;
        return <div key={k} onClick={() => k === 'ai' ? setAi(true) : (setScreen(k), setMenu(false))} style={{ position: 'relative', flex: active ? '1 1 auto' : '0 0 66px', height: 50, borderRadius: 25, background: active ? '#2f2f2f' : '#252525', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, cursor: 'pointer', minWidth: 50 }}>
          <Ic />{active && <span style={{ fontSize: 17, fontWeight: 600 }}>{label}</span>}
          {k === 'ai' && !msgs.length && <span style={{ position: 'absolute', top: 10, right: 13, width: 8, height: 8, borderRadius: '50%', background: '#eb5757' }} />}</div>; })}
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
        <div onClick={newPage} style={{ width: 58, height: 58, flex: 'none', borderRadius: '50%', ...glass, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Icon.write /></div>
      </div></>}
    {ai && AiSheet}
    {settings && Settings}
    {toast && <div style={toastSt(104)}>{toast}</div>}
  </div>;
}

const btn = (bg, fg) => ({ height: 40, padding: '0 18px', borderRadius: 20, border: 0, background: bg, color: fg, font: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer' });
const toastSt = b => ({ position: 'absolute', left: '50%', bottom: `calc(${b}px + env(safe-area-inset-bottom))`, transform: 'translateX(-50%)', zIndex: 30, background: '#ebebe9', color: '#191919', fontSize: 14.5, fontWeight: 500, padding: '10px 16px', borderRadius: 20, whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,.4)' });
