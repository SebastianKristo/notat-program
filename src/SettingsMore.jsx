import React, { useEffect, useState } from 'react';
import { importMarkdownFiles, filesFromZip, makeZip, pageToMd, download, printPages } from './io.js';
import { uploadFile, pickFile, fileUrl } from './api.js';

const fmt = d => d ? new Date(d).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–';
const agentName = a => !a ? 'Ukjent enhet' : /iPhone/.test(a) ? 'iPhone' : /iPad/.test(a) ? 'iPad' : /Android/.test(a) ? 'Android' : /Electron/.test(a) ? 'Marg for Mac' : /Macintosh/.test(a) ? 'Mac (nettleser)' : /Windows/.test(a) ? 'Windows' : /curl/.test(a) ? 'Skript' : 'Nettleser';

// Små komponenter med egen tilstand (hver innstillingsside)
function Security({ ctx }) {
  const { api, Row, Group, btn, field, mono, toast } = ctx;
  const [sec, setSec] = useState(null), [pw, setPw] = useState({ current: '', next: '' }), [setup, setSetup] = useState(null), [code, setCode] = useState('');
  const load = () => api('/api/security').then(setSec).catch(e => toast(e.message));
  useEffect(() => { load(); }, []);
  if (!sec) return <div style={{ color: 'var(--muted)' }}>Henter …</div>;
  return <>
    <Group title="Passord">
      <Row label="Bytt passord" desc="Minst 8 tegn">
        <input type="password" placeholder="Nåværende" value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })} style={{ ...field, width: 130 }} />
        <input type="password" placeholder="Nytt" value={pw.next} onChange={e => setPw({ ...pw, next: e.target.value })} style={{ ...field, width: 130 }} />
        <button style={btn()} onClick={() => api('/api/security/password', { method: 'POST', body: JSON.stringify(pw) }).then(() => { setPw({ current: '', next: '' }); toast('Passordet er byttet'); }).catch(e => toast(e.message))}>Lagre</button></Row>
    </Group>
    <Group title="Tofaktorautentisering">
      {sec.totp ? <Row label="Tofaktor er på" desc="Innlogging krever en kode fra autentiseringsappen">
        <input placeholder="Kode" value={code} onChange={e => setCode(e.target.value)} style={{ ...field, width: 100 }} />
        <button style={btn('var(--red-bg)', 'var(--red-fg)')} onClick={() => api('/api/security/totp/disable', { method: 'POST', body: JSON.stringify({ code }) }).then(() => { setCode(''); load(); toast('Tofaktor er slått av'); }).catch(e => toast(e.message))}>Slå av</button></Row>
      : !setup ? <Row label="Autentiseringsapp" desc="Bruk 1Password, Google Authenticator, Authy e.l."><button style={btn()} onClick={() => api('/api/security/totp/setup', { method: 'POST' }).then(setSetup)}>Sett opp</button></Row>
      : <div style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
        <div style={{ fontSize: 14, marginBottom: 8 }}>1. Legg til denne nøkkelen i appen (eller trykk lenken på telefonen):</div>
        <div style={{ ...mono, fontSize: 15, letterSpacing: 1, background: 'var(--s2)', padding: '8px 10px', borderRadius: 8, wordBreak: 'break-all' }}>{setup.secret.match(/.{1,4}/g).join(' ')}</div>
        <a href={setup.uri} style={{ fontSize: 13, color: 'var(--blue-fg)' }}>Åpne i autentiseringsapp</a>
        <div style={{ fontSize: 14, margin: '12px 0 8px' }}>2. Skriv inn koden appen viser:</div>
        <div style={{ display: 'flex', gap: 8 }}><input value={code} onChange={e => setCode(e.target.value)} placeholder="123456" style={{ ...field, width: 120, ...mono }} />
          <button style={btn('var(--text)', 'var(--bg)')} onClick={() => api('/api/security/totp/enable', { method: 'POST', body: JSON.stringify({ code }) }).then(() => { setSetup(null); setCode(''); load(); toast('Tofaktor er slått på'); }).catch(e => toast(e.message))}>Bekreft</button></div>
      </div>}
    </Group>
    {ctx.admin && <Group title="Single sign-on (OIDC)">
      <div style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 8px', lineHeight: 1.5 }}>Fungerer med Authentik, Keycloak, Google m.fl. Opprett en OAuth2/OpenID-klient med redirect-adressen <code>{ctx.base}/api/sso/callback</code>.</div>
      {[['oidc_name', 'Navn på knappen', 'Authentik'], ['oidc_issuer', 'Issuer-adresse', 'https://auth.kristo.no/application/o/marg/'], ['oidc_client_id', 'Client ID', ''], ['oidc_client_secret', 'Client secret', ctx.s?.oidc_client_secret_set ? '••••••••  (lagret)' : ''], ['public_url', 'Offentlig adresse til Marg', ctx.base]].map(([k, l, ph]) =>
        <Row key={k} label={l}><input type={k.includes('secret') ? 'password' : 'text'} value={ctx.v(k)} placeholder={ph} onChange={e => ctx.set(k, e.target.value)} style={{ ...field, ...(k === 'oidc_name' ? {} : mono), maxWidth: 280 }} /></Row>)}
      <Row label="Lag konto automatisk ved første innlogging" desc="Av: bare personer som allerede er lagt til kan logge inn med SSO"><ctx.Toggle on={ctx.v('oidc_auto_create') === 'true'} onChange={x => ctx.set('oidc_auto_create', String(x))} /></Row>
      {ctx.dirty(['oidc_', 'public_url']) && <button style={btn('var(--text)', 'var(--bg)')} onClick={() => ctx.save(['oidc_', 'public_url'])}>Lagre</button>}
    </Group>}
    <Group title="Aktive enheter">
      {sec.sessions.map(x => <Row key={x.id} label={<>{agentName(x.agent)}{x.current && <span style={{ fontSize: 11, marginLeft: 8, padding: '1px 6px', borderRadius: 4, background: 'var(--green-bg)', color: 'var(--green-fg)' }}>Denne enheten</span>}</>} desc={`Logget inn ${fmt(x.created)} · sist aktiv ${fmt(x.seen)}`} />)}
      <Row label="Logg ut fra alle andre enheter" desc="Du blir logget ut overalt bortsett fra her"><button style={btn('var(--red-bg)', 'var(--red-fg)')} onClick={() => api('/api/security/logout-others', { method: 'POST' }).then(r => { toast(`Logget ut fra ${r.count} enheter`); load(); })}>Logg ut</button></Row>
    </Group>
  </>;
}

function People({ ctx }) {
  const { api, Row, Group, btn, field, toast, admin, v, set, save, Toggle, dirty } = ctx;
  const [users, setUsers] = useState(null), [f, setF] = useState({ email: '', password: '', role: 'member' });
  const load = () => api('/api/users').then(setUsers).catch(e => toast(e.message));
  useEffect(() => { load(); }, []);
  const ROLE = { admin: 'Administrator', member: 'Medlem', guest: 'Gjest' };
  return <>
    <Group title="Medlemmer">
      {!users ? <div style={{ color: 'var(--muted)' }}>Henter …</div> : users.map(u => <Row key={u.id} label={<>{u.email}{u.me && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> (deg)</span>}</>} desc={`${ROLE[u.role]}${u.totp_enabled ? ' · tofaktor' : ''} · sist aktiv ${fmt(u.last_seen)}`}>
        {admin && !u.me && u.role !== 'admin' && <>
          <select value={u.role} onChange={e => api(`/api/users/${u.id}`, { method: 'POST', body: JSON.stringify({ role: e.target.value }) }).then(load)} style={{ ...field, width: 'auto' }}><option value="member">Medlem</option><option value="guest">Gjest</option></select>
          <button style={btn('var(--red-bg)', 'var(--red-fg)')} onClick={() => confirm(`Fjerne ${u.email}? Kontoen og sidene deres slettes.`) && api(`/api/users/${u.id}`, { method: 'POST', body: JSON.stringify({ remove: true }) }).then(load)}>Fjern</button></>}
      </Row>)}
    </Group>
    {admin && <Group title="Legg til medlem">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '10px 0', borderTop: '1px solid var(--line)' }}>
        <input placeholder="E-post" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} style={{ ...field, width: 200 }} />
        <input type="password" placeholder="Startpassord" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} style={{ ...field, width: 150 }} />
        <select value={f.role} onChange={e => setF({ ...f, role: e.target.value })} style={{ ...field, width: 'auto' }}><option value="member">Medlem</option><option value="guest">Gjest</option></select>
        <button style={btn('var(--text)', 'var(--bg)')} onClick={() => api('/api/users', { method: 'POST', body: JSON.stringify(f) }).then(() => { setF({ email: '', password: '', role: 'member' }); load(); toast('Lagt til · del e-post og passord med personen'); }).catch(e => toast(e.message))}>Legg til</button>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Hver person har sitt eget arbeidsområde på serveren. Del sider med andre ved å publisere dem (Del → Publiser), eventuelt med passord.</div>
    </Group>}
    {admin && <Group title="Gjester">
      <Row label="Tillat at gjester lager konto selv" desc="Gjester kan ikke endre serverinnstillinger"><Toggle on={v('allow_guests') === 'true'} onChange={x => set('allow_guests', String(x))} /></Row>
      {dirty(['allow_guests']) && <button style={btn('var(--text)', 'var(--bg)')} onClick={() => save(['allow_guests'])}>Lagre</button>}
    </Group>}
  </>;
}

function Published({ ctx }) {
  const { api, Row, Group, btn, toast, base, data } = ctx;
  const [list, setList] = useState(null);
  const load = () => api('/api/publish').then(setList).catch(e => toast(e.message));
  useEffect(() => { load(); }, []);
  return <>
    <Group title="Domene">
      <Row label="Offentlig adresse" desc="Publiserte sider ligger under denne adressen. Sett DOMAIN i server/.env for eget domene med HTTPS."><code style={{ fontSize: 13 }}>{base}/p/…</code></Row>
    </Group>
    <Group title="Offentlige sider">
      {!list ? <div style={{ color: 'var(--muted)' }}>Henter …</div> : !list.length ? <div style={{ color: 'var(--muted)', fontSize: 14, padding: '8px 0' }}>Ingen publiserte sider. Åpne en side og velg Del → Publiser.</div>
        : list.map(p => <Row key={p.slug} label={data.pages[p.page_id]?.title || p.page_id} desc={`/p/${p.slug}${p.protected ? ' · passord' : ''}${p.indexable ? ' · indekseres' : ''}${p.expires ? ' · utløper ' + fmt(p.expires) : ''} · ${p.views} visninger (28 d)`}>
          <button style={btn()} onClick={() => { navigator.clipboard?.writeText(`${base}/p/${p.slug}`); toast('Lenke kopiert'); }}>Kopier</button>
          <button style={btn('var(--red-bg)', 'var(--red-fg)')} onClick={() => api('/api/unpublish', { method: 'POST', body: JSON.stringify({ pageId: p.page_id }) }).then(load)}>Avpubliser</button></Row>)}
    </Group>
  </>;
}

function Webhooks({ ctx }) {
  const { api, Row, Group, btn, field, toast, Toggle, mono } = ctx;
  const [list, setList] = useState(null), [url, setUrl] = useState(''), [secret, setSecret] = useState('');
  const load = () => api('/api/webhooks').then(setList).catch(e => toast(e.message));
  useEffect(() => { load(); }, []);
  const call = b => api('/api/webhooks', { method: 'POST', body: JSON.stringify(b) });
  return <Group title="Webhooks">
    <div style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 8 }}>Marg sender en POST med <code>page.created</code>, <code>page.updated</code> og <code>page.deleted</code> når sidene dine endres. Signatur i <code>X-Marg-Signature</code> (HMAC-SHA256).</div>
    {(list || []).map(h => <Row key={h.id} label={<span style={{ ...mono, fontSize: 13 }}>{h.url}</span>} desc={'Lagt til ' + fmt(h.created_at)}>
      <Toggle on={h.enabled} onChange={x => call({ id: h.id, enabled: x }).then(load)} />
      <button style={btn('var(--red-bg)', 'var(--red-fg)')} onClick={() => call({ id: h.id, remove: true }).then(load)}>Fjern</button></Row>)}
    <div style={{ display: 'flex', gap: 8, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
      <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" style={{ ...field, flex: 1, ...mono }} />
      <button style={btn('var(--text)', 'var(--bg)')} onClick={() => call({ url }).then(r => { setUrl(''); setSecret(r.secret); load(); }).catch(e => toast(e.message))}>Legg til</button></div>
    {secret && <div style={{ fontSize: 13.5, background: 'var(--yellow-bg)', color: 'var(--yellow-fg)', padding: 10, borderRadius: 8 }}>Signeringsnøkkel (vises én gang): <code style={{ wordBreak: 'break-all' }}>{secret}</code></div>}
  </Group>;
}

function Mcp({ ctx }) {
  const { api, Row, Group, btn, field, toast, base, mono } = ctx;
  const [list, setList] = useState(null), [name, setName] = useState('Claude'), [token, setToken] = useState('');
  const load = () => api('/api/tokens').then(setList).catch(e => toast(e.message));
  useEffect(() => { load(); }, []);
  const cfg = JSON.stringify({ mcpServers: { marg: { type: 'http', url: `${base}/api/mcp`, headers: { Authorization: `Bearer ${token || '<nøkkel>'}` } } } }, null, 2);
  return <>
    <div style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.5 }}>Koble Claude, Cursor eller andre MCP-klienter til notatene dine. Verktøy: søk i sider, les side, lag side og legg til tekst.</div>
    <Group title="API-nøkler">
      {(list || []).map(t => <Row key={t.id} label={t.name} desc={`Laget ${fmt(t.created_at)} · sist brukt ${fmt(t.last_used)}`}><button style={btn('var(--red-bg)', 'var(--red-fg)')} onClick={() => api('/api/tokens', { method: 'POST', body: JSON.stringify({ removeId: t.id }) }).then(load)}>Slett</button></Row>)}
      <div style={{ display: 'flex', gap: 8, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Navn" style={{ ...field, flex: 1 }} />
        <button style={btn('var(--text)', 'var(--bg)')} onClick={() => api('/api/tokens', { method: 'POST', body: JSON.stringify({ name }) }).then(r => { setToken(r.token); load(); })}>Lag nøkkel</button></div>
      {token && <div style={{ fontSize: 13.5, background: 'var(--yellow-bg)', color: 'var(--yellow-fg)', padding: 10, borderRadius: 8 }}>Kopier nøkkelen nå, den vises bare én gang: <code style={{ wordBreak: 'break-all' }}>{token}</code></div>}
    </Group>
    <Group title="Oppsett">
      <pre style={{ ...mono, fontSize: 12.5, background: 'var(--s2)', padding: 12, borderRadius: 8, overflow: 'auto' }}>{cfg}</pre>
      <button style={btn()} onClick={() => { navigator.clipboard?.writeText(cfg); toast('Kopiert'); }}>Kopier oppsett</button>
    </Group>
  </>;
}

function NotionApi({ ctx }) {
  const { Row, Group, btn, field, toast, onImport, sync, api } = ctx;
  const [token, setToken] = useState(''), [busy, setBusy] = useState(false);
  if (!sync.auth.token) return null;
  return <Group title="Notion API">
    <Row label="Integrasjonsnøkkel" desc={<>Lag en intern integrasjon på notion.so/my-integrations, og del sidene med den (··· → Tilkoblinger). Bilder lagres på serveren din.</>}>
      <input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="ntn_… / secret_…" style={{ ...field, width: 180 }} />
      <button style={btn()} disabled={busy || !token} onClick={async () => { setBusy(true); try { const r = await api('/api/import/notion', { method: 'POST', body: JSON.stringify({ token }) }); onImport(r, 'Importert fra Notion API'); setToken(''); } catch (e) { toast(e.message); } setBusy(false); }}>{busy ? 'Henter …' : 'Importer'}</button></Row>
  </Group>;
}

function ImportExport({ ctx }) {
  const { Row, Group, btn, toast, data, onImport, setData } = ctx;
  const [busy, setBusy] = useState('');
  const run = async (label, f) => { setBusy(label); try { await f(); } catch (e) { toast(e.message); } setBusy(''); };
  const pickMany = (opts = {}) => new Promise(ok => { const i = document.createElement('input'); i.type = 'file'; i.multiple = true; Object.assign(i, opts); if (opts.dir) i.webkitdirectory = true; i.onchange = () => ok([...i.files]); i.click(); });
  const live = Object.entries(data.pages).filter(([, p]) => !p.trashed && !p.db);
  return <>
    <NotionApi ctx={ctx} />
    <Group title="Importer">
      <Row label="Notion" desc="Eksporter fra Notion som «Markdown & CSV» (ZIP) og velg filen her"><button style={btn()} disabled={!!busy} onClick={() => run('notion', async () => { const f = await pickFile('.zip'); if (!f) return; const files = await filesFromZip(f); if (!files.length) throw new Error('Fant ingen Markdown-filer i ZIP-filen'); const r = importMarkdownFiles(files, { stripNotionIds: true }); onImport(r, 'Importert fra Notion'); })}>{busy === 'notion' ? 'Importerer …' : 'Importer ZIP'}</button></Row>
      <Row label="Obsidian-hvelv" desc="Velg mappen med .md-filer. Mapper blir sider med undersider"><button style={btn()} disabled={!!busy} onClick={() => run('obs', async () => { const fs = (await pickMany({ dir: true })).filter(f => /\.md$/i.test(f.name)); if (!fs.length) return; const files = await Promise.all(fs.map(async f => ({ path: f.webkitRelativePath || f.name, text: await f.text() }))); onImport(importMarkdownFiles(files), 'Importert fra Obsidian'); })}>{busy === 'obs' ? 'Importerer …' : 'Velg mappe'}</button></Row>
      <Row label="Markdown-filer" desc=".md eller .txt"><button style={btn()} onClick={() => run('md', async () => { const fs = await pickMany({ accept: '.md,.markdown,.txt' }); if (!fs.length) return; const files = await Promise.all(fs.map(async f => ({ path: f.name.replace(/\.txt$/, '.md'), text: await f.text() }))); onImport(importMarkdownFiles(files), 'Importert'); })}>Velg filer</button></Row>
      <Row label="Marg JSON" desc="Gjenopprett en JSON-eksport (erstatter sidene på denne enheten)"><button style={btn()} onClick={() => run('json', async () => { const f = await pickFile('.json'); if (!f) return; const j = JSON.parse(await f.text()); if (!j.pages) throw new Error('Ugyldig fil'); if (confirm('Erstatte alle sider med innholdet i filen?')) { setData(d => ({ ...d, ...j, server: d.server })); toast('Importert'); } })}>Velg fil</button></Row>
    </Group>
    <Group title="Eksporter">
      <Row label="Markdown (ZIP)" desc={`${live.length} sider, med mapper for undersider`}><button style={btn()} onClick={() => {
        const pathOf = id => { const p = data.pages[id], name = (p.title || 'Uten tittel').replace(/[\\/:*?"<>|]/g, '-'); return p.parent && data.pages[p.parent] ? pathOf(p.parent) + '/' + name : name; };
        download(makeZip(live.map(([id, p]) => [pathOf(id) + '.md', pageToMd(p)])), 'marg-eksport.zip'); }}>Last ned</button></Row>
      <Row label="JSON" desc="Alt innhold, for sikkerhetskopi eller flytting"><button style={btn()} onClick={() => { const { server, ...rest } = data; download(new Blob([JSON.stringify(rest, null, 2)], { type: 'application/json' }), 'marg.json'); }}>Last ned</button></Row>
      <Row label="PDF" desc="Alle sider i ett dokument via utskriftsdialogen"><button style={btn()} onClick={() => printPages(live.map(([, p]) => p), fileUrl) || toast('Tillat popup-vinduer for å skrive ut')}>Skriv ut / lagre som PDF</button></Row>
    </Group>
  </>;
}

function Emojis({ ctx }) {
  const { Row, Group, btn, field, toast, data, setData } = ctx;
  const [name, setName] = useState('');
  const list = data.customEmoji || [];
  return <Group title="Egne emoji">
    {list.map(e => <Row key={e.url} label={<span style={{ display: 'flex', gap: 10, alignItems: 'center' }}><img src={fileUrl(e.url)} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />:{e.name}:</span>}>
      <button style={btn('var(--red-bg)', 'var(--red-fg)')} onClick={() => setData(d => ({ ...d, customEmoji: list.filter(x => x !== e) }))}>Fjern</button></Row>)}
    <div style={{ display: 'flex', gap: 8, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
      <input value={name} onChange={e => setName(e.target.value.replace(/[^\wæøå-]/gi, ''))} placeholder="navn" style={{ ...field, flex: 1 }} />
      <button style={btn('var(--text)', 'var(--bg)')} onClick={async () => { if (!name) return toast('Gi emojien et navn først'); const f = await pickFile('image/*'); if (!f) return; try { const r = await uploadFile(f, 256); setData(d => ({ ...d, customEmoji: [...(d.customEmoji || []), { name, url: r.url }] })); setName(''); } catch (e) { toast(e.message); } }}>Last opp bilde</button></div>
    <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Egne emoji vises under «Egne» i ikonvelgeren.</div>
  </Group>;
}

function Offline({ ctx }) {
  const { Row, Group, btn, toast, data, setData, sync, api } = ctx;
  const size = (() => { try { return Object.keys(localStorage).reduce((a, k) => a + (localStorage.getItem(k) || '').length, 0); } catch { return 0; } })();
  const n = Object.keys(data.pages).length;
  return <Group title="Offline">
    <Row label="Alle sider er tilgjengelige offline" desc={`${n} sider lagres på denne enheten (${(size / 1024).toFixed(0)} kB). Endringer du gjør uten nett synkes når du er tilbake.`} />
    <Row label="Synkstatus" desc={sync.auth.token ? sync.status : 'Ikke logget inn – bare lokalt'} />
    {sync.auth.token && <Row label="Hent alt på nytt fra serveren" desc="Erstatter den lokale kopien med serverens versjon"><button style={btn()} onClick={() => confirm('Erstatte den lokale kopien med serverens?') && api('/api/workspace').then(w => { if (w.data) { setData(d => ({ ...w.data, server: d.server })); toast('Hentet fra serveren'); } })}>Hent</button></Row>}
  </Group>;
}

export function moreSections(ctx) {
  const { Row, Group, Toggle, Select, prefs, setPref, guardLogin, guard, v, set, save, dirty, btn, field, mono, data, setData, toast } = ctx;
  return [
    { id: 'varsler', group: 'Konto', label: 'Varsler', icon: '🔔', words: 'varsel påminnelse skrivebord push', render: () => <Group title="Varsler">
      <Row label="Skrivebordsvarsler" desc="Vis et systemvarsel for nye hendelser i innboksen"><Toggle on={prefs.notifyDesktop} onChange={async x => { if (x && 'Notification' in window && Notification.permission !== 'granted') { const p = await Notification.requestPermission(); if (p !== 'granted') return toast('Varsler er blokkert i nettleseren'); } setPref('notifyDesktop', x); }} /></Row>
      <Row label="Kommentarer og omtaler" desc="Når noen kommenterer på sidene dine"><Toggle on={prefs.mentions} onChange={x => setPref('mentions', x)} /></Row>
      <Row label="Påminnelser" desc="Datoer i databaser som er i dag"><Toggle on={prefs.reminders} onChange={x => setPref('reminders', x)} /></Row>
      <Row label="Test varsel"><button style={btn()} onClick={() => { if ('Notification' in window && Notification.permission === 'granted') new Notification('Marg', { body: 'Varsler fungerer.' }); else toast('Slå på skrivebordsvarsler først'); }}>Send test</button></Row>
    </Group> },
    { id: 'epost', group: 'Konto', label: 'E-post og kalender', icon: '📅', words: 'kalender ics ical google outlook abonnement', render: () => guard(<Group title="Kalenderabonnement">
      <div style={{ fontSize: 13.5, color: 'var(--muted)', margin: '4px 0 10px' }}>Lim inn ICS-adresser (én per linje), f.eks. «hemmelig adresse i iCal-format» fra Google Kalender eller en publisert Outlook-kalender. Hendelsene vises i Kalender.</div>
      <textarea value={v('ical_urls')} onChange={e => set('ical_urls', e.target.value)} rows={4} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" style={{ ...field, height: 'auto', padding: 10, ...mono, fontSize: 13 }} />
      {dirty(['ical_urls']) && <button style={{ ...btn('var(--text)', 'var(--bg)'), marginTop: 10 }} onClick={() => save(['ical_urls'])}>Lagre</button>}
    </Group>) },
    { id: 'sidestolpe', group: 'Innstillinger', label: 'Sidestolpe', icon: '📑', words: 'sidestolpe vis skjul sorter', render: () => <>
      <Group title="Vis">{[['sbHome', 'Hjem'], ['sbInbox', 'Innboks'], ['sbCal', 'Kalender'], ['sbFav', 'Favoritter'], ['sbRecent', 'Nylige']].map(([k, l]) => <Row key={k} label={l}><Toggle on={prefs[k]} onChange={x => setPref(k, x)} /></Row>)}</Group>
      <Group title="Rekkefølge"><Row label="Sorter sider"><Select value={prefs.sort} onChange={x => setPref('sort', x)} options={[['manual', 'Manuelt'], ['alpha', 'Alfabetisk'], ['edited', 'Sist redigert']]} /></Row></Group>
    </> },
    { id: 'generelt', group: 'Arbeidsområde', label: 'Generelt', icon: '🏠', words: 'navn arbeidsområde', render: () => <Group title="Arbeidsområde">
      <Row label="Navn" desc="Vises øverst i sidestolpen"><input value={data.workspaceName ?? 'Marg'} onChange={e => setData(d => ({ ...d, workspaceName: e.target.value }))} style={{ ...field, maxWidth: 260 }} /></Row>
      <Row label="Språk" desc="Marg er på norsk (bokmål)"><span style={{ color: 'var(--muted)', fontSize: 14 }}>Norsk</span></Row>
    </Group> },
    { id: 'personer', group: 'Arbeidsområde', label: 'Personer', icon: '👥', words: 'medlemmer gjester roller inviter brukere', render: () => guardLogin(<People ctx={ctx} />) },
    { id: 'sikkerhet', group: 'Arbeidsområde', label: 'Sikkerhet', icon: '🔐', words: 'passord tofaktor 2fa totp enheter logg ut', render: () => guardLogin(<Security ctx={ctx} />) },
    { id: 'domener', group: 'Arbeidsområde', label: 'Domener og publisering', icon: '🌐', words: 'domene publiser offentlig side lenke', render: () => guardLogin(<Published ctx={ctx} />) },
    { id: 'import', group: 'Arbeidsområde', label: 'Importer og eksporter', icon: '⇅', words: 'notion obsidian markdown json pdf eksport import zip', render: () => <ImportExport ctx={ctx} /> },
    { id: 'mote', group: 'Funksjoner', label: 'Møtenotater', icon: '🎙️', words: 'whisper transkripsjon opptak møte', render: () => guard(<>
      <Group title="Transkripsjon">
        <Row label="Whisper-adresse" desc={<>Start med <code>docker compose --profile whisper up -d</code> og bruk <code>http://whisper:9000</code>, eller pek til en whisper-tjeneste på Mac miniene.</>}><input value={v('whisper_url')} placeholder="http://whisper:9000" onChange={e => set('whisper_url', e.target.value)} style={{ ...field, ...mono, maxWidth: 260 }} /></Row>
        <Row label="Språk"><Select value={v('whisper_lang')} onChange={x => set('whisper_lang', x)} options={[['no', 'Norsk'], ['auto', 'Automatisk'], ['en', 'English']]} /></Row>
      </Group>
      {dirty(['whisper_']) && <button style={btn('var(--text)', 'var(--bg)')} onClick={() => save(['whisper_'])}>Lagre</button>}
      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 14 }}>Start et opptak fra «Møtenotater» i sidestolpen. Etterpå lager AI sammendrag, beslutninger og gjøremål, og gjøremålene kan legges i Oppgaver.</div>
    </>) },
    { id: 'tilk', group: 'Funksjoner', label: 'Tilkoblinger', icon: '🔗', words: 'webhook integrasjon', render: () => guardLogin(<Webhooks ctx={ctx} />) },
    { id: 'mcp', group: 'Funksjoner', label: 'Marg MCP', icon: '🧩', words: 'mcp claude api nøkkel token', render: () => guardLogin(<Mcp ctx={ctx} />) },
    { id: 'emoji', group: 'Funksjoner', label: 'Emoji', icon: '😀', words: 'egne emoji last opp', render: () => <Emojis ctx={ctx} /> },
    { id: 'offline', group: 'Funksjoner', label: 'Offline', icon: '✈️', words: 'offline lokal lagring synk', render: () => <Offline ctx={ctx} /> }
  ];
}
