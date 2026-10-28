import React, { useEffect, useState } from 'react';

const field = { width: '100%', boxSizing: 'border-box', height: 42, borderRadius: 10, border: 0, background: '#2a2a2a', color: '#ebebe9', padding: '0 12px', font: 'inherit', fontSize: 14 };
const label = { fontSize: 13.5, color: '#8f8e8a', margin: '14px 0 6px' };
const btn = (bg, fg) => ({ height: 38, padding: '0 16px', borderRadius: 19, border: 0, background: bg, color: fg, font: 'inherit', fontSize: 14.5, fontWeight: 600, cursor: 'pointer' });
const dot = ok => <span style={{ color: ok ? '#7fc495' : '#ec8c8c' }}>●</span>;

// Serverinnstillinger (Ollama) og serveroppdatering. Vises bare når brukeren er logget inn.
export default function ServerSettings({ server, authHeader, onModels, toast }) {
  const base = server.replace(/\/$/, '');
  const api = (p, o = {}) => fetch(base + p, { ...o, headers: { 'Content-Type': 'application/json', ...authHeader } }).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Feil ' + r.status); return j; });
  const [s, setS] = useState(null);
  const [models, setModels] = useState([]);
  const [ver, setVer] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const loadModels = () => api('/api/models').then(m => { setModels(m); onModels?.(m); }).catch(() => setModels([]));
  const loadVer = () => api('/api/server/version').then(setVer).catch(e => setVer({ error: e.message }));
  useEffect(() => { api('/api/settings').then(x => { setS(x); loadModels(); if (x.admin) loadVer(); }).catch(e => setErr(e.message)); }, [base]);

  // Følg en pågående oppdatering. API-et starter på nytt underveis, så feil ignoreres til den svarer igjen.
  useEffect(() => {
    if (!ver?.job?.running && !busy) return;
    const t = setInterval(() => api('/api/server/version').then(v => { setVer(v); if (!v.job?.running) { setBusy(false); toast?.(v.job?.ok ? 'Serveren er oppdatert' : 'Oppdateringen feilet'); } }).catch(() => {}), 3000);
    return () => clearInterval(t);
  }, [ver?.job?.running, busy]);

  if (err) return <div style={{ color: '#ec8c8c', fontSize: 13.5, marginBottom: 14 }}>{err}</div>;
  if (!s) return <div style={{ color: '#8f8e8a', fontSize: 13.5, marginBottom: 14 }}>Henter serverinnstillinger …</div>;

  const save = async () => {
    try { await api('/api/settings', { method: 'PUT', body: JSON.stringify({ ollama_url: s.ollama_url, default_model: s.default_model }) });
      const x = await api('/api/settings'); setS(x); loadModels(); toast?.(x.ollama_ok ? 'Lagret · Ollama svarer' : 'Lagret · fikk ikke kontakt med Ollama'); }
    catch (e) { toast?.(e.message); }
  };
  const update = async () => {
    if (!confirm('Hente siste versjon og starte serveren på nytt? Appen er utilgjengelig i et par minutter.')) return;
    try { await api('/api/server/update', { method: 'POST' }); setBusy(true); setVer(v => ({ ...v, job: { running: true, log: '' } })); }
    catch (e) { toast?.(e.message); }
  };
  const ro = !s.admin;

  return <div style={{ marginBottom: 18 }}>
    <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8 }}>AI (Ollama)</div>
    <div style={label}>Ollama-adresse {dot(s.ollama_ok)}</div>
    <input disabled={ro} value={s.ollama_url} placeholder="http://mac-mini.local:11434" onChange={e => setS({ ...s, ollama_url: e.target.value })} style={{ ...field, fontFamily: 'ui-monospace,monospace' }} />
    <div style={label}>Standardmodell</div>
    <select disabled={ro} value={s.default_model} onChange={e => setS({ ...s, default_model: e.target.value })} style={field}>
      <option value="">Første tilgjengelige</option>
      {models.map(m => <option key={m} value={m}>{m}</option>)}
    </select>
    <div style={{ fontSize: 12.5, color: '#6f6e6a', margin: '8px 0 10px' }}>{models.length ? `${models.length} modeller på serveren.` : 'Ingen modeller funnet.'} Ollama må lytte på nettverket: <code>launchctl setenv OLLAMA_HOST 0.0.0.0</code></div>
    {!ro && <button onClick={save} style={btn('#ebebe9', '#191919')}>Lagre</button>}

    {s.admin && <>
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 22 }}>Serverapplikasjon</div>
      {!ver ? <div style={label}>Sjekker versjon …</div> : ver.error ? <div style={{ ...label, color: '#ec8c8c' }}>{ver.error}</div> : <>
        <div style={{ ...label, color: '#ebebe9' }}>Versjon <code>{ver.current}</code>{ver.behind ? <span style={{ color: '#e3b665' }}> · {ver.behind} oppdatering{ver.behind > 1 ? 'er' : ''} tilgjengelig</span> : <span style={{ color: '#7fc495' }}> · oppdatert</span>}</div>
        {!!ver.changes?.length && <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 13, color: '#bcbcb9' }}>{ver.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>}
      </>}
      {ver?.job?.running ? <div style={{ fontSize: 13.5, color: '#e3b665' }}>Oppdaterer … dette tar et par minutter.</div>
        : <div style={{ display: 'flex', gap: 8 }}><button onClick={update} style={btn(ver?.behind ? '#ebebe9' : '#2a2a2a', ver?.behind ? '#191919' : '#ebebe9')}>Oppdater server</button><button onClick={loadVer} style={btn('#2a2a2a', '#ebebe9')}>Sjekk på nytt</button></div>}
      {ver?.job?.ok === false && <pre style={{ fontSize: 11, color: '#ec8c8c', whiteSpace: 'pre-wrap', maxHeight: 140, overflow: 'auto', background: '#1a1a1a', padding: 8, borderRadius: 8 }}>{ver.job.log.slice(-1500)}</pre>}
    </>}
  </div>;
}
