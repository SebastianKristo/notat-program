import React, { useState } from 'react';
import { LINE_ICONS, ICON_COLORS, LineIcon } from './icons.jsx';
import { uploadFile, pickFile, fileUrl } from './api.js';

// Utvalg av emoji med norske søkeord, gruppert som i designet.
const CATS = [
  ['Nylig', []],
  ['Personer', '😀 glis|😃 glad|😊 smil|😉 blunk|😍 forelsket|🤔 tenker|😎 kul|😴 søvnig|🥳 fest|😅 svette|👋 vinke hei|👍 tommel bra|🙏 takk|💪 sterk|🧠 hjerne|👀 øyne|🎓 student utdanning|👤 person|👥 personer gruppe|🧑‍💻 utvikler'],
  ['Natur', '🌱 spire|🌲 tre skog|🌸 blomst|🍀 kløver flaks|🌍 jord verden|☀️ sol|🌙 måne|⭐ stjerne|🔥 brann|💧 dråpe vann|❄️ snø|🌈 regnbue|⚡ lyn strøm|🌊 bølge hav|🏔️ fjell|🐶 hund|🐱 katt|🦊 rev|🐝 bie|🦋 sommerfugl'],
  ['Mat', '☕ kaffe|🍵 te|🍎 eple|🍕 pizza|🍔 burger|🥗 salat|🍰 kake|🍪 kjeks|🍷 vin|🍺 øl|🥐 croissant|🍳 egg frokost|🧀 ost|🍓 jordbær|🍋 sitron'],
  ['Aktiviteter', '⚽ fotball|🏃 løpe trening|🚴 sykkel|🎵 musikk|🎮 spill|🎨 kunst maling|📷 kamera foto|🎬 film|🎯 mål|🏆 premie|🎉 feiring|🎁 gave|🧩 puslespill|♟️ sjakk|🏕️ telt camping'],
  ['Reise', '✈️ fly reise|🚗 bil|🚆 tog|🚢 båt|🏠 hjem hus|🏡 hytte|🏢 kontor|🏫 skole|🗺️ kart|🧭 kompass|⛺ telt|🌆 by|🏝️ øy ferie|🛠️ verktøy|🔧 skiftenøkkel'],
  ['Objekter', '📄 side dokument|📝 notat skrive|📚 bøker|📖 bok|📌 nål|📎 binders|✏️ blyant|🖊️ penn|📅 kalender|🗓️ plan|⏰ alarm frist|💡 idé lyspære|🔑 nøkkel|🔒 lås|💻 laptop|🖥️ skjerm|📱 mobil|💾 lagre|🗄️ arkiv|📦 pakke|💰 penger|🧾 kvittering|📊 diagram|📈 graf|🧮 kalkulator|🔬 mikroskop|⚙️ innstillinger|🔔 varsel|🎙️ mikrofon møte|🗂️ mapper'],
  ['Symboler', '✅ ferdig sjekk|❌ kryss|⚠️ advarsel|❓ spørsmål|❗ viktig|💬 kommentar|❤️ hjerte|💜 lilla|💙 blå|💚 grønn|🧡 oransje|⭐ favoritt|✨ glitter ny|🔴 rød|🟢 grønn|🔵 blå|♻️ gjenbruk|➕ pluss|🔁 gjenta|🏷️ etikett']
].map(([n, s]) => [n, Array.isArray(s) ? s : s.split('|').map(x => { const i = x.indexOf(' '); return [x.slice(0, i), x.slice(i + 1)]; })]);
const ALL = CATS.flatMap(c => c[1]);
const RKEY = 'marg:recentEmoji';
const recent = () => { try { return JSON.parse(localStorage.getItem(RKEY)) || []; } catch { return []; } };

const TONES = ['', '\u{1F3FB}', '\u{1F3FC}', '\u{1F3FD}', '\u{1F3FE}', '\u{1F3FF}'];
const TONABLE = new Set(['👋', '👍', '🙏', '💪', '🏃', '🚴']);
const withTone = (e, t) => TONABLE.has(e) && t ? e + t : e;

// Ikonvelger med fanene Emoji, Ikon (linjeikoner i 9 farger) og Last opp.
// Verdier: emoji, «i:navn:farge» for linjeikon eller «u:url» for opplastet bilde.
export default function EmojiPicker({ onPick, onRemove, onClose, style, custom = [], uploadOnly }) {
  const [tab, setTab] = useState(uploadOnly ? 'upload' : 'emoji');
  const [q, setQ] = useState('');
  const [tone, setTone] = useState(() => { try { return localStorage.getItem('marg:tone') || ''; } catch { return ''; } });
  const [color, setColor] = useState('grå');
  const [err, setErr] = useState('');
  const pick = e => { try { localStorage.setItem(RKEY, JSON.stringify([e, ...recent().filter(x => x !== e)].slice(0, 16))); } catch {} onPick(e); };
  const ql = q.trim().toLowerCase();
  const customList = custom.filter(c => !ql || c.name.toLowerCase().includes(ql)).map(c => ['u:' + c.url, c.name]);
  const cats = ql ? [['Treff', [...customList, ...ALL.filter(([e, n]) => n.includes(ql))]]]
    : [...CATS.map(([n, l]) => n === 'Nylig' ? [n, recent().map(e => [e, ''])] : [n, l]), ...(custom.length ? [['Egne', customList]] : [])].filter(([, l]) => l.length);
  const tabBtn = (k, l) => <span onClick={() => setTab(k)} style={{ fontSize: 13.5, fontWeight: 600, padding: '4px 2px', cursor: 'pointer', color: tab === k ? 'var(--text)' : 'var(--muted)', boxShadow: tab === k ? 'inset 0 -2px 0 var(--text)' : 'none' }}>{l}</span>;
  const upload = async () => { setErr(''); const f = await pickFile('image/*'); if (!f) return; try { const r = await uploadFile(f, 512); onPick('u:' + r.url); } catch (e) { setErr(e.message); } };
  return <>
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 49 }} />
    <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', zIndex: 50, width: 352, maxWidth: 'calc(100vw - 32px)', background: 'var(--menu)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: 14, boxShadow: '0 16px 40px rgba(0,0,0,.35), 0 0 0 1px var(--line2)', padding: 10, ...style }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 8, padding: '0 2px' }}>
        {!uploadOnly && tabBtn('emoji', 'Emoji')}{!uploadOnly && tabBtn('icon', 'Ikon')}{tabBtn('upload', 'Last opp')}
        {onRemove && <span onClick={onRemove} style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}>Fjern</span>}
      </div>
      {tab === 'emoji' && <>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Søk etter emoji" style={{ flex: 1, minWidth: 0, height: 32, borderRadius: 8, border: 0, background: 'var(--s0)', color: 'var(--text)', padding: '0 10px', font: 'inherit', fontSize: 14 }} />
          <button title="Tilfeldig" onClick={() => pick(withTone(ALL[Math.floor(Math.random() * ALL.length)][0], tone))} style={{ height: 32, padding: '0 10px', borderRadius: 8, border: 0, background: 'var(--s5)', color: 'var(--text)', cursor: 'pointer' }}>🎲</button>
          <select title="Hudtone" value={tone} onChange={e => { setTone(e.target.value); try { localStorage.setItem('marg:tone', e.target.value); } catch {} }} style={{ height: 32, borderRadius: 8, border: 0, background: 'var(--s5)', color: 'var(--text)' }}>
            {TONES.map(t => <option key={t} value={t}>{'👋' + t}</option>)}</select>
        </div>
        <div style={{ maxHeight: 280, overflow: 'auto' }}>
          {cats.map(([n, l]) => <div key={n}>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, padding: '6px 2px 4px' }}>{n}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)' }}>{l.map(([e, name]) => <span key={n + e} title={name} onClick={() => pick(e.startsWith('u:') ? e : withTone(e, tone))} className="press" style={{ fontSize: 22, height: 36, display: 'grid', placeItems: 'center', borderRadius: 6, cursor: 'pointer' }}>
              {e.startsWith('u:') ? <img src={fileUrl(e.slice(2))} alt={name} style={{ width: 24, height: 24, objectFit: 'contain' }} /> : withTone(e, tone)}</span>)}</div>
          </div>)}
          {!cats.some(([, l]) => l.length) && <div style={{ color: 'var(--muted)', fontSize: 13.5, padding: 10 }}>Ingen treff</div>}
        </div>
      </>}
      {tab === 'icon' && <>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>{Object.entries(ICON_COLORS).map(([n, c]) => <span key={n} title={n} onClick={() => setColor(n)} style={{ width: 20, height: 20, borderRadius: '50%', background: c, cursor: 'pointer', boxShadow: color === n ? '0 0 0 2px var(--menu), 0 0 0 4px ' + c : 'none' }} />)}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', maxHeight: 260, overflow: 'auto' }}>{Object.keys(LINE_ICONS).map(n => <span key={n} title={n} className="press" onClick={() => onPick(`i:${n}:${color}`)} style={{ height: 36, display: 'grid', placeItems: 'center', borderRadius: 6, cursor: 'pointer' }}><LineIcon name={n} color={color} /></span>)}</div>
      </>}
      {tab === 'upload' && <div style={{ padding: '18px 6px', textAlign: 'center' }}>
        <button onClick={upload} style={{ height: 36, padding: '0 16px', borderRadius: 8, border: 0, background: 'var(--text)', color: 'var(--bg)', font: 'inherit', fontWeight: 600, cursor: 'pointer' }}>Velg et bilde</button>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 10 }}>Kvadratiske bilder fungerer best. Lagres på serveren når du er logget inn.</div>
        {err && <div style={{ color: 'var(--red-fg)', fontSize: 13, marginTop: 8 }}>{err}</div>}
      </div>}
    </div>
  </>;
}
