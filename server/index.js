import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';

const PORT = +process.env.PORT || 3000;
const OLLAMA = (process.env.OLLAMA_URL || 'http://ollama:11434').replace(/\/$/, '');
const ALLOW_SIGNUP = process.env.ALLOW_SIGNUP === 'true';
const HISTORY_EVERY_MS = 5 * 60 * 1000;
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  for (let i = 0; ; i++) {
    try { await db.query(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8')); return; }
    catch (e) { if (i > 30) throw e; console.log('Venter på database …'); await new Promise(r => setTimeout(r, 2000)); }
  }
}

const hash = pw => { const salt = crypto.randomBytes(16).toString('hex'); return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex'); };
const verify = (pw, h) => { const [salt, k] = h.split(':'); const a = Buffer.from(k, 'hex'), b = crypto.scryptSync(pw, salt, 64); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const audit = (uid, action, detail) => db.query('INSERT INTO audit_log(user_id, action, detail) VALUES ($1,$2,$3)', [uid, action, detail]).catch(() => {});

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS' };
const send = (res, code, body) => { res.writeHead(code, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const readJson = req => new Promise((ok, fail) => {
  let s = ''; req.on('data', c => { s += c; if (s.length > 20e6) { fail(new Error('too large')); req.destroy(); } });
  req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { fail(e); } });
});
async function auth(req) {
  const t = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!t) return null;
  const r = await db.query('SELECT user_id FROM sessions WHERE token=$1', [t]);
  return r.rows[0]?.user_id ?? null;
}

const routes = {
  'GET /api/health': async (req, res) => {
    let ollama = false; try { ollama = (await fetch(OLLAMA + '/api/tags', { signal: AbortSignal.timeout(2000) })).ok; } catch {}
    const users = (await db.query('SELECT count(*)::int n FROM users')).rows[0].n;
    send(res, 200, { ok: true, ollama, signup: ALLOW_SIGNUP || users === 0 });
  },

  'POST /api/register': async (req, res) => {
    const { email, password } = await readJson(req);
    if (!email || !password || password.length < 8) return send(res, 400, { error: 'E-post og passord (minst 8 tegn) kreves' });
    const users = (await db.query('SELECT count(*)::int n FROM users')).rows[0].n;
    if (!ALLOW_SIGNUP && users > 0) return send(res, 403, { error: 'Registrering er stengt' });
    try {
      const u = await db.query('INSERT INTO users(email, pw_hash) VALUES ($1,$2) RETURNING id', [email.toLowerCase().trim(), hash(password)]);
      const token = crypto.randomBytes(32).toString('hex');
      await db.query('INSERT INTO sessions(token, user_id) VALUES ($1,$2)', [token, u.rows[0].id]);
      audit(u.rows[0].id, 'register', email);
      send(res, 200, { token });
    } catch { send(res, 409, { error: 'Brukeren finnes allerede' }); }
  },

  'POST /api/login': async (req, res) => {
    const { email, password } = await readJson(req);
    const u = (await db.query('SELECT id, pw_hash FROM users WHERE email=$1', [String(email || '').toLowerCase().trim()])).rows[0];
    if (!u || !verify(String(password || ''), u.pw_hash)) { audit(null, 'login_failed', email); return send(res, 401, { error: 'Feil e-post eller passord' }); }
    const token = crypto.randomBytes(32).toString('hex');
    await db.query('INSERT INTO sessions(token, user_id) VALUES ($1,$2)', [token, u.id]);
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
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  },

  'GET /api/history': async (req, res, uid) => {
    const r = await db.query('SELECT id, version, created_at FROM history WHERE user_id=$1 ORDER BY id DESC LIMIT 200', [uid]);
    send(res, 200, r.rows);
  },

  'GET /api/models': async (req, res) => {
    try { const r = await (await fetch(OLLAMA + '/api/tags')).json(); send(res, 200, (r.models || []).map(m => m.name)); }
    catch { send(res, 502, { error: 'Ollama svarer ikke' }); }
  },

  // Strømmer ren tekst tilbake fra Ollama.
  'POST /api/ai': async (req, res, uid) => {
    let { model = 'llama3.1:8b', prompt = '', context = {} } = await readJson(req);
    // Delt Ollama (f.eks. på en Mac mini) har ikke nødvendigvis modellen appen ber om.
    try {
      const names = ((await (await fetch(OLLAMA + '/api/tags', { signal: AbortSignal.timeout(3000) })).json()).models || []).map(m => m.name);
      if (names.length && !names.includes(model)) model = names.includes(process.env.OLLAMA_DEFAULT_MODEL) ? process.env.OLLAMA_DEFAULT_MODEL : names.find(n => !/embed/.test(n)) || names[0];
    } catch {}
    const sys = 'Du er Marg, en hjelpsom assistent i en notatapp. Svar kort og på norsk.';
    const ctx = context.text ? `\n\nSiden brukeren har åpen:\n"""\n${String(context.text).slice(0, 12000)}\n"""` : '';
    let up;
    try {
      up = await fetch(OLLAMA + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, system: sys + ctx, prompt, stream: true }) });
    } catch { return send(res, 502, { error: 'Ollama svarer ikke' }); }
    if (!up.ok) return send(res, 502, { error: `Ollama: ${await up.text()}` });
    res.writeHead(200, { ...cors, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
    const dec = new TextDecoder(); let buf = '';
    for await (const chunk of up.body) {
      buf += dec.decode(chunk, { stream: true });
      let i; while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (line.trim()) try { res.write(JSON.parse(line).response || ''); } catch {}
      }
    }
    res.end();
    audit(uid, 'ai', model);
  }
};
const PUBLIC = new Set(['GET /api/health', 'POST /api/register', 'POST /api/login']);

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const key = `${req.method} ${req.url.split('?')[0]}`;
  const h = routes[key];
  if (!h) return send(res, 404, { error: 'Ikke funnet' });
  try {
    let uid = null;
    if (!PUBLIC.has(key)) { uid = await auth(req); if (!uid) return send(res, 401, { error: 'Ikke innlogget' }); }
    await h(req, res, uid);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: 'Serverfeil' }); else res.end();
  }
}).listen(PORT, async () => { await migrate(); console.log(`Marg API på :${PORT}`); });
