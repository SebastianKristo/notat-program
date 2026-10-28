import React, { useEffect, useRef, useState } from 'react';
import { api, post, loggedIn, fileUrl, uploadFile, pickFile } from './api.js';
import { blocksToHtml } from './io.js';

const btn = (bg = 'var(--s3)', fg = 'var(--text)') => ({ height: 34, padding: '0 14px', borderRadius: 8, border: 0, background: bg, color: fg, font: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' });
const field = { width: '100%', boxSizing: 'border-box', height: 36, borderRadius: 8, border: 0, background: 'var(--s3)', color: 'var(--text)', padding: '0 11px', font: 'inherit', fontSize: 14 };
const fmt = d => new Date(d).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const needLogin = <div style={{ color: 'var(--muted)', fontSize: 14 }}>Logg inn på serveren (Innstillinger → Min konto) for å bruke dette.</div>;

export function Modal({ title, onClose, width = 520, children, footer }) {
  useEffect(() => { const f = e => e.key === 'Escape' && onClose(); window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [onClose]);
  return <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center', padding: 16 }}>
    <div style={{ width: '100%', maxWidth: width, maxHeight: '86vh', display: 'flex', flexDirection: 'column', background: 'var(--s1)', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,.4), inset 0 0 0 1px var(--line2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', boxShadow: 'inset 0 -1px 0 var(--line)' }}>
        <span style={{ fontSize: 16.5, fontWeight: 700, flex: 1 }}>{title}</span>
        <span onClick={onClose} style={{ cursor: 'pointer', color: 'var(--muted)', fontSize: 20, lineHeight: 1 }}>×</span></div>
      <div style={{ padding: 18, overflow: 'auto', flex: 1 }}>{children}</div>
      {footer && <div style={{ padding: '12px 18px', boxShadow: 'inset 0 1px 0 var(--line)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>{footer}</div>}
    </div></div>;
}
const Toggle = ({ on, onChange }) => <span onClick={() => onChange(!on)} style={{ position: 'relative', width: 34, height: 20, flex: 'none', borderRadius: 10, background: on ? 'var(--accent, #2f80ed)' : 'var(--s7)', cursor: 'pointer', transition: 'background 150ms' }}>
  <span style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 150ms' }} /></span>;
const Line = ({ label, desc, children }) => <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--line)' }}>
  <div style={{ flex: 1 }}><div style={{ fontSize: 14.5, fontWeight: 500 }}>{label}</div>{desc && <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>{desc}</div>}</div>{children}</div>;

// ---------- Del og publiser ----------
export function ShareModal({ page, pageId, server, onClose, toast, onLock }) {
  const [pub, setPub] = useState(undefined);
  const [f, setF] = useState({ slug: (page.title || '').toLowerCase().replace(/[^a-z0-9æøå]+/g, '-').replace(/^-|-$/g, '').slice(0, 40), password: '', indexable: false, expiresDays: 0 });
  const base = server.replace(/\/$/, '');
  const load = () => api('/api/publish').then(l => setPub(l.find(x => x.page_id === pageId) || null)).catch(() => setPub(null));
  useEffect(() => { if (loggedIn()) load(); }, []);
  const url = pub ? `${base}/p/${pub.slug}` : '';
  const publish = () => post('/api/publish', { pageId, slug: f.slug, password: f.password, indexable: f.indexable, expiresDays: +f.expiresDays || null }).then(() => { load(); toast('Publisert'); }).catch(e => toast(e.message));
  return <Modal title="Del og publiser" onClose={onClose}>
    {!loggedIn() ? needLogin : pub === undefined ? <div style={{ color: 'var(--muted)' }}>Henter …</div> : <>
      {pub && <div style={{ background: 'var(--green-bg)', color: 'var(--green-fg)', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>● Publisert på <a href={url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{url}</a>{pub.protected ? ' · passord' : ''}</span>
        <button style={btn()} onClick={() => { navigator.clipboard?.writeText(url); toast('Lenke kopiert'); }}>Kopier lenke</button></div>}
      <Line label="Adresse" desc={`${base}/p/…`}><input value={f.slug} onChange={e => setF({ ...f, slug: e.target.value })} style={{ ...field, width: 200 }} /></Line>
      <Line label="Passord" desc={pub?.protected ? 'Siden har passord nå. Tomt felt fjerner det.' : 'Valgfritt'}><input type="password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} style={{ ...field, width: 200 }} /></Line>
      <Line label="Lenken utløper"><select value={f.expiresDays} onChange={e => setF({ ...f, expiresDays: e.target.value })} style={{ ...field, width: 200 }}>
        {[[0, 'Aldri'], [1, 'Om 1 dag'], [7, 'Om 7 dager'], [30, 'Om 30 dager']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Line>
      <Line label="Tillat søkemotorer" desc="Uten dette får siden noindex"><Toggle on={f.indexable} onChange={v => setF({ ...f, indexable: v })} /></Line>
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <button style={btn('var(--text)', 'var(--bg)')} onClick={publish}>{pub ? 'Oppdater' : 'Publiser'}</button>
        {pub && <button style={btn('var(--red-bg)', 'var(--red-fg)')} onClick={() => post('/api/unpublish', { pageId }).then(() => { setPub(null); toast('Ikke lenger publisert'); })}>Avpubliser</button>}
        <button style={btn()} onClick={onLock}>{page.locked ? 'Lås opp siden' : 'Lås siden'}</button>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 12 }}>Den publiserte siden viser siste synkede versjon. Endringer synkes automatisk etter et sekund.</div>
    </>}
  </Modal>;
}

// ---------- Sidehistorikk ----------
export function HistoryModal({ pageId, current, onRestore, onClose }) {
  const [list, setList] = useState(null), [sel, setSel] = useState(0), [err, setErr] = useState('');
  useEffect(() => { if (loggedIn()) post('/api/history/page', { pageId }).then(setList).catch(e => setErr(e.message)); }, []);
  const v = list?.[sel], curTexts = new Set((current.blocks || []).map(b => b.text)), oldTexts = new Set((v?.page?.blocks || []).map(b => b.text));
  return <Modal title="Sidehistorikk" width={860} onClose={onClose} footer={v && <button style={btn('var(--text)', 'var(--bg)')} onClick={() => onRestore(v.page)}>Gjenopprett denne versjonen</button>}>
    {!loggedIn() ? needLogin : err ? <div style={{ color: 'var(--red-fg)' }}>{err}</div> : !list ? <div style={{ color: 'var(--muted)' }}>Henter …</div> : !list.length ? <div style={{ color: 'var(--muted)', fontSize: 14 }}>Ingen tidligere versjoner ennå. Serveren lagrer en versjon når det har gått minst fem minutter mellom endringer, og tar vare på alle.</div> :
      <div style={{ display: 'flex', gap: 16, minHeight: 360, flexWrap: 'wrap' }}>
        <div style={{ width: 200, flex: 'none' }}>{list.map((h, i) => <div key={h.id} className="press" onClick={() => setSel(i)} style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 14, background: i === sel ? 'var(--s3)' : 'transparent' }}>{fmt(h.at)}</div>)}</div>
        <div style={{ flex: 1, minWidth: 260, background: 'var(--bg)', borderRadius: 8, padding: 16, fontSize: 15, lineHeight: 1.55 }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>{v.page.title || 'Uten tittel'}</div>
          {(v.page.blocks || []).map((b, i) => <div key={i} style={{ padding: '2px 6px', borderRadius: 4, background: !curTexts.has(b.text) ? 'var(--green-bg)' : 'transparent', fontWeight: b.type === 'h' ? 700 : 400 }}>{b.type === 'todo' ? (b.done ? '☑ ' : '☐ ') : b.type === 'li' ? '• ' : ''}{b.text}</div>)}
          {(current.blocks || []).filter(b => b.text && !oldTexts.has(b.text)).map((b, i) => <div key={'x' + i} style={{ padding: '2px 6px', borderRadius: 4, background: 'var(--red-bg)', textDecoration: 'line-through', opacity: .8 }}>{b.text}</div>)}
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12 }}>Grønt finnes i denne versjonen, men ikke nå. Gjennomstreket finnes nå, men ikke i denne versjonen.</div>
        </div>
      </div>}
  </Modal>;
}

// ---------- Sideanalyse ----------
export function AnalyticsModal({ page, pageId, onClose }) {
  const [views, setViews] = useState(null), [pub, setPub] = useState(null);
  useEffect(() => { if (!loggedIn()) return; api('/api/publish').then(l => { const p = l.find(x => x.page_id === pageId); setPub(p || false); if (p) api(`/api/publish/${encodeURIComponent(p.slug)}/views`).then(setViews); }).catch(() => setPub(false)); }, []);
  const words = (page.blocks || []).map(b => `${b.text || ''} ${b.body || ''}`).join(' ').split(/\s+/).filter(Boolean).length;
  const max = Math.max(1, ...(views || []).map(v => v.count)), total = (views || []).reduce((a, v) => a + v.count, 0);
  return <Modal title="Sideanalyse" onClose={onClose}>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 18 }}>
      {[['Ord', words], ['Blokker', (page.blocks || []).length], ['Lesetid', Math.max(1, Math.round(words / 200)) + ' min']].map(([l, v]) => <div key={l} style={{ background: 'var(--s2)', borderRadius: 10, padding: 12 }}><div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{l}</div><div style={{ fontSize: 22, fontWeight: 700 }}>{v}</div></div>)}
    </div>
    {page.t && <div style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 14 }}>Sist redigert {fmt(page.t)}</div>}
    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Visninger av publisert side, siste 28 dager</div>
    {!loggedIn() ? needLogin : pub === false ? <div style={{ color: 'var(--muted)', fontSize: 14 }}>Siden er ikke publisert.</div> : !views ? <div style={{ color: 'var(--muted)' }}>Henter …</div> : <>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120 }}>{views.map(v => <div key={v.day} title={`${new Date(v.day).toLocaleDateString('nb-NO')}: ${v.count}`} style={{ flex: 1, height: `${(v.count / max) * 100}%`, minHeight: 2, background: v.count ? '#2f80ed' : 'var(--s4)', borderRadius: '3px 3px 0 0' }} />)}</div>
      <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 8 }}>{total} visninger totalt</div></>}
  </Modal>;
}

// ---------- Omslag ----------
export const COVERS = ['linear-gradient(135deg,#f3cfa9,#c4703f)', 'linear-gradient(135deg,#1f3a5a,#2f80ed)', 'linear-gradient(135deg,#24412e,#7fc495)', 'linear-gradient(135deg,#3a2d52,#b99be8)', 'linear-gradient(135deg,#4d2626,#ec8c8c)', 'linear-gradient(135deg,#4a3b1c,#e3b665)',
  'linear-gradient(180deg,#2b2a27,#5f5c55)', 'radial-gradient(circle at 30% 30%,#e8a87c,#5e2f1c)', '#c4432b', '#337ea9', '#448361', '#9065b0'];
export function CoverPicker({ onPick, onRemove, onClose }) {
  const [err, setErr] = useState('');
  return <>
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 49 }} />
    <div style={{ position: 'absolute', zIndex: 50, right: 16, top: 12, width: 340, background: 'var(--menu)', backdropFilter: 'blur(20px)', borderRadius: 14, boxShadow: '0 16px 40px rgba(0,0,0,.35), 0 0 0 1px var(--line2)', padding: 12 }}>
      <div style={{ display: 'flex', marginBottom: 10 }}><span style={{ fontSize: 13.5, fontWeight: 600, flex: 1 }}>Forsidebilde</span><span onClick={onRemove} style={{ fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}>Fjern</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>{COVERS.map(c => <span key={c} onClick={() => onPick(c)} style={{ height: 44, borderRadius: 6, background: c, cursor: 'pointer' }} />)}</div>
      <button style={{ ...btn(), width: '100%', marginTop: 10 }} onClick={async () => { setErr(''); const f = await pickFile('image/*'); if (!f) return; try { const r = await uploadFile(f, 2000); onPick(`url("${r.url}")`); } catch (e) { setErr(e.message); } }}>Last opp bilde</button>
      {err && <div style={{ color: 'var(--red-fg)', fontSize: 13, marginTop: 8 }}>{err}</div>}
    </div></>;
}
export const coverCss = c => c?.startsWith('url("/api/') ? `url("${fileUrl(c.slice(5, -2))}")` : c;

// ---------- Kommentarer ----------
export function Comments({ comments = [], me, onChange, onClose, wide }) {
  const [text, setText] = useState(''), [showDone, setShowDone] = useState(false);
  const list = comments.filter(c => showDone || !c.resolved);
  const add = () => { const t = text.trim(); if (!t) return; onChange([...comments, { id: Math.random().toString(36).slice(2, 9), author: me, text: t, at: Date.now() }]); setText(''); };
  return <div style={wide ? { position: 'absolute', right: 0, top: 44, bottom: 0, width: 320, zIndex: 8, background: 'var(--s1)', boxShadow: 'inset 1px 0 0 var(--line)', display: 'flex', flexDirection: 'column' }
    : { position: 'fixed', left: 0, right: 0, bottom: 0, top: '30%', zIndex: 30, background: 'var(--s1)', borderRadius: '18px 18px 0 0', display: 'flex', flexDirection: 'column', boxShadow: '0 -10px 30px rgba(0,0,0,.3)' }}>
    <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 10 }}>
      <span style={{ fontWeight: 700, flex: 1 }}>Kommentarer</span>
      <span onClick={() => setShowDone(!showDone)} style={{ fontSize: 12.5, color: 'var(--muted)', cursor: 'pointer' }}>{showDone ? 'Skjul løste' : 'Vis løste'}</span>
      <span onClick={onClose} style={{ cursor: 'pointer', color: 'var(--muted)', fontSize: 20 }}>×</span></div>
    <div style={{ flex: 1, overflow: 'auto', padding: '0 16px' }}>
      {!list.length && <div style={{ color: 'var(--muted)', fontSize: 14, padding: '10px 0' }}>Ingen kommentarer.</div>}
      {list.map(c => <div key={c.id} style={{ padding: '10px 0', borderTop: '1px solid var(--line)', opacity: c.resolved ? .55 : 1 }}>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', display: 'flex', gap: 6 }}><b style={{ color: 'var(--text)' }}>{c.author || 'Deg'}</b>{fmt(c.at)}</div>
        <div style={{ fontSize: 14.5, margin: '4px 0', whiteSpace: 'pre-wrap' }}>{c.text}</div>
        <div style={{ display: 'flex', gap: 12, fontSize: 12.5, color: 'var(--muted)' }}>
          <span style={{ cursor: 'pointer' }} onClick={() => onChange(comments.map(x => x.id === c.id ? { ...x, resolved: !x.resolved } : x))}>{c.resolved ? 'Åpne igjen' : 'Løs'}</span>
          <span style={{ cursor: 'pointer' }} onClick={() => onChange(comments.filter(x => x.id !== c.id))}>Slett</span></div>
      </div>)}
    </div>
    <div style={{ padding: 12, boxShadow: 'inset 0 1px 0 var(--line)', display: 'flex', gap: 8, paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
      <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) add(); }} placeholder="Legg til en kommentar …" rows={2} style={{ ...field, height: 'auto', padding: 8, resize: 'none', flex: 1 }} />
      <button style={btn('var(--text)', 'var(--bg)')} onClick={add}>Send</button></div>
  </div>;
}

// ---------- AI-møtenotater ----------
export function MeetingModal({ onClose, onDone, ask, toast }) {
  const [st, setSt] = useState('idle'), [secs, setSecs] = useState(0), [text, setText] = useState(''), [err, setErr] = useState('');
  const rec = useRef(), chunks = useRef([]), timer = useRef();
  useEffect(() => () => { clearInterval(timer.current); rec.current?.stream?.getTracks().forEach(t => t.stop()); }, []);
  const start = async () => {
    setErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream); chunks.current = [];
      r.ondataavailable = e => chunks.current.push(e.data); r.onstop = () => { stream.getTracks().forEach(t => t.stop()); transcribe(new Blob(chunks.current, { type: r.mimeType })); };
      r.start(1000); rec.current = r; setSt('rec'); setSecs(0); timer.current = setInterval(() => setSecs(s => s + 1), 1000);
    } catch { setErr('Fikk ikke tilgang til mikrofonen'); }
  };
  const stop = () => { clearInterval(timer.current); rec.current?.stop(); setSt('busy'); };
  const transcribe = async blob => {
    try {
      setText('Transkriberer med whisper på serveren …');
      const r = await api('/api/transcribe', { method: 'POST', headers: { 'Content-Type': blob.type || 'audio/webm' }, body: blob });
      setText(r.text); setSt('done');
    } catch (e) { setErr(e.message); setSt('idle'); setText(''); }
  };
  const summarize = async () => {
    setSt('ai');
    const prompt = `Her er en transkripsjon av et møte. Svar på norsk i nøyaktig dette formatet:\nSAMMENDRAG:\n<2-4 setninger>\nBESLUTNINGER:\n- <beslutning>\nGJØREMÅL:\n- <gjøremål>\n\nTranskripsjon:\n${text}`;
    const out = await ask(prompt);
    const sec = name => (out.split(new RegExp(`${name}:`, 'i'))[1] || '').split(/\n[A-ZÆØÅ]+:/)[0].trim();
    const items = s => s.split('\n').map(l => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
    onDone({ summary: sec('SAMMENDRAG') || out, decisions: items(sec('BESLUTNINGER')), todos: items(sec('GJØREMÅL')), transcript: text, minutes: Math.max(1, Math.round(secs / 60)) });
  };
  const mm = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  return <Modal title="AI-møtenotater" onClose={onClose}>
    {!loggedIn() ? needLogin : <>
      <div style={{ textAlign: 'center', padding: '10px 0 16px' }}>
        <div style={{ fontSize: 40, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{mm}</div>
        <div style={{ fontSize: 13.5, color: st === 'rec' ? '#eb5757' : 'var(--muted)', margin: '4px 0 14px' }}>{st === 'rec' ? '● Tar opp' : st === 'busy' ? 'Transkriberer …' : st === 'ai' ? 'Lager sammendrag …' : st === 'done' ? 'Ferdig transkribert' : 'Klar'}</div>
        {st === 'idle' && <button style={btn('#eb5757', '#fff')} onClick={start}>🎙️ Start opptak</button>}
        {st === 'rec' && <button style={btn('var(--text)', 'var(--bg)')} onClick={stop}>■ Stopp</button>}
        {st === 'done' && <button style={btn('var(--text)', 'var(--bg)')} onClick={summarize}>✦ Lag sammendrag, beslutninger og gjøremål</button>}
      </div>
      {err && <div style={{ color: 'var(--red-fg)', fontSize: 13.5, marginBottom: 10 }}>{err}</div>}
      {text && <textarea value={text} onChange={e => setText(e.target.value)} rows={8} style={{ ...field, height: 'auto', padding: 10, resize: 'vertical' }} />}
      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 10 }}>Opptaket sendes til whisper på serveren din når du stopper (Innstillinger → Møtenotater). Ingenting går ut av nettverket med mindre du har valgt Gemini eller Claude for sammendraget.</div>
    </>}
  </Modal>;
}

// ---------- Sidekikk (skrivebeskyttet forhåndsvisning) ----------
export function SidePeek({ page, onOpen, onClose }) {
  return <div style={{ position: 'absolute', right: 0, top: 44, bottom: 0, width: 'min(520px, 50%)', zIndex: 9, background: 'var(--bg)', boxShadow: '-10px 0 30px rgba(0,0,0,.25), inset 1px 0 0 var(--line)', display: 'flex', flexDirection: 'column' }}>
    <div style={{ display: 'flex', gap: 10, padding: '10px 14px', alignItems: 'center', boxShadow: 'inset 0 -1px 0 var(--line)' }}>
      <span style={{ flex: 1, fontSize: 13.5, color: 'var(--muted)' }}>Sidekikk</span>
      <button style={btn()} onClick={onOpen}>Åpne som side</button><span onClick={onClose} style={{ cursor: 'pointer', color: 'var(--muted)', fontSize: 20 }}>×</span></div>
    <div style={{ overflow: 'auto', padding: '24px 28px' }}>
      <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>{page.title || 'Uten tittel'}</div>
      <div className="peek" style={{ fontSize: 16, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: blocksToHtml(page, fileUrl) }} />
    </div></div>;
}
