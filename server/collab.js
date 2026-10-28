import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Delte sider mellom personer, innlogging med SSO (OpenID Connect) og import via Notion-API-et.
const rid = () => crypto.randomBytes(5).toString('base64url');
const KEEP = ['parent', 'fav', 'private', 'trashed'];   // eierens egne felt som ikke overskrives av andre

export function createCollab({ db, send, readJson, audit, isAdmin, settings, saveWs, workspace, FILES, cors, hash }) {
  const userByEmail = async email => (await db.query('SELECT id, email FROM users WHERE email=$1', [String(email || '').toLowerCase().trim()])).rows[0];

  // ---------- SSO (OIDC authorization code) ----------
  const pending = new Map();   // state -> { verifier, nonce, token?, email?, error?, at }
  setInterval(() => { for (const [k, v] of pending) if (Date.now() - v.at > 10 * 60000) pending.delete(k); }, 60000).unref();
  const ssoOn = () => !!(settings.oidc_issuer && settings.oidc_client_id);
  const discovery = async () => (await fetch(settings.oidc_issuer.replace(/\/$/, '') + '/.well-known/openid-configuration', { signal: AbortSignal.timeout(8000) })).json();
  const publicBase = req => settings.public_url?.replace(/\/$/, '') || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers['x-forwarded-host'] || req.headers.host}`;
  const html = (res, code, msg) => { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Marg</title><body style="font:16px -apple-system,system-ui;background:#191919;color:#ebebe9;display:grid;place-items:center;height:100vh;margin:0;text-align:center"><div><div style="font-size:40px">${code === 200 ? '✓' : '⚠️'}</div><p>${msg}</p></div><script>setTimeout(()=>window.close(),1500)</script>`); };

  // ---------- Notion-API ----------
  const NOTION = 'https://api.notion.com/v1';
  const notion = async (token, p, body) => {
    const r = await fetch(NOTION + p, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: body && JSON.stringify(body), signal: AbortSignal.timeout(20000) }).catch(() => { throw Object.assign(new Error('Fikk ikke kontakt med api.notion.com fra serveren'), { code: 502 }); });
    const j = await r.json();
    if (!r.ok) throw Object.assign(new Error('Notion: ' + (j.message || r.status)), { code: r.status === 401 ? 400 : 502 });
    return j;
  };
  const rich = a => (a || []).map(t => t.plain_text).join('');
  async function storeRemote(url, uid) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) }); if (!r.ok) return url;
      const buf = Buffer.from(await r.arrayBuffer()), id = crypto.randomBytes(18).toString('base64url');
      fs.writeFileSync(path.join(FILES, id), buf);
      await db.query('INSERT INTO files(id, user_id, name, mime, size) VALUES ($1,$2,$3,$4,$5)', [id, uid, 'notion-bilde', r.headers.get('content-type') || 'image/png', buf.length]);
      return `/api/files/${id}`;
    } catch { return url; }
  }
  async function notionBlocks(token, id, uid, depth = 0) {
    const out = []; let cursor;
    do {
      const j = await notion(token, `/blocks/${id}/children?page_size=100${cursor ? '&start_cursor=' + cursor : ''}`);
      for (const b of j.results) {
        const v = b[b.type] || {}, text = rich(v.rich_text);
        const push = x => out.push({ id: rid(), ...x });
        switch (b.type) {
          case 'paragraph': push({ type: 'p', text }); break;
          case 'heading_1': case 'heading_2': case 'heading_3': push({ type: 'h', text }); break;
          case 'bulleted_list_item': case 'numbered_list_item': push({ type: 'li', text }); break;
          case 'to_do': push({ type: 'todo', text, done: !!v.checked }); break;
          case 'quote': push({ type: 'quote', text }); break;
          case 'callout': push({ type: 'callout', icon: v.icon?.emoji || '💡', text }); break;
          case 'code': push({ type: 'callout', icon: '⌨️', text }); break;
          case 'equation': push({ type: 'math', text: v.expression }); break;
          case 'divider': push({ type: 'divider', text: '' }); break;
          case 'toggle': {
            const kids = b.has_children && depth < 2 ? await notionBlocks(token, b.id, uid, depth + 1) : [];
            push({ type: 'toggle', text, body: kids.map(k => k.text).filter(Boolean).join('\n') }); break;
          }
          case 'image': { const u = v.type === 'external' ? v.external.url : v.file?.url; if (u) push({ type: 'image', url: v.type === 'file' ? await storeRemote(u, uid) : u, text: rich(v.caption) }); break; }
          case 'bookmark': case 'link_preview': push({ type: 'p', text: v.url }); break;
          default: if (text) push({ type: 'p', text });
        }
      }
      cursor = j.has_more ? j.next_cursor : null;
    } while (cursor);
    return out;
  }

  const routes = {
    // ----- Deling -----
    'POST /api/shares': async (req, res, uid) => {
      const { pageId, email, role = 'edit' } = await readJson(req);
      const m = await userByEmail(email);
      if (!m) return send(res, 404, { error: 'Fant ingen bruker med den e-posten på serveren. Legg dem til under Personer først.' });
      if (m.id === uid) return send(res, 400, { error: 'Du eier allerede siden' });
      if (!(await workspace(uid)).pages?.[pageId]) return send(res, 404, { error: 'Siden er ikke synket ennå – prøv igjen om et øyeblikk' });
      await db.query('INSERT INTO shares(owner_id, page_id, member_id, role) VALUES ($1,$2,$3,$4) ON CONFLICT (owner_id, page_id, member_id) DO UPDATE SET role=$4', [uid, pageId, m.id, role === 'read' ? 'read' : 'edit']);
      audit(uid, 'page_shared', `${pageId} → ${m.email}`); send(res, 200, { ok: true });
    },
    'POST /api/shares/list': async (req, res, uid) => {
      const { pageId } = await readJson(req);
      send(res, 200, (await db.query('SELECT s.member_id, u.email, s.role FROM shares s JOIN users u ON u.id=s.member_id WHERE owner_id=$1 AND page_id=$2 ORDER BY u.email', [uid, pageId])).rows);
    },
    'POST /api/shares/remove': async (req, res, uid) => {
      const { pageId, memberId } = await readJson(req);
      await db.query('DELETE FROM shares WHERE owner_id=$1 AND page_id=$2 AND member_id=$3', [uid, pageId, memberId]); send(res, 200, { ok: true });
    },
    'GET /api/shared': async (req, res, uid) => {
      const rows = (await db.query('SELECT s.owner_id, s.page_id, s.role, s.created_at, u.email FROM shares s JOIN users u ON u.id=s.owner_id WHERE member_id=$1 ORDER BY s.created_at DESC', [uid])).rows;
      const out = [];
      for (const r of rows) { const p = (await workspace(r.owner_id)).pages?.[r.page_id]; if (p && !p.trashed) out.push({ ownerId: r.owner_id, owner: r.email, pageId: r.page_id, role: r.role, since: r.created_at, page: p }); }
      send(res, 200, out);
    },
    'POST /api/shared/save': async (req, res, uid) => {
      const { ownerId, pageId, page } = await readJson(req);
      const s = (await db.query('SELECT role FROM shares WHERE owner_id=$1 AND page_id=$2 AND member_id=$3', [ownerId, pageId, uid])).rows[0];
      if (!s || s.role !== 'edit') return send(res, 403, { error: 'Du har bare lesetilgang' });
      await saveWs(ownerId, d => { const cur = d.pages?.[pageId]; if (!cur) return d;
        const keep = Object.fromEntries(KEEP.filter(k => k in cur).map(k => [k, cur[k]]));
        const incoming = Object.fromEntries(Object.entries(page || {}).filter(([k]) => !KEEP.includes(k)));
        return { ...d, pages: { ...d.pages, [pageId]: { ...incoming, ...keep, t: Date.now() } } }; });
      send(res, 200, { ok: true });
    },

    // ----- SSO -----
    'GET /api/sso/config': async (req, res) => send(res, 200, { enabled: ssoOn(), name: settings.oidc_name || 'SSO' }),
    'GET /api/sso/start': async (req, res) => {
      if (!ssoOn()) return html(res, 400, 'SSO er ikke satt opp på serveren.');
      const state = new URL(req.url, 'http://x').searchParams.get('state');
      if (!/^[\w-]{16,}$/.test(state || '')) return html(res, 400, 'Ugyldig forespørsel.');
      try {
        const d = await discovery(), verifier = crypto.randomBytes(32).toString('base64url'), nonce = rid();
        pending.set(state, { verifier, nonce, at: Date.now() });
        const u = new URL(d.authorization_endpoint);
        Object.entries({ response_type: 'code', client_id: settings.oidc_client_id, redirect_uri: publicBase(req) + '/api/sso/callback', scope: 'openid email profile', state, nonce,
          code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).forEach(([k, v]) => u.searchParams.set(k, v));
        res.writeHead(302, { Location: u.toString() }); res.end();
      } catch { html(res, 502, 'Fikk ikke kontakt med SSO-leverandøren.'); }
    },
    'GET /api/sso/callback': async (req, res) => {
      const q = new URL(req.url, 'http://x').searchParams, state = q.get('state'), p = pending.get(state);
      if (!p) return html(res, 400, 'Innloggingen har utløpt. Prøv igjen fra appen.');
      if (q.get('error')) { p.error = q.get('error_description') || q.get('error'); return html(res, 400, 'Innloggingen ble avbrutt.'); }
      try {
        const d = await discovery();
        const tr = await fetch(d.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: q.get('code'), redirect_uri: publicBase(req) + '/api/sso/callback', client_id: settings.oidc_client_id, client_secret: settings.oidc_client_secret, code_verifier: p.verifier }) });
        const tok = await tr.json(); if (!tr.ok) throw new Error(tok.error_description || tok.error || 'tokenfeil');
        let claims = JSON.parse(Buffer.from(tok.id_token.split('.')[1], 'base64url').toString());
        if (claims.nonce !== p.nonce || claims.aud !== settings.oidc_client_id && !(Array.isArray(claims.aud) && claims.aud.includes(settings.oidc_client_id))) throw new Error('Ugyldig ID-token');
        if (!claims.email && d.userinfo_endpoint) claims = { ...claims, ...(await (await fetch(d.userinfo_endpoint, { headers: { Authorization: `Bearer ${tok.access_token}` } })).json()) };
        if (!claims.email) throw new Error('SSO-leverandøren sendte ingen e-post');
        let u = await userByEmail(claims.email);
        if (!u) {
          if (settings.oidc_auto_create !== 'true') throw new Error('Ingen konto for ' + claims.email);
          u = (await db.query('INSERT INTO users(email, pw_hash, role) VALUES ($1,$2,$3) RETURNING id, email', [claims.email.toLowerCase(), hash(crypto.randomBytes(24).toString('hex')), 'member'])).rows[0];
        }
        const token = crypto.randomBytes(32).toString('hex');
        await db.query('INSERT INTO sessions(token, user_id, user_agent) VALUES ($1,$2,$3)', [token, u.id, 'SSO · ' + String(req.headers['user-agent'] || '').slice(0, 180)]);
        Object.assign(p, { token, email: u.email }); audit(u.id, 'login_sso', settings.oidc_name || 'SSO');
        html(res, 200, 'Du er logget inn. Gå tilbake til Marg.');
      } catch (e) { p.error = e.message; html(res, 400, e.message); }
    },
    'GET /api/sso/poll': async (req, res) => {
      const state = new URL(req.url, 'http://x').searchParams.get('state'), p = pending.get(state);
      if (!p) return send(res, 404, { error: 'Utløpt' });
      if (p.token || p.error) { pending.delete(state); return send(res, p.error ? 400 : 200, p.error ? { error: p.error } : { token: p.token, email: p.email }); }
      send(res, 202, { waiting: true });
    },

    // ----- Notion-API-import -----
    'POST /api/import/notion': async (req, res, uid) => {
      const { token } = await readJson(req);
      if (!token) return send(res, 400, { error: 'Mangler integrasjonsnøkkel' });
      try {
        const found = []; let cursor;
        do { const j = await notion(token, '/search', { filter: { property: 'object', value: 'page' }, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }); found.push(...j.results); cursor = j.has_more ? j.next_cursor : null; } while (cursor && found.length < 500);
        if (!found.length) return send(res, 404, { error: 'Fant ingen sider. Del sidene med integrasjonen i Notion (··· → Tilkoblinger).' });
        const ids = Object.fromEntries(found.map(p => [p.id, 'p' + rid()])), pages = {}, roots = [];
        for (const p of found) {
          const titleProp = Object.values(p.properties || {}).find(x => x.type === 'title');
          const icon = p.icon?.type === 'emoji' ? p.icon.emoji : 'doc', cover = p.cover?.type === 'external' ? `url("${p.cover.external.url}")` : undefined;
          const parent = p.parent?.type === 'page_id' && ids[p.parent.page_id] ? ids[p.parent.page_id] : null;
          pages[ids[p.id]] = { icon, cover, title: rich(titleProp?.title) || 'Uten tittel', props: [], blocks: await notionBlocks(token, p.id, uid), parent, t: Date.now() };
          if (!pages[ids[p.id]].blocks.length) pages[ids[p.id]].blocks = [{ id: rid(), type: 'p', text: '' }];
          if (!parent) roots.push(ids[p.id]);
        }
        audit(uid, 'import_notion_api', String(found.length)); send(res, 200, { pages, roots });
      } catch (e) { send(res, e.code || 502, { error: e.message }); }
    }
  };
  return { routes, publicKeys: ['GET /api/sso/config', 'GET /api/sso/start', 'GET /api/sso/callback', 'GET /api/sso/poll'] };
}
