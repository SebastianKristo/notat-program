import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';
import { encrypt, decrypt } from './secret.js';
import { createAI } from './ai.js';
import { createFeatures, checkTotp } from './features.js';
import { createCollab } from './collab.js';

const PORT = +process.env.PORT || 3000;
const UPDATER = process.env.UPDATER_URL || 'http://updater:8080';
const BACKUP = process.env.BACKUP_URL || 'http://backup:8090';
// Innstillinger som endres fra appen. Miljøvariablene er bare startverdier.
const settings = {
  ollama_enabled: 'true', ollama_url: process.env.OLLAMA_URL || '',
  gemini_enabled: 'false', gemini_key: '', gemini_model: 'gemini-2.5-flash',
  claude_enabled: 'false', claude_key: '', claude_model: 'claude-opus-5-5', claude_budget: '200',
  default_model: process.env.OLLAMA_DEFAULT_MODEL ? 'ollama:' + process.env.OLLAMA_DEFAULT_MODEL : '',
  fallback: 'ollama', private_local: 'true',
  smb_host: '', smb_path: 'marg', smb_user: '', smb_pass: '', smb_domain: 'WORKGROUP', smb_version: 'SMB3',
  bk_schedule: 'nightly', bk_keep: '30', bk_encrypt: 'true', bk_key: '',
  whisper_url: process.env.WHISPER_URL || '', whisper_lang: 'no', ical_urls: '', workspace_name: 'Marg', allow_guests: 'false',
  oidc_name: 'Authentik', oidc_issuer: '', oidc_client_id: '', oidc_client_secret: '', oidc_auto_create: 'false', public_url: ''
};
const SECRET = new Set(['gemini_key', 'claude_key', 'smb_pass', 'bk_key', 'oidc_client_secret']);
async function loadSettings() {
  for (const r of (await db.query('SELECT key, value FROM settings')).rows) if (r.key in settings) settings[r.key] = SECRET.has(r.key) ? decrypt(r.value) : r.value;
}
async function saveSetting(k, v) {
  settings[k] = v;
  await db.query('INSERT INTO settings(key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2', [k, SECRET.has(k) ? encrypt(v) : v]);
}
// Nøkler og passord sendes aldri til klienten, bare om de er satt.
const publicSettings = () => Object.fromEntries(Object.entries(settings).map(([k, v]) => SECRET.has(k) ? [k + '_set', !!v] : [k, v]));
const isAdmin = async uid => (await db.query('SELECT min(id) id FROM users')).rows[0].id === uid;
const ollama = () => settings.ollama_url.replace(/\/$/, '');
const ALLOW_SIGNUP = process.env.ALLOW_SIGNUP === 'true';
const HISTORY_EVERY_MS = 5 * 60 * 1000;
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const ai = createAI({ db, settings });
let features;

async function migrate() {
  for (let i = 0; ; i++) {
    try { await db.query(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8')); return; }
    catch (e) { if (i > 30) throw e; console.log('Venter på database …'); await new Promise(r => setTimeout(r, 2000)); }
  }
}

const hash = pw => { const salt = crypto.randomBytes(16).toString('hex'); return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex'); };
const verify = (pw, h) => { const [salt, k] = h.split(':'); const a = Buffer.from(k, 'hex'), b = crypto.scryptSync(pw, salt, 64); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const audit = (uid, action, detail) => db.query('INSERT INTO audit_log(user_id, action, detail) VALUES ($1,$2,$3)', [uid, action, detail]).catch(() => {});

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Filename', 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS' };
const send = (res, code, body) => { res.writeHead(code, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const readJson = req => new Promise((ok, fail) => {
  let s = ''; req.on('data', c => { s += c; if (s.length > 20e6) { fail(new Error('too large')); req.destroy(); } });
  req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { fail(e); } });
});
const seen = new Map();
async function auth(req) {
  const t = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!t) return null;
  if (t.startsWith('marg_')) return features.tokenAuth(req);
  const r = await db.query('SELECT user_id FROM sessions WHERE token=$1', [t]);
  const uid = r.rows[0]?.user_id ?? null;
  if (uid && Date.now() - (seen.get(t) || 0) > 60000) { seen.set(t, Date.now()); db.query('UPDATE sessions SET last_seen=now() WHERE token=$1', [t]).catch(() => {}); }
  return uid;
}

const routes = {
  'GET /api/health': async (req, res) => {
    let ollama = false; try { ollama = (await fetch(ollama() + '/api/tags', { signal: AbortSignal.timeout(2000) })).ok; } catch {}
    const users = (await db.query('SELECT count(*)::int n FROM users')).rows[0].n;
    send(res, 200, { ok: true, ollama, signup: ALLOW_SIGNUP || users === 0 || settings.allow_guests === 'true', name: settings.workspace_name });
  },

  'POST /api/register': async (req, res) => {
    const { email, password } = await readJson(req);
    if (!email || !password || password.length < 8) return send(res, 400, { error: 'E-post og passord (minst 8 tegn) kreves' });
    const users = (await db.query('SELECT count(*)::int n FROM users')).rows[0].n;
    const guest = users > 0 && !ALLOW_SIGNUP && settings.allow_guests === 'true';
    if (!ALLOW_SIGNUP && users > 0 && !guest) return send(res, 403, { error: 'Registrering er stengt' });
    try {
      const u = await db.query('INSERT INTO users(email, pw_hash, role) VALUES ($1,$2,$3) RETURNING id', [email.toLowerCase().trim(), hash(password), guest ? 'guest' : 'member']);
      const token = crypto.randomBytes(32).toString('hex');
      await db.query('INSERT INTO sessions(token, user_id, user_agent) VALUES ($1,$2,$3)', [token, u.rows[0].id, String(req.headers['user-agent'] || '').slice(0, 200)]);
      audit(u.rows[0].id, 'register', email);
      send(res, 200, { token });
    } catch { send(res, 409, { error: 'Brukeren finnes allerede' }); }
  },

  'POST /api/login': async (req, res) => {
    const { email, password, code } = await readJson(req);
    const u = (await db.query('SELECT id, pw_hash, totp_enabled, totp_secret FROM users WHERE email=$1', [String(email || '').toLowerCase().trim()])).rows[0];
    if (!u || !verify(String(password || ''), u.pw_hash)) { audit(null, 'login_failed', email); return send(res, 401, { error: 'Feil e-post eller passord' }); }
    if (u.totp_enabled) {
      if (!code) return send(res, 401, { error: 'Skriv inn koden fra autentiseringsappen', need_totp: true });
      if (!checkTotp(u.totp_secret, code)) { audit(u.id, 'login_failed_2fa', ''); return send(res, 401, { error: 'Feil kode', need_totp: true }); }
    }
    const token = crypto.randomBytes(32).toString('hex');
    await db.query('INSERT INTO sessions(token, user_id, user_agent) VALUES ($1,$2,$3)', [token, u.id, String(req.headers['user-agent'] || '').slice(0, 200)]);
    audit(u.id, 'login', req.headers['user-agent']);
    send(res, 200, { token });
  },

  'POST /api/logout': async (req, res) => {
    const t = (req.headers.authorization || '').replace(/^Bearer /, '');
    await db.query('DELETE FROM sessions WHERE token=$1', [t]);
    send(res, 200, { ok: true });
  },

  'GET /api/workspace': async (req, res, uid) => {
    const w = (await db.query('SELECT version, data FROM workspaces WHERE user_id=$1', [uid])).rows[0];
    send(res, 200, w || { version: 0, data: null });
  },

  // Optimistisk låsing: klienten sender versjonen den bygde på. Ved konflikt får den serverkopien tilbake.
  'PUT /api/workspace': async (req, res, uid) => {
    const { baseVersion = 0, data } = await readJson(req);
    if (!data || typeof data !== 'object') return send(res, 400, { error: 'data mangler' });
    const c = await db.connect();
    try {
      await c.query('BEGIN');
      const cur = (await c.query('SELECT version, data, updated_at FROM workspaces WHERE user_id=$1 FOR UPDATE', [uid])).rows[0];
      if (cur && cur.version !== baseVersion) { await c.query('ROLLBACK'); return send(res, 409, { version: cur.version, data: cur.data }); }
      const version = (cur?.version || 0) + 1;
      if (cur && Date.now() - new Date(cur.updated_at).getTime() > HISTORY_EVERY_MS)
        await c.query('INSERT INTO history(user_id, version, data) VALUES ($1,$2,$3)', [uid, cur.version, cur.data]);
      await c.query(`INSERT INTO workspaces(user_id, version, data, updated_at) VALUES ($1,$2,$3,now())
        ON CONFLICT (user_id) DO UPDATE SET version=$2, data=$3, updated_at=now()`, [uid, version, data]);
      await c.query('COMMIT');
      send(res, 200, { version });
      features.fireWebhooks(uid, cur?.data, data).catch(() => {});
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  },

  'GET /api/history': async (req, res, uid) => {
    const r = await db.query('SELECT id, version, created_at FROM history WHERE user_id=$1 ORDER BY id DESC LIMIT 200', [uid]);
    send(res, 200, r.rows);
  },

  'GET /api/settings': async (req, res, uid) => {
    let ollamaOk = false; try { ollamaOk = !!ollama() && (await fetch(ollama() + '/api/tags', { signal: AbortSignal.timeout(3000) })).ok; } catch {}
    send(res, 200, { ...publicSettings(), ollama_ok: ollamaOk, claude_used: Math.round(await ai.usage()), admin: await isAdmin(uid) });
  },

  'PUT /api/settings': async (req, res, uid) => {
    if (!(await isAdmin(uid))) return send(res, 403, { error: 'Bare administrator kan endre serverinnstillinger' });
    const body = await readJson(req), changed = [];
    for (const k of Object.keys(settings)) if (typeof body[k] === 'string' && k !== 'bk_key') { await saveSetting(k, body[k].trim()); changed.push(k); }
    audit(uid, 'settings', changed.join(', '));
    send(res, 200, publicSettings());
  },

  'POST /api/ai/test': async (req, res, uid) => {
    const { provider } = await readJson(req);
    try { send(res, 200, await ai.test(provider)); } catch (e) { send(res, 200, { ok: false, error: e.message }); }
  },

  // Sikkerhetskopi går via backup-tjenesten (smbclient, pg_dump).
  'GET /api/backup/status': async (req, res, uid) => proxyBackup(res, uid, '/status'),
  'GET /api/backup/list': async (req, res, uid) => proxyBackup(res, uid, '/list'),
  'POST /api/backup/test': async (req, res, uid) => proxyBackup(res, uid, '/test', 'POST'),
  'POST /api/backup/run': async (req, res, uid) => proxyBackup(res, uid, '/run', 'POST'),
  'POST /api/backup/restore': async (req, res, uid) => { const b = await readJson(req); audit(uid, 'restore_start', b.name); proxyBackup(res, uid, '/restore', 'POST', b); },
  'POST /api/backup/pages': async (req, res, uid) => {
    const { name } = await readJson(req), email = (await db.query('SELECT email FROM users WHERE id=$1', [uid])).rows[0].email;
    proxyBackup(res, uid, '/pages', 'POST', { name, email });
  },
  'POST /api/backup/upload': async (req, res, uid) => {
    if (!(await isAdmin(uid))) return send(res, 403, { error: 'Bare administrator' });
    const chunks = []; for await (const c of req) chunks.push(c);
    try { const r = await fetch(BACKUP + '/restore-upload', { method: 'POST', body: Buffer.concat(chunks) }); audit(uid, 'restore_upload', ''); send(res, r.status, await r.json()); }
    catch { send(res, 502, { error: 'Backup-tjenesten svarer ikke' }); }
  },
  'GET /api/backup/key': async (req, res, uid) => {
    if (!(await isAdmin(uid))) return send(res, 403, { error: 'Bare administrator' });
    await loadSettings(); audit(uid, 'backup_key_shown', ''); send(res, 200, { key: settings.bk_key });
  },

  'GET /api/audit': async (req, res, uid) => {
    if (!(await isAdmin(uid))) return send(res, 403, { error: 'Bare administrator' });
    const r = await db.query('SELECT a.action, a.detail, a.created_at, u.email FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 200');
    send(res, 200, r.rows);
  },

  // Serveroppdatering går via updater-tjenesten, som har tilgang til Docker og git-repoet.
  'GET /api/server/version': async (req, res, uid) => {
    if (!(await isAdmin(uid))) return send(res, 403, { error: 'Bare administrator' });
    try { send(res, 200, await (await fetch(UPDATER + '/status', { signal: AbortSignal.timeout(30000) })).json()); }
    catch { send(res, 502, { error: 'Oppdateringstjenesten svarer ikke' }); }
  },

  'POST /api/server/update': async (req, res, uid) => {
    if (!(await isAdmin(uid))) return send(res, 403, { error: 'Bare administrator' });
    try { const r = await fetch(UPDATER + '/update', { method: 'POST' }); audit(uid, 'server_update', ''); send(res, r.status, await r.json()); }
    catch { send(res, 502, { error: 'Oppdateringstjenesten svarer ikke' }); }
  },

  'GET /api/models': async (req, res) => send(res, 200, await ai.models()),

  // Strømmer ren tekst tilbake fra Ollama.
  'POST /api/ai': async (req, res, uid) => {
    const body = await readJson(req);
    let started = false;
    const write = t => { if (!started) { started = true; res.writeHead(200, { ...cors, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' }); } res.write(t); };
    try { const used = await ai.run(body, write); audit(uid, 'ai', `${used.provider}:${used.model}`); }
    catch (e) { if (!started) return send(res, e.code || 502, { error: e.message }); res.write(`\n\n(${e.message})`); }
    res.end();
  }
};
async function proxyBackup(res, uid, path, method = 'GET', body) {
  if (!(await isAdmin(uid))) return send(res, 403, { error: 'Bare administrator' });
  try {
    const r = await fetch(BACKUP + path, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body), signal: AbortSignal.timeout(60000) });
    send(res, r.status, await r.json());
  } catch { send(res, 502, { error: 'Backup-tjenesten svarer ikke' }); }
}
const PUBLIC = new Set(['GET /api/health', 'POST /api/register', 'POST /api/login']);

features = createFeatures({ db, send, readJson, audit, isAdmin, hash, verify, settings, saveSetting, cors });
Object.assign(routes, features.routes);
const collab = createCollab({ db, send, readJson, audit, isAdmin, settings, saveWs: features.saveWs, workspace: features.workspace, FILES: features.FILES, cors, hash });
Object.assign(routes, collab.routes);
collab.publicKeys.forEach(k => PUBLIC.add(k));

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const url = req.url.split('?')[0], key = `${req.method} ${url}`;
  let h = routes[key], isPublic = PUBLIC.has(key), params = [];
  if (!h) for (const [m, re, pub, fn] of features.param) {
    const mm = url.match(re);
    if (mm && (m instanceof RegExp ? m.test(req.method) : m === req.method)) { h = fn; isPublic = pub; params = mm.slice(1); break; }
  }
  if (!h) return send(res, 404, { error: 'Ikke funnet' });
  try {
    let uid = null;
    if (!isPublic) { uid = await auth(req); if (!uid) return send(res, 401, { error: 'Ikke innlogget' }); }
    await h(req, res, uid, params);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: 'Serverfeil' }); else res.end();
  }
}).listen(PORT, async () => { await migrate(); await loadSettings(); setInterval(() => loadSettings().catch(() => {}), 60000); console.log(`Marg API på :${PORT}`); });
