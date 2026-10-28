import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Funksjoner utover synk og AI: filer, personer, sikkerhet, publisering, historikk,
// webhooks, API-nøkler/MCP, transkribering og kalenderabonnement.
const FILES = process.env.FILES_DIR || '/data/files';
const MAX_FILE = 25 * 1024 * 1024;
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- TOTP (RFC 6238) ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32encode = buf => { let bits = '', out = ''; for (const b of buf) bits += b.toString(2).padStart(8, '0'); for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return out; };
const b32decode = s => { let bits = ''; for (const c of s.replace(/=+$/, '').toUpperCase()) bits += B32.indexOf(c).toString(2).padStart(5, '0'); const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); };
const totp = (secret, step) => {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', b32decode(secret)).update(msg).digest(), o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
};
export const checkTotp = (secret, code) => { const now = Math.floor(Date.now() / 30000); return [-1, 0, 1].some(d => totp(secret, now + d) === String(code).replace(/\s/g, '')); };

// ---------- Enkel ICS-parser ----------
function parseIcs(text) {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/), events = []; let ev = null;
  const date = v => { const m = v.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/); if (!m) return null; const [, y, mo, d, h = '00', mi = '00', s = '00', z] = m; return { iso: `${y}-${mo}-${d}T${h}:${mi}:${s}${z ? 'Z' : ''}`, allDay: !m[4] }; };
  for (const l of lines) {
    if (l === 'BEGIN:VEVENT') ev = {};
    else if (l === 'END:VEVENT') { if (ev?.start) events.push(ev); ev = null; }
    else if (ev) {
      const i = l.indexOf(':'); if (i < 0) continue;
      const k = l.slice(0, i).split(';')[0], v = l.slice(i + 1).replace(/\\,/g, ',').replace(/\\n/g, '\n');
      if (k === 'SUMMARY') ev.title = v; else if (k === 'LOCATION') ev.location = v;
      else if (k === 'DTSTART') { const d = date(v); if (d) { ev.start = d.iso; ev.allDay = d.allDay; } }
      else if (k === 'DTEND') { const d = date(v); if (d) ev.end = d.iso; }
    }
  }
  return events;
}

// ---------- Side → HTML for publiserte sider ----------
function pageHtml(page, { title, indexable }) {
  const blocks = (page.blocks || []).map(b => {
    const t = esc(b.text);
    switch (b.type) {
      case 'h': return `<h2>${t}</h2>`;
      case 'li': return `<ul><li>${t}</li></ul>`;
      case 'todo': return `<p class="todo">${b.done ? '☑' : '☐'} ${b.done ? `<s>${t}</s>` : t}</p>`;
      case 'quote': return `<blockquote>${t}</blockquote>`;
      case 'callout': return `<div class="callout">${esc(b.icon || '💡')} ${t}</div>`;
      case 'math': return `<div class="math">${t}</div>`;
      case 'toggle': return `<details><summary>${t}</summary><p>${esc(b.body)}</p></details>`;
      case 'divider': return '<hr>';
      case 'image': return b.url ? `<img src="${esc(b.url)}" alt="${t}">` : '';
      default: return t ? `<p>${t}</p>` : '';
    }
  }).join('\n');
  const icon = page.icon && !['doc', 'db'].includes(page.icon) && !String(page.icon).startsWith('{') ? esc(page.icon) : '';
  return `<!doctype html><html lang="no"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>${indexable ? '' : '<meta name="robots" content="noindex">'}
<style>:root{color-scheme:light dark}body{margin:0;font:17px/1.6 -apple-system,'IBM Plex Sans',system-ui,sans-serif;background:#fff;color:#2b2a27}
@media(prefers-color-scheme:dark){body{background:#191919;color:#ebebe9}.callout,.math{background:#252525!important}}
main{max-width:720px;margin:0 auto;padding:56px 24px}.cover{height:200px;background-size:cover;background-position:center}.icon{font-size:56px}h1{font-size:36px;margin:8px 0 24px}
.callout{background:#f1f1ef;border-radius:8px;padding:14px 16px;margin:10px 0}.math{background:#f7f7f5;border-radius:8px;padding:16px;text-align:center;font:italic 21px Georgia,serif}
blockquote{border-left:3px solid currentColor;margin:10px 0;padding-left:14px}img{max-width:100%;border-radius:8px}footer{margin-top:48px;font-size:13px;opacity:.6}</style></head>
<body>${page.cover ? `<div class="cover" style="background:${esc(page.cover)};background-size:cover;background-position:center"></div>` : ''}<main>${icon ? `<div class="icon">${icon}</div>` : ''}<h1>${esc(page.title || 'Uten tittel')}</h1>
${blocks}<footer>Publisert med Marg</footer></main></body></html>`;
}
const pwForm = (slug, err) => `<!doctype html><html lang="no"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Passord</title>
<style>body{font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#191919;color:#ebebe9}form{display:flex;gap:8px;flex-direction:column;width:280px}input,button{height:40px;border-radius:8px;border:0;padding:0 12px;font:inherit}button{background:#ebebe9;color:#191919;font-weight:600}</style></head>
<body><form method="post" action="/p/${esc(slug)}"><b>Siden er passordbeskyttet</b>${err ? '<span style="color:#ec8c8c">Feil passord</span>' : ''}<input type="password" name="pw" placeholder="Passord" autofocus><button>Åpne</button></form></body></html>`;

export function createFeatures({ db, send, readJson, audit, isAdmin, hash, verify, settings, saveSetting, cors }) {
  fs.mkdirSync(FILES, { recursive: true });
  const readBody = (req, max) => new Promise((ok, fail) => { const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > max) { fail(Object.assign(new Error('Filen er for stor (maks 25 MB)'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => ok(Buffer.concat(chunks))); req.on('error', fail); });
  const workspace = async uid => (await db.query('SELECT data FROM workspaces WHERE user_id=$1', [uid])).rows[0]?.data || { pages: {} };
  const adminOnly = async (uid, res) => { if (await isAdmin(uid)) return true; send(res, 403, { error: 'Bare administrator' }); return false; };

  // Webhooks: kalles når sider endres
  async function fireWebhooks(uid, before, after) {
    const hooks = (await db.query('SELECT url, secret FROM webhooks WHERE user_id=$1 AND enabled', [uid])).rows;
    if (!hooks.length) return;
    const b = before?.pages || {}, a = after?.pages || {};
    const changed = Object.keys(a).filter(id => !b[id] || (a[id].t || 0) !== (b[id].t || 0)).map(id => ({ id, title: a[id].title, event: b[id] ? 'page.updated' : 'page.created' }));
    const deleted = Object.keys(b).filter(id => !a[id]).map(id => ({ id, title: b[id].title, event: 'page.deleted' }));
    const events = [...changed, ...deleted]; if (!events.length) return;
    const body = JSON.stringify({ events, at: new Date().toISOString() });
    for (const h of hooks) fetch(h.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Marg-Signature': crypto.createHmac('sha256', h.secret).update(body).digest('hex') }, body, signal: AbortSignal.timeout(8000) }).catch(() => {});
  }

  // API-nøkler (for MCP og skript)
  async function tokenAuth(req) {
    const t = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (!t.startsWith('marg_')) return null;
    const r = await db.query('UPDATE api_tokens SET last_used=now() WHERE token_hash=$1 RETURNING user_id', [sha(t)]);
    return r.rows[0]?.user_id ?? null;
  }

  // ---------- MCP (JSON-RPC over HTTP) ----------
  const textOf = p => [p.title, ...(p.blocks || []).map(b => [b.text, b.body].filter(Boolean).join('\n'))].filter(Boolean).join('\n');
  const MCP_TOOLS = [
    { name: 'search_pages', description: 'Søk i sidene i Marg etter tittel eller innhold.', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
    { name: 'read_page', description: 'Les hele innholdet i en side.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'create_page', description: 'Lag en ny side med tittel og tekst (avsnitt skilles med tom linje).', inputSchema: { type: 'object', properties: { title: { type: 'string' }, text: { type: 'string' } }, required: ['title'] } },
    { name: 'append_to_page', description: 'Legg til tekst nederst i en side.', inputSchema: { type: 'object', properties: { id: { type: 'string' }, text: { type: 'string' } }, required: ['id', 'text'] } }
  ];
  async function saveWs(uid, f) {
    const c = await db.connect();
    try {
      await c.query('BEGIN');
      const cur = (await c.query('SELECT version, data FROM workspaces WHERE user_id=$1 FOR UPDATE', [uid])).rows[0];
      const data = f(cur?.data || { pages: {}, rows: [], recent: [], priv: [] });
      await c.query(`INSERT INTO workspaces(user_id, version, data, updated_at) VALUES ($1,$2,$3,now()) ON CONFLICT (user_id) DO UPDATE SET version=$2, data=$3, updated_at=now()`, [uid, (cur?.version || 0) + 1, data]);
      await c.query('COMMIT');
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  }
  const rid = () => crypto.randomBytes(5).toString('base64url');
  const toBlocks = text => String(text || '').split(/\n{2,}/).map(t => t.trim()).filter(Boolean).map(t => ({ id: rid(), type: /^#{1,3} /.test(t) ? 'h' : 'p', text: t.replace(/^#{1,3} /, '') }));
  async function mcpCall(uid, name, args) {
    const ws = await workspace(uid), pages = ws.pages || {};
    if (name === 'search_pages') {
      const q = String(args.query || '').toLowerCase();
      return Object.entries(pages).filter(([, p]) => !p.trashed && textOf(p).toLowerCase().includes(q)).slice(0, 20).map(([id, p]) => `${id}: ${p.title || 'Uten tittel'}`).join('\n') || 'Ingen treff.';
    }
    if (name === 'read_page') { const p = pages[args.id]; if (!p) throw new Error('Fant ikke siden'); return textOf(p); }
    if (name === 'create_page') {
      const id = 'p' + rid();
      await saveWs(uid, d => ({ ...d, pages: { ...d.pages, [id]: { icon: 'doc', title: args.title, props: [], blocks: toBlocks(args.text), t: Date.now() } }, priv: [id, ...(d.priv || [])] }));
      return `Opprettet siden ${id}.`;
    }
    if (name === 'append_to_page') {
      if (!pages[args.id]) throw new Error('Fant ikke siden');
      await saveWs(uid, d => ({ ...d, pages: { ...d.pages, [args.id]: { ...d.pages[args.id], blocks: [...(d.pages[args.id].blocks || []), ...toBlocks(args.text)], t: Date.now() } } }));
      return 'Lagt til.';
    }
    throw new Error('Ukjent verktøy');
  }

  const routes = {
    // ----- Filer og vedlegg -----
    'POST /api/files': async (req, res, uid) => {
      const name = decodeURIComponent(req.headers['x-filename'] || 'fil'), mime = req.headers['content-type'] || 'application/octet-stream';
      let buf; try { buf = await readBody(req, MAX_FILE); } catch (e) { return send(res, e.code || 400, { error: e.message }); }
      const id = crypto.randomBytes(18).toString('base64url');
      fs.writeFileSync(path.join(FILES, id), buf);
      await db.query('INSERT INTO files(id, user_id, name, mime, size) VALUES ($1,$2,$3,$4,$5)', [id, uid, name.slice(0, 200), mime, buf.length]);
      send(res, 200, { id, url: `/api/files/${id}`, name, mime, size: buf.length });
    },

    // ----- Personer -----
    'GET /api/users': async (req, res, uid) => {
      const r = await db.query('SELECT id, email, role, totp_enabled, created_at, (SELECT max(last_seen) FROM sessions s WHERE s.user_id=u.id) last_seen FROM users u ORDER BY id');
      const admin = await isAdmin(uid);
      send(res, 200, r.rows.map((u, i) => ({ ...u, role: i === 0 ? 'admin' : u.role, me: u.id === uid, canEdit: admin })));
    },
    'POST /api/users': async (req, res, uid) => {
      if (!(await adminOnly(uid, res))) return;
      const { email, password, role = 'member' } = await readJson(req);
      if (!email || !password || password.length < 8) return send(res, 400, { error: 'E-post og passord (minst 8 tegn) kreves' });
      try { await db.query('INSERT INTO users(email, pw_hash, role) VALUES ($1,$2,$3)', [email.toLowerCase().trim(), hash(password), role === 'guest' ? 'guest' : 'member']); }
      catch { return send(res, 409, { error: 'Brukeren finnes allerede' }); }
      audit(uid, 'user_invited', email); send(res, 200, { ok: true });
    },

    // ----- Sikkerhet -----
    'GET /api/security': async (req, res, uid) => {
      const u = (await db.query('SELECT totp_enabled FROM users WHERE id=$1', [uid])).rows[0];
      const cur = (req.headers.authorization || '').replace(/^Bearer /, '');
      const s = (await db.query('SELECT token, user_agent, created_at, last_seen FROM sessions WHERE user_id=$1 ORDER BY last_seen DESC', [uid])).rows;
      send(res, 200, { totp: u.totp_enabled, sessions: s.map(x => ({ id: sha(x.token).slice(0, 16), agent: x.user_agent, created: x.created_at, seen: x.last_seen, current: x.token === cur })) });
    },
    'POST /api/security/password': async (req, res, uid) => {
      const { current, next } = await readJson(req);
      const u = (await db.query('SELECT pw_hash FROM users WHERE id=$1', [uid])).rows[0];
      if (!verify(String(current || ''), u.pw_hash)) return send(res, 400, { error: 'Feil nåværende passord' });
      if (!next || next.length < 8) return send(res, 400, { error: 'Nytt passord må ha minst 8 tegn' });
      await db.query('UPDATE users SET pw_hash=$1 WHERE id=$2', [hash(next), uid]); audit(uid, 'password_changed', ''); send(res, 200, { ok: true });
    },
    'POST /api/security/totp/setup': async (req, res, uid) => {
      const secret = b32encode(crypto.randomBytes(20));
      await db.query('UPDATE users SET totp_secret=$1, totp_enabled=false WHERE id=$2', [secret, uid]);
      const email = (await db.query('SELECT email FROM users WHERE id=$1', [uid])).rows[0].email;
      send(res, 200, { secret, uri: `otpauth://totp/Marg:${encodeURIComponent(email)}?secret=${secret}&issuer=Marg` });
    },
    'POST /api/security/totp/enable': async (req, res, uid) => {
      const { code } = await readJson(req);
      const u = (await db.query('SELECT totp_secret FROM users WHERE id=$1', [uid])).rows[0];
      if (!u.totp_secret || !checkTotp(u.totp_secret, code)) return send(res, 400, { error: 'Feil kode' });
      await db.query('UPDATE users SET totp_enabled=true WHERE id=$1', [uid]); audit(uid, '2fa_enabled', ''); send(res, 200, { ok: true });
    },
    'POST /api/security/totp/disable': async (req, res, uid) => {
      const { code } = await readJson(req);
      const u = (await db.query('SELECT totp_secret, totp_enabled FROM users WHERE id=$1', [uid])).rows[0];
      if (u.totp_enabled && !checkTotp(u.totp_secret, code)) return send(res, 400, { error: 'Feil kode' });
      await db.query('UPDATE users SET totp_enabled=false, totp_secret=NULL WHERE id=$1', [uid]); audit(uid, '2fa_disabled', ''); send(res, 200, { ok: true });
    },
    'POST /api/security/logout-others': async (req, res, uid) => {
      const cur = (req.headers.authorization || '').replace(/^Bearer /, '');
      const r = await db.query('DELETE FROM sessions WHERE user_id=$1 AND token<>$2', [uid, cur]);
      audit(uid, 'logout_others', String(r.rowCount)); send(res, 200, { count: r.rowCount });
    },

    // ----- Publisering -----
    'GET /api/publish': async (req, res, uid) => {
      const r = await db.query(`SELECT p.slug, p.page_id, p.pw_hash IS NOT NULL protected, p.indexable, p.expires, p.created_at,
        coalesce((SELECT sum(count) FROM page_views v WHERE v.slug=p.slug AND v.day > current_date - 28),0)::int views
        FROM published p WHERE user_id=$1 ORDER BY created_at DESC`, [uid]);
      send(res, 200, r.rows);
    },
    'POST /api/publish': async (req, res, uid) => {
      const { pageId, slug, password, indexable = false, expiresDays } = await readJson(req);
      const clean = String(slug || '').toLowerCase().replace(/[^a-z0-9æøå-]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || rid();
      const ws = await workspace(uid); if (!ws.pages?.[pageId]) return send(res, 404, { error: 'Fant ikke siden (er den synket?)' });
      const taken = (await db.query('SELECT user_id, page_id FROM published WHERE slug=$1', [clean])).rows[0];
      if (taken && (taken.user_id !== uid || taken.page_id !== pageId)) return send(res, 409, { error: 'Adressen er tatt' });
      await db.query('DELETE FROM published WHERE user_id=$1 AND page_id=$2', [uid, pageId]);
      await db.query('INSERT INTO published(slug, user_id, page_id, pw_hash, indexable, expires) VALUES ($1,$2,$3,$4,$5,$6)',
        [clean, uid, pageId, password ? hash(password) : null, !!indexable, expiresDays ? new Date(Date.now() + expiresDays * 864e5) : null]);
      audit(uid, 'published', clean); send(res, 200, { slug: clean, path: `/p/${clean}` });
    },
    'POST /api/unpublish': async (req, res, uid) => {
      const { pageId } = await readJson(req);
      await db.query('DELETE FROM published WHERE user_id=$1 AND page_id=$2', [uid, pageId]); audit(uid, 'unpublished', pageId); send(res, 200, { ok: true });
    },

    // ----- Sidehistorikk -----
    'POST /api/history/page': async (req, res, uid) => {
      const { pageId } = await readJson(req);
      const r = await db.query(`SELECT id, version, created_at, data->'pages'->$2 page FROM history WHERE user_id=$1 AND data->'pages' ? $2 ORDER BY id DESC LIMIT 100`, [uid, pageId]);
      const out = []; let last = null;
      for (const h of r.rows) { const key = JSON.stringify(h.page); if (key !== last) out.push({ id: h.id, at: h.created_at, page: h.page }); last = key; }
      send(res, 200, out);
    },

    // ----- Webhooks -----
    'GET /api/webhooks': async (req, res, uid) => send(res, 200, (await db.query('SELECT id, url, enabled, created_at FROM webhooks WHERE user_id=$1 ORDER BY id', [uid])).rows),
    'POST /api/webhooks': async (req, res, uid) => {
      const { url, id, enabled, remove } = await readJson(req);
      if (remove) await db.query('DELETE FROM webhooks WHERE id=$1 AND user_id=$2', [id, uid]);
      else if (id) await db.query('UPDATE webhooks SET enabled=$1 WHERE id=$2 AND user_id=$3', [!!enabled, id, uid]);
      else {
        if (!/^https?:\/\//.test(url || '')) return send(res, 400, { error: 'Ugyldig adresse' });
        const secret = crypto.randomBytes(16).toString('hex');
        await db.query('INSERT INTO webhooks(user_id, url, secret) VALUES ($1,$2,$3)', [uid, url, secret]);
        return send(res, 200, { secret });
      }
      send(res, 200, { ok: true });
    },

    // ----- API-nøkler -----
    'GET /api/tokens': async (req, res, uid) => send(res, 200, (await db.query('SELECT substr(token_hash,1,12) id, name, created_at, last_used FROM api_tokens WHERE user_id=$1 ORDER BY created_at', [uid])).rows),
    'POST /api/tokens': async (req, res, uid) => {
      const { name, removeId } = await readJson(req);
      if (removeId) { await db.query('DELETE FROM api_tokens WHERE user_id=$1 AND substr(token_hash,1,12)=$2', [uid, removeId]); return send(res, 200, { ok: true }); }
      const token = 'marg_' + crypto.randomBytes(24).toString('base64url');
      await db.query('INSERT INTO api_tokens(token_hash, user_id, name) VALUES ($1,$2,$3)', [sha(token), uid, String(name || 'Nøkkel').slice(0, 60)]);
      audit(uid, 'api_token_created', name); send(res, 200, { token });
    },

    // ----- Transkribering (whisper) -----
    'POST /api/transcribe': async (req, res, uid) => {
      if (!settings.whisper_url) return send(res, 503, { error: 'Whisper er ikke satt opp. Legg inn adressen under Innstillinger → Møtenotater.' });
      let buf; try { buf = await readBody(req, 200 * 1024 * 1024); } catch (e) { return send(res, 413, { error: e.message }); }
      const form = new FormData();
      form.append('audio_file', new Blob([buf], { type: req.headers['content-type'] || 'audio/webm' }), 'opptak.webm');
      const lang = settings.whisper_lang === 'auto' ? '' : `&language=${settings.whisper_lang || 'no'}`;
      try {
        const r = await fetch(settings.whisper_url.replace(/\/$/, '') + `/asr?task=transcribe&output=txt${lang}`, { method: 'POST', body: form });
        if (!r.ok) return send(res, 502, { error: 'Whisper: ' + (await r.text()).slice(0, 200) });
        audit(uid, 'transcribe', `${Math.round(buf.length / 1024)} kB`); send(res, 200, { text: (await r.text()).trim() });
      } catch { send(res, 502, { error: 'Whisper svarer ikke' }); }
    },

    // ----- Kalenderabonnement (ICS) -----
    'GET /api/calendar': async (req, res, uid) => {
      const urls = (settings.ical_urls || '').split(/\s+/).filter(Boolean), events = [], errors = [];
      for (const u of urls) {
        try { const r = await fetch(u.replace(/^webcal:/, 'https:'), { signal: AbortSignal.timeout(10000) }); events.push(...parseIcs(await r.text())); }
        catch { errors.push(u); }
      }
      send(res, 200, { events, errors });
    },

    // ----- MCP -----
    'POST /api/mcp': async (req, res, uid) => {
      const m = await readJson(req), reply = result => send(res, 200, { jsonrpc: '2.0', id: m.id, result }), fail = (code, message) => send(res, 200, { jsonrpc: '2.0', id: m.id, error: { code, message } });
      if (m.method === 'initialize') return reply({ protocolVersion: m.params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'marg', version: '1.0.0' } });
      if (m.method?.startsWith('notifications/')) { res.writeHead(202, cors); return res.end(); }
      if (m.method === 'tools/list') return reply({ tools: MCP_TOOLS });
      if (m.method === 'tools/call') {
        try { const text = await mcpCall(uid, m.params?.name, m.params?.arguments || {}); audit(uid, 'mcp', m.params?.name); return reply({ content: [{ type: 'text', text }] }); }
        catch (e) { return reply({ content: [{ type: 'text', text: e.message }], isError: true }); }
      }
      if (m.method === 'ping') return reply({});
      fail(-32601, 'Ukjent metode');
    }
  };

  // Ruter med parametre
  const param = [
    ['GET', /^\/api\/files\/([\w-]+)$/, true, async (req, res, uid, [id]) => {
      const f = (await db.query('SELECT name, mime FROM files WHERE id=$1', [id])).rows[0];
      if (!f || !fs.existsSync(path.join(FILES, id))) return send(res, 404, { error: 'Fant ikke filen' });
      res.writeHead(200, { ...cors, 'Content-Type': f.mime, 'Cache-Control': 'private, max-age=31536000, immutable', 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(f.name)}` });
      fs.createReadStream(path.join(FILES, id)).pipe(res);
    }],
    ['POST', /^\/api\/users\/(\d+)$/, false, async (req, res, uid, [id]) => {
      if (!(await adminOnly(uid, res))) return;
      const { role, remove } = await readJson(req);
      if (+id === uid) return send(res, 400, { error: 'Du kan ikke endre deg selv' });
      if (remove) await db.query('DELETE FROM users WHERE id=$1', [id]);
      else await db.query('UPDATE users SET role=$1 WHERE id=$2', [role === 'guest' ? 'guest' : 'member', id]);
      audit(uid, remove ? 'user_removed' : 'user_role', id); send(res, 200, { ok: true });
    }],
    [/^(GET|POST)$/, /^\/p\/([\w%æøå-]+)$/, true, async (req, res, uid, [slug]) => {
      slug = decodeURIComponent(slug);
      const p = (await db.query('SELECT * FROM published WHERE slug=$1', [slug])).rows[0];
      const html = (code, body) => { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(body); };
      if (!p || (p.expires && new Date(p.expires) < new Date())) return html(404, '<!doctype html><meta charset="utf-8"><title>Ikke funnet</title><p style="font:16px system-ui;padding:40px">Siden finnes ikke eller er ikke lenger publisert.</p>');
      if (p.pw_hash) {
        const cookie = (req.headers.cookie || '').match(new RegExp(`marg_p_${slug}=([\\w-]+)`))?.[1];
        const ok = cookie === sha(p.pw_hash + slug).slice(0, 32);
        if (!ok) {
          if (req.method !== 'POST') return html(200, pwForm(slug));
          const body = new URLSearchParams((await readBody(req, 10000)).toString());
          if (!verify(body.get('pw') || '', p.pw_hash)) return html(401, pwForm(slug, true));
          res.setHeader('Set-Cookie', `marg_p_${slug}=${sha(p.pw_hash + slug).slice(0, 32)}; Path=/p/${encodeURIComponent(slug)}; HttpOnly; SameSite=Lax; Max-Age=2592000`);
        }
      }
      const page = (await workspace(p.user_id)).pages?.[p.page_id];
      if (!page) return html(404, '<!doctype html><meta charset="utf-8"><p style="font:16px system-ui;padding:40px">Siden er slettet.</p>');
      db.query('INSERT INTO page_views(slug, day, count) VALUES ($1, current_date, 1) ON CONFLICT (slug, day) DO UPDATE SET count=page_views.count+1', [slug]).catch(() => {});
      html(200, pageHtml(page, { title: page.title || 'Marg', indexable: p.indexable }));
    }],
    ['GET', /^\/api\/publish\/([\w%æøå-]+)\/views$/, false, async (req, res, uid, [slug]) => {
      const r = await db.query(`SELECT d::date AS day, coalesce(v.count,0) AS count FROM generate_series(current_date-27, current_date, '1 day') d
        LEFT JOIN page_views v ON v.day=d::date AND v.slug=$1 WHERE EXISTS (SELECT 1 FROM published WHERE slug=$1 AND user_id=$2) ORDER BY d`, [decodeURIComponent(slug), uid]);
      send(res, 200, r.rows);
    }]
  ];

  return { routes, param, tokenAuth, fireWebhooks, saveWs, workspace, FILES };
}
