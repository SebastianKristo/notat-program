import React, { useState } from 'react';
import { ST, ORDER, EMNER, fmtDay } from './data.js';
import { Modal } from './PageExtras.jsx';

const pill = st => ({ padding: '2px 8px', borderRadius: 5, fontSize: 13, background: ST[st]?.bg, color: ST[st]?.fg, whiteSpace: 'nowrap' });
const cell = { padding: '8px 10px', borderTop: '1px solid var(--line)', fontSize: 14, verticalAlign: 'middle' };
const inp = { border: 0, background: 'transparent', color: 'var(--text)', font: 'inherit', fontSize: 14, width: '100%', outline: 'none' };
const iso = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + 'T12:00'); d.setDate(d.getDate() + n); return iso(d); };
const EMNE_COLOR = { DATA1200: '#b99be8', ELEK1100: '#e3b665', MATA1100: '#ec8c8c' };
export const VIEWS = [['list', 'Liste'], ['table', 'Tabell'], ['board', 'Tavle'], ['calendar', 'Kalender'], ['timeline', 'Tidslinje'], ['chart', 'Diagram'], ['gallery', 'Galleri'], ['form', 'Skjema']];

export default function DbViews({ rows, view, wide, setRow, addRow, removeRow, cycle, autofill, filling }) {
  const today = iso(new Date());
  const [month, setMonth] = useState(() => (rows.find(r => r.d)?.d || today).slice(0, 7));
  const [form, setForm] = useState({ n: '', emne: EMNER[0], st: ORDER[0], d: today, score: '' });

  if (view === 'list') return rows.map(r => <div key={r.id} className="press" onClick={() => cycle(r)} style={{ borderTop: '1px solid var(--line)', padding: '12px 0', cursor: 'pointer' }}>
    <div style={{ display: 'flex', gap: 10, fontSize: 17, fontWeight: 500 }}><span>{r.icon}</span>{r.n}</div>
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6, fontSize: 13.5, color: 'var(--muted)' }}><span style={pill(r.st)}>{r.st}</span>{r.emne} · {fmtDay(r.d)}</div>
    {r.sum && <div style={{ fontSize: 13.5, color: 'var(--text3)', marginTop: 4 }}>✦ {r.sum}</div>}
  </div>);

  if (view === 'table') return <div style={{ overflowX: 'auto' }}><table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720 }}>
    <thead><tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 13 }}>{['Navn', 'Emne', 'Status', 'Dato', '✦ Sammendrag', ''].map(h => <th key={h} style={{ ...cell, borderTop: 0, fontWeight: 500 }}>{h === '✦ Sammendrag' ? <span>{h} <button onClick={autofill} disabled={filling} style={{ marginLeft: 6, border: 0, borderRadius: 5, background: 'var(--s3)', color: 'var(--text)', fontSize: 12, padding: '2px 7px', cursor: 'pointer' }}>{filling ? 'Fyller ut …' : 'Fyll ut med AI'}</button></span> : h}</th>)}</tr></thead>
    <tbody>{rows.map(r => <tr key={r.id}>
      <td style={cell}><div style={{ display: 'flex', gap: 8 }}><span>{r.icon}</span><input value={r.n} onChange={e => setRow(r.id, { n: e.target.value })} style={inp} /></div></td>
      <td style={cell}><select value={r.emne} onChange={e => setRow(r.id, { emne: e.target.value })} style={{ ...inp, width: 'auto' }}>{[...new Set([...EMNER, r.emne])].map(x => <option key={x}>{x}</option>)}</select></td>
      <td style={cell}><select value={r.st} onChange={e => setRow(r.id, { st: e.target.value })} style={{ ...inp, ...pill(r.st), width: 'auto', border: 0 }}>{ORDER.map(x => <option key={x}>{x}</option>)}</select></td>
      <td style={cell}><input type="date" value={r.d || ''} onChange={e => setRow(r.id, { d: e.target.value })} style={{ ...inp, width: 140 }} /></td>
      <td style={{ ...cell, color: 'var(--text3)', fontSize: 13.5, maxWidth: 260 }}>{r.sum || <span style={{ color: 'var(--faint)' }}>–</span>}</td>
      <td style={{ ...cell, width: 30 }}><span onClick={() => removeRow(r.id)} title="Slett rad" style={{ cursor: 'pointer', color: 'var(--faint)' }}>×</span></td>
    </tr>)}</tbody></table></div>;

  if (view === 'board') return <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 10 }}>
    {ORDER.map(name => { const cards = rows.filter(r => r.st === name);
      return <div key={name} onDragOver={e => e.preventDefault()} onDrop={e => { const id = e.dataTransfer.getData('row'); if (id) setRow(isNaN(+id) ? id : +id, { st: name }); }} style={{ width: 250, flex: 'none', minHeight: 120 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, fontSize: 14 }}><span style={pill(name)}>{name}</span><span style={{ color: 'var(--muted)' }}>{cards.length}</span></div>
        {cards.map(r => <div key={r.id} draggable onDragStart={e => e.dataTransfer.setData('row', String(r.id))} onClick={() => cycle(r)} style={{ background: 'var(--s2)', borderRadius: 8, padding: 12, marginBottom: 8, cursor: 'grab' }}>
          <div style={{ fontSize: 15.5, fontWeight: 500 }}>{r.icon} {r.n}</div><div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>{r.emne} · {fmtDay(r.d)}</div></div>)}
      </div>; })}
  </div>;

  if (view === 'calendar') {
    const first = new Date(month + '-01T12:00'), startDow = (first.getDay() + 6) % 7, days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const cells = Array.from({ length: Math.ceil((startDow + days) / 7) * 7 }, (_, i) => i - startDow + 1);
    const shift = n => { const d = new Date(first); d.setMonth(d.getMonth() + n); setMonth(iso(d).slice(0, 7)); };
    return <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span onClick={() => shift(-1)} style={{ cursor: 'pointer', padding: '0 6px' }}>‹</span>
        <b style={{ minWidth: 140, textAlign: 'center', textTransform: 'capitalize' }}>{first.toLocaleDateString('nb-NO', { month: 'long', year: 'numeric' })}</b>
        <span onClick={() => shift(1)} style={{ cursor: 'pointer', padding: '0 6px' }}>›</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
        {['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'].map(d => <div key={d} style={{ fontSize: 12.5, color: 'var(--muted)', padding: '6px 8px', background: 'var(--s1)' }}>{d}</div>)}
        {cells.map((n, i) => { const ds = n > 0 && n <= days ? `${month}-${String(n).padStart(2, '0')}` : null;
          return <div key={i} onDragOver={e => e.preventDefault()} onDrop={e => { const id = e.dataTransfer.getData('row'); if (id && ds) setRow(isNaN(+id) ? id : +id, { d: ds }); }}
            style={{ minHeight: wide ? 86 : 56, padding: 4, borderTop: '1px solid var(--line)', borderLeft: i % 7 ? '1px solid var(--line)' : 0, background: ds ? 'transparent' : 'var(--s1)' }}>
            {ds && <div style={{ fontSize: 12, color: ds === today ? '#eb5757' : 'var(--muted)', fontWeight: ds === today ? 700 : 400 }}>{n}</div>}
            {ds && rows.filter(r => r.d === ds).map(r => <div key={r.id} draggable onDragStart={e => e.dataTransfer.setData('row', String(r.id))} onClick={() => cycle(r)} title={r.n}
              style={{ fontSize: 12, background: 'var(--s3)', borderLeft: `3px solid ${EMNE_COLOR[r.emne] || '#9b9a97'}`, borderRadius: 4, padding: '2px 5px', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}>{r.n}</div>)}
          </div>; })}
      </div></div>;
  }

  if (view === 'timeline') {
    const start = addDays(today, -3), daysN = 21, dayList = Array.from({ length: daysN }, (_, i) => addDays(start, i)), W = wide ? 38 : 28;
    return <div style={{ overflowX: 'auto' }}><div style={{ minWidth: 180 + daysN * W }}>
      <div style={{ display: 'flex', marginLeft: 180 }}>{dayList.map(d => <div key={d} style={{ width: W, flex: 'none', fontSize: 11, textAlign: 'center', color: d === today ? '#eb5757' : 'var(--muted)', paddingBottom: 6 }}>{+d.slice(8)}</div>)}</div>
      {rows.map(r => { const end = r.d || today, s = addDays(end, -(r.st === 'Ferdig' ? 2 : 4)), i0 = dayList.indexOf(s), i1 = dayList.indexOf(end);
        const a = Math.max(0, i0 < 0 ? (s < start ? 0 : daysN) : i0), b = i1 < 0 ? (end < start ? -1 : daysN - 1) : i1;
        return <div key={r.id} style={{ display: 'flex', alignItems: 'center', height: 34, borderTop: '1px solid var(--line)' }}>
          <div style={{ width: 180, flex: 'none', fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 8 }}>{r.icon} {r.n}</div>
          <div style={{ position: 'relative', height: '100%', flex: 'none', width: daysN * W }}>
            {b >= a && <div onClick={() => cycle(r)} style={{ position: 'absolute', top: 7, height: 20, left: a * W + 2, width: (b - a + 1) * W - 4, borderRadius: 5, ...pill(r.st), padding: '0 6px', fontSize: 11.5, lineHeight: '20px', overflow: 'hidden', cursor: 'pointer' }}>{r.st}</div>}
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: dayList.indexOf(today) * W + W / 2, width: 1, background: '#eb5757', opacity: .6 }} />
          </div></div>; })}
    </div></div>;
  }

  if (view === 'chart') {
    const emner = [...new Set(rows.map(r => r.emne))], max = Math.max(1, ...emner.map(e => rows.filter(r => r.emne === e).length));
    return <div>
      <div style={{ display: 'flex', gap: 14, marginBottom: 14, fontSize: 13 }}>{ORDER.map(s => <span key={s} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ width: 10, height: 10, borderRadius: 2, background: ST[s].fg }} />{s}</span>)}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 28, height: 220, padding: '0 10px', borderBottom: '1px solid var(--line)' }}>
        {emner.map(e => <div key={e} style={{ display: 'flex', flexDirection: 'column-reverse', width: 56, height: '100%' }}>
          {ORDER.map(s => { const n = rows.filter(r => r.emne === e && r.st === s).length; return n ? <div key={s} title={`${s}: ${n}`} style={{ height: `${(n / max) * 100}%`, background: ST[s].fg, borderTop: '2px solid var(--bg)', display: 'grid', placeItems: 'center', fontSize: 12, color: 'var(--bg)', fontWeight: 600 }}>{n}</div> : null; })}
        </div>)}
      </div>
      <div style={{ display: 'flex', gap: 28, padding: '6px 10px', fontSize: 12.5, color: 'var(--muted)' }}>{emner.map(e => <span key={e} style={{ width: 56, textAlign: 'center' }}>{e}</span>)}</div>
    </div>;
  }

  if (view === 'gallery') return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
    {rows.map(r => <div key={r.id} onClick={() => cycle(r)} style={{ background: 'var(--s2)', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', boxShadow: 'inset 0 0 0 1px var(--line)' }}>
      <div style={{ height: 90, display: 'grid', placeItems: 'center', fontSize: 40, background: `linear-gradient(135deg, ${EMNE_COLOR[r.emne] || '#9b9a97'}33, transparent)` }}>{r.icon}</div>
      <div style={{ padding: 12 }}><div style={{ fontWeight: 600, fontSize: 15 }}>{r.n}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, fontSize: 12.5, color: 'var(--muted)' }}><span style={pill(r.st)}>{r.st}</span>{fmtDay(r.d)}</div></div>
    </div>)}
  </div>;

  if (view === 'form') return <div style={{ maxWidth: 460, background: 'var(--s1)', borderRadius: 12, padding: 20, boxShadow: 'inset 0 0 0 1px var(--line)' }}>
    <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Ny øvingsoppgave</div>
    <div style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 16 }}>Innsending lager en ny rad i databasen.</div>
    {[['Navn', <input value={form.n} onChange={e => setForm({ ...form, n: e.target.value })} style={fi} />],
      ['Emne', <select value={form.emne} onChange={e => setForm({ ...form, emne: e.target.value })} style={fi}>{EMNER.map(x => <option key={x}>{x}</option>)}</select>],
      ['Status', <select value={form.st} onChange={e => setForm({ ...form, st: e.target.value })} style={fi}>{ORDER.map(x => <option key={x}>{x}</option>)}</select>],
      ['Dato', <input type="date" value={form.d} onChange={e => setForm({ ...form, d: e.target.value })} style={fi} />],
      ...(form.st === 'Ferdig' ? [['Vurdering (vises når Status = Ferdig)', <select value={form.score} onChange={e => setForm({ ...form, score: e.target.value })} style={fi}><option value="">Velg …</option>{['★', '★★', '★★★', '★★★★', '★★★★★'].map(x => <option key={x}>{x}</option>)}</select>]] : [])
    ].map(([l, el]) => <label key={l} style={{ display: 'block', marginBottom: 12 }}><div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>{l}</div>{el}</label>)}
    <button disabled={!form.n.trim()} onClick={() => { addRow({ icon: '📝', n: form.n.trim(), emne: form.emne, st: form.st, d: form.d, score: form.score || undefined }); setForm({ ...form, n: '', score: '' }); }}
      style={{ height: 38, padding: '0 18px', borderRadius: 8, border: 0, background: 'var(--text)', color: 'var(--bg)', font: 'inherit', fontWeight: 600, cursor: 'pointer', opacity: form.n.trim() ? 1 : .4 }}>Send inn</button>
  </div>;
  return null;
}
const fi = { width: '100%', boxSizing: 'border-box', height: 38, borderRadius: 8, border: 0, background: 'var(--s3)', color: 'var(--text)', padding: '0 11px', font: 'inherit', fontSize: 14.5 };

export function AutomationsModal({ list, onChange, onClose }) {
  const [when, setWhen] = useState('Ferdig'), [action, setAction] = useState('notify');
  const ACTIONS = { notify: 'varsle i innboksen', today: 'sett dato til i dag', week: 'flytt dato én uke frem', top: 'flytt raden øverst' };
  return <Modal title="Automatiseringer" onClose={onClose}>
    <div style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 12 }}>Utløser → handling. Kjøres når status endres i denne databasen.</div>
    {list.map(a => <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
      <span style={{ flex: 1, fontSize: 14.5 }}>{a.label}</span>
      <span onClick={() => onChange(list.map(x => x.id === a.id ? { ...x, on: !x.on } : x))} style={{ position: 'relative', width: 34, height: 20, borderRadius: 10, background: a.on ? '#2f80ed' : 'var(--s7)', cursor: 'pointer', transition: 'background 150ms' }}><span style={{ position: 'absolute', top: 2, left: a.on ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 150ms' }} /></span>
      <span onClick={() => onChange(list.filter(x => x.id !== a.id))} style={{ cursor: 'pointer', color: 'var(--faint)' }}>×</span></div>)}
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, flexWrap: 'wrap', fontSize: 14 }}>
      Når Status blir <select value={when} onChange={e => setWhen(e.target.value)} style={{ ...fi, width: 'auto', height: 32 }}>{ORDER.map(x => <option key={x}>{x}</option>)}</select>
      → <select value={action} onChange={e => setAction(e.target.value)} style={{ ...fi, width: 'auto', height: 32 }}>{Object.entries(ACTIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <button onClick={() => onChange([...list, { id: 'a' + Date.now(), on: true, when, action, label: `Når Status blir ${when} → ${ACTIONS[action]}` }])} style={{ height: 32, padding: '0 12px', borderRadius: 8, border: 0, background: 'var(--text)', color: 'var(--bg)', font: 'inherit', fontWeight: 600, cursor: 'pointer' }}>Legg til</button>
    </div>
  </Modal>;
}
