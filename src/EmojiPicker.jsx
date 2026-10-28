import React, { useState } from 'react';

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

export default function EmojiPicker({ onPick, onRemove, onClose, style }) {
  const [q, setQ] = useState('');
  const pick = e => { try { localStorage.setItem(RKEY, JSON.stringify([e, ...recent().filter(x => x !== e)].slice(0, 16))); } catch {} onPick(e); };
  const ql = q.trim().toLowerCase();
  const cats = ql ? [['Treff', ALL.filter(([e, n]) => n.includes(ql))]] : CATS.map(([n, l]) => n === 'Nylig' ? [n, recent().map(e => [e, ''])] : [n, l]).filter(([, l]) => l.length);
  return <>
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 49 }} />
    <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', zIndex: 50, width: 340, maxWidth: 'calc(100vw - 32px)', background: 'rgba(44,44,44,.98)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: 14, boxShadow: '0 16px 40px rgba(0,0,0,.55)', padding: 10, ...style }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Søk etter emoji" style={{ flex: 1, minWidth: 0, height: 32, borderRadius: 8, border: 0, background: '#1f1f1f', color: '#ebebe9', padding: '0 10px', font: 'inherit', fontSize: 14 }} />
        <button title="Tilfeldig" onClick={() => pick(ALL[Math.floor(Math.random() * ALL.length)][0])} style={{ height: 32, padding: '0 10px', borderRadius: 8, border: 0, background: '#333', color: '#ebebe9', cursor: 'pointer' }}>🎲</button>
        {onRemove && <button onClick={onRemove} style={{ height: 32, padding: '0 10px', borderRadius: 8, border: 0, background: '#333', color: '#ebebe9', cursor: 'pointer', font: 'inherit', fontSize: 13 }}>Fjern</button>}
      </div>
      <div style={{ maxHeight: 280, overflow: 'auto' }}>
        {cats.map(([n, l]) => <div key={n}>
          <div style={{ fontSize: 12, color: '#8f8e8a', fontWeight: 600, padding: '6px 2px 4px' }}>{n}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)' }}>{l.map(([e, name]) => <span key={n + e} title={name} onClick={() => pick(e)} className="press" style={{ fontSize: 22, height: 36, display: 'grid', placeItems: 'center', borderRadius: 6, cursor: 'pointer' }}>{e}</span>)}</div>
        </div>)}
        {!cats.some(([, l]) => l.length) && <div style={{ color: '#8f8e8a', fontSize: 13.5, padding: 10 }}>Ingen treff</div>}
      </div>
    </div>
  </>;
}
