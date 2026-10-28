import React, { useEffect, useState } from 'react';
import { AppIcon, APP_ICONS } from './appicons.jsx';
import { Icon } from './icons.jsx';
import { moreSections } from './SettingsMore.jsx';
import { uploadFile, openExternal } from './api.js';

const field = { width: '100%', boxSizing: 'border-box', height: 38, borderRadius: 8, border: 0, background: 'var(--s3)', color: 'var(--text)', padding: '0 11px', font: 'inherit', fontSize: 14 };
const mono = { fontFamily: 'ui-monospace,SFMono-Regular,monospace' };
const btn = (bg = 'var(--s3)', fg = 'var(--text)') => ({ height: 34, padding: '0 14px', borderRadius: 8, border: 0, background: bg, color: fg, font: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' });
const fmtSize = b => b == null ? '' : b > 1e9 ? (b / 1e9).toFixed(1).replace('.', ',') + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' kB';
const fmtDate = d => new Date(d).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function Toggle({ on, onChange, disabled }) {
  return <span onClick={() => !disabled && onChange(!on)} style={{ position: 'relative', width: 34, height: 20, flex: 'none', borderRadius: 10, background: on ? '#2f80ed' : 'var(--s7)', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? .5 : 1, transition: 'background 150ms' }}>
    <span style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 150ms' }} /></span>;
}
function Row({ label, desc, children, badge }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
    <div style={{ flex: '1 1 220px', minWidth: 0 }}>
      <div style={{ fontSize: 14.5, fontWeight: 500, display: 'flex', gap: 8, alignItems: 'center' }}>{label}{badge && <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: 'var(--green-bg)', color: 'var(--green-fg)' }}>{badge}</span>}</div>
      {desc && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3, lineHeight: 1.4 }}>{desc}</div>}
    </div>
    <div style={{ flex: '0 1 300px', display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center', minWidth: 0 }}>{children}</div>
  </div>;
}
const Group = ({ title, children }) => <div style={{ marginBottom: 26 }}><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>{title}</div>{children}</div>;
const Select = ({ value, onChange, options, disabled }) => <select disabled={disabled} value={value} onChange={e => onChange(e.target.value)} style={{ ...field, width: 'auto', maxWidth: 280 }}>
  {options.map(o => Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>)}</select>;

export default function SettingsView({ wide, data, setData, sync, appIcon, setAppIcon, onReset, onClose, onModels, toast, prefs, setPref, onImport, onRestorePage, initialTab }) {
  const base = data.server.replace(/\/$/, '');
  const api = (p, o = {}) => fetch(base + p, { ...o, headers: { 'Content-Type': 'application/json', ...sync.authHeader } })
    .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Feil ' + r.status); return j; });
  const loggedIn = !!sync.auth.token;
  const [tab, setTab] = useState(initialTab || (wide ? 'konto' : null));
  const [pagePick, setPagePick] = useState(null);
  const [sso, setSso] = useState(null);
  useEffect(() => { // bare svaret for gjeldende adresse teller
    if (sync.auth.token) return; let live = true; setSso(null);
    const t = setTimeout(() => fetch(base + '/api/sso/config').then(r => r.json()).then(x => live && setSso(x)).catch(() => {}), 300);
    return () => { live = false; clearTimeout(t); };
  }, [base, sync.auth.token]);
  const ssoLogin = async () => {
    const state = Array.from(crypto.getRandomValues(new Uint8Array(18)), b => b.toString(16).padStart(2, '0')).join('');
    await openExternal(`${base}/api/sso/start?state=${state}`);
    toast('Fullfør innloggingen i nettleseren');
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 1500));
      const r = await fetch(`${base}/api/sso/poll?state=${state}`).catch(() => null); if (!r) continue;
      if (r.status === 200) { const j = await r.json(); sync.useToken(j.token, j.email); toast('Logget inn som ' + j.email); return; }
      if (r.status !== 202) { const j = await r.json().catch(() => ({})); toast(j.error || 'Innloggingen feilet'); return; }
    }
  };
  const [query, setQuery] = useState('');
  const [s, setS] = useState(null);          // serverinnstillinger
  const [edit, setEdit] = useState({});      // ulagrede endringer
  const [models, setModels] = useState({ models: [], errors: {} });
  const [ver, setVer] = useState(null);
  const [bk, setBk] = useState({ list: null, job: null, err: '' });
  const [auditLog, setAuditLog] = useState(null);
  const [cred, setCred] = useState({ email: '', password: '', err: '' });
  const [confirmRestore, setConfirmRestore] = useState(null);
  const [tests, setTests] = useState({});

  const v = k => k in edit ? edit[k] : s?.[k] ?? '';
  const set = (k, val) => setEdit(e => ({ ...e, [k]: val }));
  const admin = !!s?.admin;
  const loadSettings = () => api('/api/settings').then(x => { setS(x); setEdit({}); }).catch(() => setS(null));
  const loadModels = () => api('/api/models').then(m => { setModels(m); onModels?.(m.models); }).catch(() => {});
  useEffect(() => { if (loggedIn) { loadSettings(); loadModels(); } }, [loggedIn, base]);

  const save = async (keys) => {
    const body = Object.fromEntries(Object.entries(edit).filter(([k]) => !keys || keys.some(p => k.startsWith(p))));
    try { await api('/api/settings', { method: 'PUT', body: JSON.stringify(body) }); await loadSettings(); loadModels(); toast('Lagret'); }
    catch (e) { toast(e.message); }
  };
  const dirty = prefixes => Object.keys(edit).some(k => prefixes.some(p => k.startsWith(p)));

  // Serveroppdatering
  const loadVer = () => api('/api/server/version').then(setVer).catch(e => setVer({ error: e.message }));
  useEffect(() => {
    if (!ver?.job?.running) return;
    const t = setInterval(() => api('/api/server/version').then(x => { setVer(x); if (!x.job?.running) toast(x.job?.ok ? 'Serveren er oppdatert' : 'Oppdateringen feilet'); }).catch(() => {}), 3000);
    return () => clearInterval(t);
  }, [ver?.job?.running]);

  // Sikkerhetskopi
  const loadBk = () => Promise.all([api('/api/backup/list').catch(e => ({ error: e.message })), api('/api/backup/status').catch(() => null)])
    .then(([list, job]) => setBk({ list: Array.isArray(list) ? list : [], job, err: list.error || '' }));
  useEffect(() => {
    if (!bk.job?.running) return;
    const t = setInterval(() => api('/api/backup/status').then(job => {
      setBk(b => ({ ...b, job }));
      if (!job.running) { toast(job.error ? 'Feilet: ' + job.error : job.kind === 'restore' ? 'Gjenopprettet' : 'Sikkerhetskopi ferdig'); loadBk(); }
    }).catch(() => {}), 1500);
    return () => clearInterval(t);
  }, [bk.job?.running]);

  useEffect(() => {
    if (!loggedIn || !admin) return;
    if (tab === 'server' && !ver) loadVer();
    if (tab === 'backup' && !bk.list) loadBk();
    if (tab === 'revisjon') api('/api/audit').then(setAuditLog).catch(() => setAuditLog([]));
  }, [tab, admin]);

  const testAI = async p => { setTests(t => ({ ...t, [p]: '…' })); if (dirty([p])) await save([p]); const r = await api('/api/ai/test', { method: 'POST', body: JSON.stringify({ provider: p }) }).catch(e => ({ error: e.message })); setTests(t => ({ ...t, [p]: r.ok ? `Tilkoblet · ${r.models} modeller` : r.error })); };
  const testSmb = async () => { setTests(t => ({ ...t, smb: '…' })); if (dirty(['smb_'])) await save(['smb_']); const r = await api('/api/backup/test', { method: 'POST' }).catch(e => ({ error: e.message })); setTests(t => ({ ...t, smb: r.ok ? `Tilkoblet${r.free ? ' · ' + fmtSize(r.free) + ' ledig' : ''}` : r.error })); };

  const needLogin = <div style={{ color: 'var(--muted)', fontSize: 14 }}>Logg inn under <a style={{ color: 'var(--text)', cursor: 'pointer' }} onClick={() => setTab('konto')}>Min konto</a> for å se denne siden.</div>;
  const needAdmin = <div style={{ color: 'var(--muted)', fontSize: 14 }}>Bare administrator (første konto) kan endre dette.</div>;
  const guard = el => !loggedIn ? needLogin : !s ? <div style={{ color: 'var(--muted)' }}>Henter …</div> : !admin ? needAdmin : el;

  const providerModels = p => models.models.filter(m => m.startsWith(p + ':')).map(m => m.slice(p.length + 1));
  const modelOptions = (p, cur) => { const l = providerModels(p); return l.includes(cur) || !cur ? l : [cur, ...l]; };

  const sections = [
    { id: 'konto', group: 'Konto', label: 'Min konto', icon: '👤', words: 'logg inn ut server adresse synk', render: () => <>
      <Group title="Server">
        <Row label="Serveradresse" desc="Marg-serveren din, f.eks. http://192.168.1.50 eller https://notes.kristo.no">
          <input value={data.server} onChange={e => setData(d => ({ ...d, server: e.target.value }))} style={{ ...field, ...mono, maxWidth: 280 }} /></Row>
      </Group>
      {loggedIn ? <Group title="Konto">
        <Row label={sync.auth.email} desc={'Synk: ' + sync.status + (admin ? ' · administrator' : '')}><button onClick={sync.logout} style={btn()}>Logg ut</button></Row>
      </Group> : <Group title="Logg inn">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360, paddingTop: 8 }}>
          {['email', 'password'].map(k => <input key={k} type={k} placeholder={k === 'email' ? 'E-post' : 'Passord'} value={cred[k]} onChange={e => setCred(c => ({ ...c, [k]: e.target.value }))} style={field} />)}
          {cred.totp && <input value={cred.code || ''} onChange={e => setCred(c => ({ ...c, code: e.target.value }))} placeholder="Kode fra autentiseringsappen" inputMode="numeric" autoFocus style={{ ...field, ...mono }} />}
          {cred.err && <div style={{ color: 'var(--red-fg)', fontSize: 13.5 }}>{cred.err}</div>}
          <div style={{ display: 'flex', gap: 8 }}>{[['Logg inn', false], ['Opprett konto', true]].map(([l, reg]) => <button key={l} style={btn(reg ? 'var(--s3)' : 'var(--text)', reg ? 'var(--text)' : 'var(--bg)')} onClick={async () => {
            try { await sync.login(cred.email, cred.password, reg, cred.code); setCred({ email: '', password: '', err: '' }); toast('Koblet til ' + base.replace(/^https?:\/\//, '')); }
            catch (e) { setCred(c => ({ ...c, totp: c.totp || e.needTotp, err: e.message === 'Failed to fetch' ? 'Fikk ikke kontakt med serveren' : e.message })); } }}>{l}</button>)}</div>
          {sso?.enabled && <button style={{ ...btn(), width: 'fit-content' }} onClick={ssoLogin}>🔐 Logg inn med {sso.name}</button>}
          <div style={{ fontSize: 12.5, color: 'var(--faint)' }}>Første konto på en ny server blir administrator.</div>
        </div></Group>}
    </> },
    { id: 'utseende', group: 'Innstillinger', label: 'Utseende', icon: '🎨', words: 'appikon ikon krystall ark marg tema lys mørk kontrast skrift bredde', render: () => <Group title="Utseende">
      <Row label="Appikon" desc="Vises på hjemskjermen (iPhone, iPad, Android), i Dock på Mac og som favicon. Krystall er standard.">
        <div style={{ display: 'flex', gap: 12 }}>{Object.entries(APP_ICONS).map(([k, name]) => <div key={k} onClick={() => { setAppIcon(k); toast('Appikon endret til ' + name); }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <span style={{ borderRadius: 14, padding: 3, boxShadow: `0 0 0 2px ${appIcon === k ? 'var(--text)' : 'transparent'}` }}><AppIcon variant={k} size={48} /></span>
          <span style={{ fontSize: 12, color: appIcon === k ? 'var(--text)' : 'var(--muted)' }}>{name}</span></div>)}</div>
      </Row>
      <Row label="Tema" desc="Gjelder denne enheten"><Select value={prefs.theme} onChange={x => setPref('theme', x)} options={[['system', 'Bruk systeminnstilling'], ['light', 'Lys'], ['dark', 'Mørk']]} /></Row>
      <Row label="Høy kontrast" desc="Øk kontrasten for bedre synlighet" badge="Beta"><Select value={prefs.contrast} onChange={x => setPref('contrast', x)} options={[['system', 'Bruk systeminnstilling'], ['on', 'På'], ['off', 'Av']]} /></Row>
      <Row label="Skriftstørrelse" desc="Gjelder alle sider"><Select value={prefs.font} onChange={x => setPref('font', x)} options={[['standard', 'Standard'], ['small', 'Liten'], ['large', 'Stor']]} /></Row>
      <Row label="Full bredde som standard" desc="Sider bruker hele vindusbredden"><Toggle on={prefs.fullWidth} onChange={x => setPref('fullWidth', x)} /></Row>
      <Row label="Trykk Enter for ny blokk" desc="Av: Enter gir linjeskift, Shift+Enter ny blokk"><Toggle on={prefs.enterNewBlock} onChange={x => setPref('enterNewBlock', x)} /></Row>
    </Group> },
    { id: 'ai', group: 'Funksjoner', label: 'Marg AI', icon: '✦', words: 'ollama gemini claude modell api nøkkel budsjett privat reserve', render: () => guard(<>
      <div style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 18, lineHeight: 1.5 }}>Velg hvilke AI-leverandører Marg kan bruke. Ollama kjører lokalt; Gemini og Claude kalles fra serveren med dine API-nøkler, som lagres kryptert og aldri sendes til appen.</div>
      <Group title="Leverandører">
        <Row label="Ollama" desc="Lokalt på nettverket ditt · ingenting sendes ut" badge="Lokal"><Toggle on={v('ollama_enabled') === 'true'} onChange={x => set('ollama_enabled', String(x))} /></Row>
        <Row label="Google Gemini" desc="Gratis API-nøkkel fra aistudio.google.com · begrensning per minutt og døgn" badge="Gratis"><Toggle on={v('gemini_enabled') === 'true'} onChange={x => set('gemini_enabled', String(x))} /></Row>
        <Row label="Anthropic Claude" desc="Betales per bruk via platform.claude.com"><Toggle on={v('claude_enabled') === 'true'} onChange={x => set('claude_enabled', String(x))} /></Row>
      </Group>
      {v('ollama_enabled') === 'true' && <Group title="Ollama">
        <Row label="Adresse" desc={<>Ollama må lytte på nettverket: <code>launchctl setenv OLLAMA_HOST 0.0.0.0</code></>}><input value={v('ollama_url')} placeholder="http://mac-mini.local:11434" onChange={e => set('ollama_url', e.target.value)} style={{ ...field, ...mono, maxWidth: 280 }} /></Row>
        <Row label="Test tilkobling" desc={tests.ollama || (s.ollama_ok ? 'Tilkoblet' : '')}><button style={btn()} onClick={() => testAI('ollama')}>Test</button></Row>
      </Group>}
      {v('gemini_enabled') === 'true' && <Group title="Google Gemini">
        <Row label="API-nøkkel" desc={s.gemini_key_set ? 'Lagret kryptert på serveren' : 'Lagres kryptert på serveren'}><input type="password" value={v('gemini_key')} placeholder={s.gemini_key_set ? '••••••••  (lagret)' : 'AIza…'} onChange={e => set('gemini_key', e.target.value)} style={{ ...field, maxWidth: 280 }} /></Row>
        <Row label="Modell" desc="Listen hentes fra API-et"><Select value={v('gemini_model')} onChange={x => set('gemini_model', x)} options={modelOptions('gemini', v('gemini_model'))} /></Row>
        <Row label="Test nøkkel" desc={tests.gemini}><button style={btn()} onClick={() => testAI('gemini')}>Test</button></Row>
      </Group>}
      {v('claude_enabled') === 'true' && <Group title="Anthropic Claude">
        <Row label="API-nøkkel" desc={s.claude_key_set ? 'Lagret kryptert på serveren' : 'Lagres kryptert på serveren'}><input type="password" value={v('claude_key')} placeholder={s.claude_key_set ? '••••••••  (lagret)' : 'sk-ant-…'} onChange={e => set('claude_key', e.target.value)} style={{ ...field, maxWidth: 280 }} /></Row>
        <Row label="Modell" desc="Listen hentes fra API-et"><Select value={v('claude_model')} onChange={x => set('claude_model', x)} options={modelOptions('claude', v('claude_model'))} /></Row>
        <Row label="Månedlig budsjett" desc={`Stopper kall når grensen er nådd · brukt i ${new Date().toLocaleString('nb-NO', { month: 'long' })}: ca. ${s.claude_used} kr`}>
          <Select value={v('claude_budget')} onChange={x => set('claude_budget', x)} options={[['50', '50 kr'], ['200', '200 kr'], ['500', '500 kr'], ['0', 'Ingen grense']]} /></Row>
        <Row label="Test nøkkel" desc={tests.claude}><button style={btn()} onClick={() => testAI('claude')}>Test</button></Row>
      </Group>}
      <Group title="Ruting">
        <Row label="Standardmodell" desc="Brukes i «Spør AI» og skrivehjelp"><Select value={v('default_model')} onChange={x => set('default_model', x)} options={[['', 'Første tilgjengelige (Ollama)'], ...models.models.map(m => [m, m.replace(':', ' · ')])]} /></Row>
        <Row label="Reserve hvis skytjeneste feiler"><Select value={v('fallback')} onChange={x => set('fallback', x)} options={[['ollama', 'Ollama (lokal)'], ['none', 'Ingen']]} /></Row>
        <Row label="Hold private sider lokalt" desc="Sider merket privat sendes aldri til Gemini eller Claude"><Toggle on={v('private_local') === 'true'} onChange={x => set('private_local', String(x))} /></Row>
      </Group>
      {Object.entries(models.errors || {}).map(([p, e]) => <div key={p} style={{ color: 'var(--red-fg)', fontSize: 13, marginBottom: 6 }}>{e}</div>)}
      <button disabled={!Object.keys(edit).length} onClick={() => save()} style={{ ...btn('var(--text)', 'var(--bg)'), opacity: Object.keys(edit).length ? 1 : .4 }}>Lagre</button>
    </>) },
    { id: 'backup', group: 'Arbeidsområde', label: 'Sikkerhetskopi', icon: '🗄️', words: 'backup smb nas gjenopprett restore kryptering tidsplan', render: () => guard(<>
      <div style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 18 }}>Ta backup av hele arbeidsområdet til en ekstern SMB-server, og gjenopprett ved behov.</div>
      <Group title="SMB-server">
        <Row label="Server" desc="For eksempel //nas.local/backup eller //192.168.1.10/share"><input value={v('smb_host')} placeholder="//server/share" onChange={e => set('smb_host', e.target.value)} style={{ ...field, ...mono, maxWidth: 280 }} /></Row>
        <Row label="Mappe" desc="Undermappe på delingen"><input value={v('smb_path')} onChange={e => set('smb_path', e.target.value)} style={{ ...field, maxWidth: 280 }} /></Row>
        <Row label="Brukernavn"><input value={v('smb_user')} onChange={e => set('smb_user', e.target.value)} style={{ ...field, maxWidth: 280 }} /></Row>
        <Row label="Passord" desc="Lagres kryptert på serveren"><input type="password" value={v('smb_pass')} placeholder={s.smb_pass_set ? '••••••••  (lagret)' : ''} onChange={e => set('smb_pass', e.target.value)} style={{ ...field, maxWidth: 280 }} /></Row>
        <Row label="Domene / arbeidsgruppe" desc="Valgfritt"><input value={v('smb_domain')} onChange={e => set('smb_domain', e.target.value)} style={{ ...field, maxWidth: 280 }} /></Row>
        <Row label="SMB-versjon"><Select value={v('smb_version')} onChange={x => set('smb_version', x)} options={[['SMB3', 'SMB 3'], ['SMB2', 'SMB 2']]} /></Row>
        <Row label="Test tilkobling" desc={tests.smb || 'Sjekker innlogging og skrivetilgang'}><button style={btn()} onClick={testSmb}>Test</button></Row>
      </Group>
      <Group title="Hva som tas med">
        <Row label="Database" desc="Alle sider, blokker, databaser, sidehistorikk, innstillinger og brukere (pg_dump)"><Toggle on disabled onChange={() => {}} /></Row>
        <Row label="Krypter sikkerhetskopien" desc={s.bk_key_set ? 'AES-256 · nøkkelen er lagret på serveren' : 'AES-256 · nøkkelen lages ved første backup'}>
          {s.bk_key_set && <button style={btn()} onClick={() => api('/api/backup/key').then(r => prompt('Ta vare på nøkkelen. Uten den kan krypterte kopier ikke gjenopprettes på en ny server.', r.key))}>Vis nøkkel</button>}
          <Toggle on={v('bk_encrypt') === 'true'} onChange={x => set('bk_encrypt', String(x))} /></Row>
      </Group>
      <Group title="Tidsplan">
        <Row label="Automatisk backup" desc="Tidspunkt i UTC"><Select value={v('bk_schedule')} onChange={x => set('bk_schedule', x)} options={[['nightly', 'Hver natt 03:00'], ['hourly', 'Hver time'], ['weekly', 'Hver uke (søndag)'], ['off', 'Av']]} /></Row>
        <Row label="Behold" desc="Eldre kopier slettes fra SMB-delingen"><Select value={v('bk_keep')} onChange={x => set('bk_keep', x)} options={[['7', '7 dager'], ['30', '30 dager'], ['90', '90 dager'], ['365', '1 år'], ['0', 'For alltid']]} /></Row>
        <Row label="Ta backup nå" desc={bk.job?.running ? bk.job.step : bk.list?.[0] ? 'Sist: ' + fmtDate(bk.list[0].date) : ''}>
          {bk.job?.running ? <span style={{ ...mono, fontSize: 13 }}>{bk.job.pct} %</span> : <button style={btn('var(--text)', 'var(--bg)')} onClick={async () => { if (dirty(['smb_', 'bk_'])) await save(['smb_', 'bk_']); api('/api/backup/run', { method: 'POST' }).then(() => setBk(b => ({ ...b, job: { running: true, pct: 0, step: 'Starter' } }))).catch(e => toast(e.message)); }}>Ta backup nå</button>}</Row>
      </Group>
      {dirty(['smb_', 'bk_']) && <button onClick={() => save(['smb_', 'bk_'])} style={{ ...btn('var(--text)', 'var(--bg)'), marginBottom: 22 }}>Lagre</button>}
      <Group title="Gjenopprett">
        {bk.err && <div style={{ color: 'var(--red-fg)', fontSize: 13, padding: '8px 0' }}>{bk.err}</div>}
        {bk.list && !bk.list.length && !bk.err && <div style={{ color: 'var(--muted)', fontSize: 13.5, padding: '8px 0' }}>Ingen sikkerhetskopier ennå.</div>}
        {(bk.list || []).map(b => <Row key={b.name} label={fmtDate(b.date)} desc={`${fmtSize(b.size)} · ${b.manual ? 'Manuell' : 'Automatisk'} · ${v('smb_host')}/${v('smb_path')}`}>
          {bk.job?.running && bk.job.kind === 'restore' ? <span style={{ ...mono, fontSize: 13 }}>{bk.job.pct} %</span>
            : confirmRestore === b.name ? <button style={btn('var(--red-bg)', 'var(--red-fg)')} onClick={() => { setConfirmRestore(null); api('/api/backup/restore', { method: 'POST', body: JSON.stringify({ name: b.name }) }).then(() => setBk(x => ({ ...x, job: { running: true, kind: 'restore', pct: 0 } }))).catch(e => toast(e.message)); }}>Bekreft – overskriver alt</button>
            : <button style={btn()} onClick={() => setConfirmRestore(b.name)}>Gjenopprett</button>}</Row>)}
        <Row label="Gjenopprett fra fil" desc="Velg en .marg-backup fra datamaskinen (krypterte kopier bruker lagret nøkkel)">
          <button style={btn()} onClick={async () => { const f = await new Promise(ok => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.marg-backup'; i.onchange = () => ok(i.files[0]); i.click(); }); if (!f || !confirm('Gjenopprette fra ' + f.name + '? Dette overskriver alt på serveren.')) return;
            fetch(base + '/api/backup/upload', { method: 'POST', headers: sync.authHeader, body: f }).then(r => r.json()).then(r => { if (r.error) throw new Error(r.error); setBk(x => ({ ...x, job: { running: true, kind: 'restore', pct: 0 } })); }).catch(e => toast(e.message)); }}>Bla gjennom</button></Row>
        <Row label="Gjenopprett én side" desc="Hent én side fra en kopi uten å overskrive resten">
          <select value="" onChange={e => { const n = e.target.value; if (!n) return; setPagePick({ name: n, list: null }); api('/api/backup/pages', { method: 'POST', body: JSON.stringify({ name: n }) }).then(l => { if (l.error) throw new Error(l.error); setPagePick({ name: n, list: l }); }).catch(err => { toast(err.message); setPagePick(null); }); }} style={{ ...field, width: 'auto' }}>
            <option value="">Velg kopi …</option>{(bk.list || []).map(b => <option key={b.name} value={b.name}>{fmtDate(b.date)}</option>)}</select></Row>
        {pagePick && <div style={{ background: 'var(--s2)', borderRadius: 8, padding: 10, margin: '6px 0' }}>
          {!pagePick.list ? <span style={{ color: 'var(--muted)', fontSize: 13.5 }}>Henter sider fra kopien …</span> : pagePick.list.filter(x => !x.page.db).map(x => <div key={x.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 0' }}>
            <span style={{ flex: 1, fontSize: 14 }}>{x.page.title || 'Uten tittel'}{data.pages[x.id] ? '' : <span style={{ color: 'var(--muted)' }}> (slettet nå)</span>}</span>
            <button style={btn()} onClick={() => { onRestorePage(x.id, x.page); toast('Siden er gjenopprettet'); }}>Gjenopprett</button></div>)}</div>}
        <div style={{ paddingTop: 8 }}><button style={btn()} onClick={loadBk}>Oppdater liste</button></div>
      </Group>
    </>) },
    { id: 'server', group: 'Arbeidsområde', label: 'Serverapplikasjon', icon: '⬆️', words: 'oppdater versjon server', render: () => guard(<Group title="Serverapplikasjon">
      {!ver ? <div style={{ color: 'var(--muted)' }}>Sjekker versjon …</div> : ver.error ? <div style={{ color: 'var(--red-fg)', fontSize: 14 }}>{ver.error}</div> : <>
        <Row label={<>Versjon <code>{ver.current}</code></>} desc={ver.behind ? `${ver.behind} oppdatering${ver.behind > 1 ? 'er' : ''} tilgjengelig` : 'Du har siste versjon'}>
          {ver.job?.running ? <span style={{ fontSize: 13.5, color: 'var(--yellow-fg)' }}>Oppdaterer …</span>
            : <button style={btn(ver.behind ? 'var(--text)' : 'var(--s3)', ver.behind ? 'var(--bg)' : 'var(--text)')} onClick={() => { if (confirm('Hente siste versjon og starte serveren på nytt? Appen er utilgjengelig i et par minutter.')) api('/api/server/update', { method: 'POST' }).then(() => setVer(x => ({ ...x, job: { running: true } }))).catch(e => toast(e.message)); }}>Oppdater server</button>}</Row>
        {!!ver.changes?.length && <ul style={{ margin: '4px 0 10px', paddingLeft: 18, fontSize: 13, color: 'var(--text3)' }}>{ver.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>}
        {ver.job?.ok === false && <pre style={{ fontSize: 11, color: 'var(--red-fg)', whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto', background: 'var(--s0)', padding: 8, borderRadius: 8 }}>{(ver.job.log || '').slice(-1500)}</pre>}
        <button style={btn()} onClick={loadVer}>Sjekk på nytt</button>
      </>}
    </Group>) },
    { id: 'revisjon', group: 'Arbeidsområde', label: 'Revisjonslogg', icon: '📜', words: 'logg hendelser innlogging', render: () => guard(<Group title="Siste hendelser">
      {!auditLog ? <div style={{ color: 'var(--muted)' }}>Henter …</div> : auditLog.map((a, i) => <Row key={i} label={a.action.replace(/_/g, ' ')} desc={[a.email, a.detail].filter(Boolean).join(' · ')}><span style={{ ...mono, fontSize: 12.5, color: 'var(--muted)' }}>{fmtDate(a.created_at)}</span></Row>)}
    </Group>) },
    { id: 'data', group: 'Arbeidsområde', label: 'Data på enheten', icon: '💾', words: 'tilbakestill eksempel lokal', render: () => <Group title="Data på denne enheten">
      <Row label="Tilbakestill til eksempeldata" desc="Erstatter notatene på denne enheten. Er du logget inn, synkes endringen til serveren."><button style={btn('var(--red-bg)', 'var(--red-fg)')} onClick={onReset}>Tilbakestill</button></Row>
    </Group> }
  ];

  const guardLogin = el => !loggedIn ? needLogin : el;
  const apiCtx = (p, o = {}) => api(p, o);
  sections.splice(1, 0, ...moreSections({ s, Row, Group, Toggle, Select, prefs, setPref, guardLogin, guard, v, set, save, dirty, btn, field, mono, data, setData, toast, api: apiCtx, admin, sync, base, onImport })
    .filter(x => x.group === 'Konto'));
  const more = moreSections({ s, Row, Group, Toggle, Select, prefs, setPref, guardLogin, guard, v, set, save, dirty, btn, field, mono, data, setData, toast, api: apiCtx, admin, sync, base, onImport }).filter(x => x.group !== 'Konto');
  for (const m of more) { const i = sections.findLastIndex(x => x.group === m.group); sections.splice(i < 0 ? sections.length : i + 1, 0, m); }
  const ql = query.trim().toLowerCase();
  const shown = sections.filter(x => !ql || (x.label + ' ' + x.words).toLowerCase().includes(ql));
  const current = sections.find(x => x.id === tab);
  const groups = ['Konto', 'Innstillinger', 'Arbeidsområde', 'Funksjoner'].filter(g => shown.some(x => x.group === g));

  const nav = <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 34, borderRadius: 8, background: 'var(--s3)', padding: '0 10px', margin: '0 0 12px' }}>
      <Icon.search size={15} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Søk i innstillinger" style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', color: 'var(--text)', font: 'inherit', fontSize: 14 }} /></div>
    {groups.map(g => <div key={g} style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--faint)', padding: '4px 10px' }}>{g}</div>
      {shown.filter(x => x.group === g).map(x => <div key={x.id} className="press" onClick={() => setTab(x.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: wide ? '7px 10px' : '13px 10px', borderRadius: 6, cursor: 'pointer', fontSize: wide ? 14 : 16.5, background: tab === x.id && wide ? 'var(--s3)' : 'transparent' }}>
        <span style={{ width: 20, textAlign: 'center' }}>{x.icon}</span>{x.label}{!wide && <span style={{ marginLeft: 'auto', color: 'var(--faint)' }}>›</span>}</div>)}
    </div>)}
  </div>;

  return <div style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'var(--bg)', display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top)' }}>
    <div className="drag" style={{ height: 52, flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '0 18px', boxShadow: 'inset 0 -1px 0 var(--line)' }}>
      {!wide && tab ? <span className="nodrag" onClick={() => setTab(null)} style={{ cursor: 'pointer', display: 'flex' }}><Icon.back /></span> : null}
      <span style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>{!wide && current ? current.label : 'Innstillinger'}</span>
      <button className="nodrag" onClick={onClose} style={btn('var(--text)', 'var(--bg)')}>Ferdig</button>
    </div>
    <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
      {(wide || !tab) && <div style={{ width: wide ? 250 : '100%', flex: 'none', overflow: 'auto', padding: '16px 12px', boxShadow: wide ? 'inset -1px 0 0 var(--line)' : 'none', background: wide ? 'var(--s1)' : 'transparent' }}>{nav}</div>}
      {current && (wide || tab) && <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: wide ? '28px 44px 60px' : '18px 18px calc(40px + env(safe-area-inset-bottom))' }}>
        <div style={{ maxWidth: 760 }}>
          {wide && <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 18 }}>{current.label}</div>}
          {current.render()}
        </div></div>}
    </div>
  </div>;
}
