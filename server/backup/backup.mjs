// Marg backup: sikkerhetskopi av databasen til en SMB-deling, planlagt og manuelt, med gjenoppretting.
// Innstillingene (server, bruker, passord, tidsplan …) leses fra settings-tabellen som appen skriver til.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import pg from 'pg';
import { encrypt, decrypt } from '../secret.js';

const DB_URL = process.env.DATABASE_URL;
const FILES = process.env.FILES_DIR || '/data/files';
const db = new pg.Pool({ connectionString: DB_URL });
const SECRET = new Set(['smb_pass', 'bk_key']);
const NAME = /^marg-(\d{8})-(\d{6})(-manuell)?\.marg-backup$/;
let job = { running: false, kind: null, pct: null, step: '', error: null, finished: null };

async function cfg() {
  const c = {};
  for (const r of (await db.query("SELECT key, value FROM settings WHERE key LIKE 'smb_%' OR key LIKE 'bk_%'")).rows) c[r.key] = SECRET.has(r.key) ? decrypt(r.value) : r.value;
  return { smb_path: 'marg', smb_domain: 'WORKGROUP', smb_version: 'SMB3', bk_schedule: 'nightly', bk_keep: '30', bk_encrypt: 'true', ...c };
}
const sh = (cmd, args, opts = {}) => new Promise((ok, fail) => {
  const p = spawn(cmd, args, { env: { ...process.env, ...opts.env } });
  let out = '', err = '';
  p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
  p.on('close', code => code === 0 ? ok(out) : fail(new Error((err || out).trim().split('\n').slice(-3).join(' ') || `${cmd} feilet (${code})`)));
});

// smbclient med passord i miljøet, ikke på kommandolinjen
const smb = (c, commands) => {
  if (!c.smb_host) throw new Error('SMB-server er ikke satt opp');
  return sh('smbclient', [c.smb_host, '-U', c.smb_user || 'guest', '-W', c.smb_domain || 'WORKGROUP', '-m', c.smb_version || 'SMB3', '-c', commands], { env: { PASSWD: c.smb_pass || '' } });
};
const q = s => '"' + String(s).replace(/"/g, '') + '"';
const dir = c => (c.smb_path || '').replace(/^[\\/]+|[\\/]+$/g, '');
const cd = c => dir(c) ? `cd ${q(dir(c))}; ` : '';

async function list(c) {
  const out = await smb(c, `${cd(c)}ls marg-*.marg-backup`).catch(e => { if (/NO_SUCH_FILE|not found/i.test(e.message)) return ''; throw e; });
  return out.split('\n').map(l => l.trim().match(/^(marg-\S+\.marg-backup)\s+\S*\s+(\d+)/)).filter(Boolean)
    .map(([, name, size]) => { const [, d, t, man] = name.match(NAME) || []; return d && { name, size: +size, manual: !!man, date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4)}Z` }; })
    .filter(Boolean).sort((a, b) => b.date.localeCompare(a.date));
}

async function test() {
  const c = await cfg();
  if (dir(c)) await smb(c, `mkdir ${q(dir(c))}`).catch(() => {});
  const tmp = path.join(os.tmpdir(), 'marg-test.txt'); fs.writeFileSync(tmp, 'Marg skrivetest\n');
  await smb(c, `${cd(c)}put ${tmp} .marg-skrivetest; del .marg-skrivetest`);
  const du = await smb(c, 'du').catch(() => '');
  const m = du.match(/(\d+) blocks of size (\d+)\. (\d+) blocks available/);
  return { ok: true, free: m ? +m[3] * +m[2] : null };
}

async function backup(manual) {
  const c = await cfg();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'marg-bk-'));
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const name = `marg-${stamp}${manual ? '-manuell' : ''}.marg-backup`;
  try {
    job.step = 'Eksporterer database'; job.pct = 10;
    await sh('pg_dump', ['-Fc', '-f', path.join(work, 'db.dump'), DB_URL]);
    // Sidene som JSON i tillegg, så enkeltsider kan hentes ut uten full gjenoppretting
    fs.writeFileSync(path.join(work, 'workspaces.json'), await sh('psql', ['-At', DB_URL, '-c', "SELECT coalesce(json_agg(json_build_object('email', u.email, 'data', w.data)), '[]') FROM workspaces w JOIN users u ON u.id = w.user_id"]));
    fs.mkdirSync(FILES, { recursive: true });
    fs.writeFileSync(path.join(work, 'manifest.json'), JSON.stringify({ app: 'marg', format: 1, created: new Date().toISOString(), manual, encrypted: c.bk_encrypt === 'true' }, null, 2));
    job.step = 'Pakker'; job.pct = 40;
    let file = path.join(work, name);
    await sh('tar', ['--zstd', '-cf', file, '-C', work, 'db.dump', 'manifest.json', 'workspaces.json', `--transform=s,^${path.basename(FILES)},files,`, '-C', path.dirname(FILES), path.basename(FILES)]);
    if (c.bk_encrypt === 'true') {
      let key = c.bk_key;
      if (!key) {
        key = crypto.randomBytes(24).toString('base64url');
        await db.query('INSERT INTO settings(key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2', ['bk_key', encrypt(key)]);
      }
      job.step = 'Krypterer (AES-256)'; job.pct = 55;
      await sh('openssl', ['enc', '-aes-256-cbc', '-pbkdf2', '-salt', '-in', file, '-out', file + '.enc', '-pass', 'env:BKKEY'], { env: { BKKEY: key } });
      fs.renameSync(file + '.enc', file);
    }
    job.step = 'Laster opp til ' + c.smb_host; job.pct = 70;
    if (dir(c)) await smb(c, `mkdir ${q(dir(c))}`).catch(() => {});
    await smb(c, `${cd(c)}put ${file} ${name}`);
    job.step = 'Rydder gamle kopier'; job.pct = 90;
    const keep = +c.bk_keep;
    if (keep > 0) for (const b of await list(c)) if (Date.now() - new Date(b.date) > keep * 864e5) await smb(c, `${cd(c)}del ${b.name}`).catch(() => {});
    await db.query("INSERT INTO audit_log(action, detail) VALUES ('backup', $1)", [name]).catch(() => {});
    return name;
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
}

// Henter (eller tar imot) en kopi, dekrypterer og pakker ut. Returnerer arbeidsmappen.
async function unpack(c, { name, buffer }) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'marg-rs-')), file = path.join(work, 'kopi.marg-backup');
  if (buffer) fs.writeFileSync(file, buffer);
  else { if (!NAME.test(name)) throw new Error('Ugyldig filnavn'); job.step = 'Laster ned ' + name; job.pct = 15; await smb(c, `${cd(c)}get ${name} ${file}`); }
  if (fs.readFileSync(file).subarray(0, 8).toString('latin1').startsWith('Salted__')) {
    if (!c.bk_key) throw new Error('Kopien er kryptert, men nøkkelen mangler');
    job.step = 'Dekrypterer'; job.pct = 35;
    await sh('openssl', ['enc', '-d', '-aes-256-cbc', '-pbkdf2', '-in', file, '-out', file + '.tar', '-pass', 'env:BKKEY'], { env: { BKKEY: c.bk_key } })
      .catch(() => { throw new Error('Kunne ikke dekryptere – feil nøkkel?'); });
    fs.renameSync(file + '.tar', file);
  }
  job.step = 'Pakker ut'; job.pct = 50;
  await sh('tar', ['--zstd', '-xf', file, '-C', work]);
  if (!fs.existsSync(path.join(work, 'db.dump'))) throw new Error('Filen er ikke en Marg-sikkerhetskopi');
  return work;
}

async function restore(src) {
  const c = await cfg(), work = await unpack(c, src);
  try {
    job.step = 'Gjenoppretter database'; job.pct = 70;
    await sh('pg_restore', ['--clean', '--if-exists', '--no-owner', '-d', DB_URL, path.join(work, 'db.dump')]);
    if (fs.existsSync(path.join(work, 'files'))) { job.step = 'Gjenoppretter filer'; job.pct = 85; fs.cpSync(path.join(work, 'files'), FILES, { recursive: true }); }
    // Behold SMB-oppsettet og nøkkelen som gjorde gjenopprettingen mulig
    for (const [k, v] of Object.entries(c)) if (/^(smb_|bk_)/.test(k) && v) await db.query('INSERT INTO settings(key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2', [k, SECRET.has(k) ? encrypt(v) : v]);
    await db.query("INSERT INTO audit_log(action, detail) VALUES ('restore', $1)", [src.name || 'opplastet fil']).catch(() => {});
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
}

// Sidene i en kopi for én bruker (for å gjenopprette enkeltsider)
async function pagesIn(name, email) {
  const c = await cfg(), work = await unpack(c, { name });
  try {
    const f = path.join(work, 'workspaces.json');
    if (!fs.existsSync(f)) throw new Error('Denne kopien er for gammel til å hente enkeltsider fra');
    const ws = JSON.parse(fs.readFileSync(f, 'utf8') || '[]').find(w => w.email === email);
    return Object.entries(ws?.data?.pages || {}).map(([id, p]) => ({ id, page: p }));
  } finally { fs.rmSync(work, { recursive: true, force: true }); job.step = ''; job.pct = null; }
}

function start(kind, fn) {
  if (job.running) return false;
  job = { running: true, kind, pct: 0, step: 'Starter', error: null, finished: null };
  fn().then(r => { job.result = r; }).catch(e => { job.error = e.message; })
    .finally(() => { job.running = false; job.pct = null; job.step = ''; job.finished = new Date().toISOString(); });
  return true;
}

// Planlagt backup: sjekkes hvert minutt
let lastRun = '';
setInterval(async () => {
  try {
    const c = await cfg(), d = new Date(), key = d.toISOString().slice(0, 13);
    if (!c.smb_host || lastRun === key || d.getUTCMinutes() !== 0) return;
    const due = { hourly: true, nightly: d.getUTCHours() === 3, weekly: d.getUTCDay() === 0 && d.getUTCHours() === 3 }[c.bk_schedule];
    if (due) { lastRun = key; start('backup', () => backup(false)); }
  } catch {}
}, 60000);

const send = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const body = req => new Promise(ok => { let s = ''; req.on('data', d => s += d); req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch { ok({}); } }); });

http.createServer(async (req, res) => {
  try {
    if (req.url === '/status') return send(res, 200, job);
    if (req.url === '/list') return send(res, 200, await list(await cfg()));
    if (req.url === '/test' && req.method === 'POST') return send(res, 200, await test());
    if (req.url === '/run' && req.method === 'POST') return start('backup', () => backup(true)) ? send(res, 202, { started: true }) : send(res, 409, { error: 'En jobb pågår allerede' });
    if (req.url === '/restore' && req.method === 'POST') { const { name } = await body(req); return start('restore', () => restore({ name })) ? send(res, 202, { started: true }) : send(res, 409, { error: 'En jobb pågår allerede' }); }
    if (req.url === '/restore-upload' && req.method === 'POST') {
      if (job.running) return send(res, 409, { error: 'En jobb pågår allerede' });
      const chunks = []; for await (const ch of req) chunks.push(ch);
      return start('restore', () => restore({ buffer: Buffer.concat(chunks) })) ? send(res, 202, { started: true }) : send(res, 409, { error: 'En jobb pågår allerede' });
    }
    if (req.url === '/pages' && req.method === 'POST') { const { name, email } = await body(req); return send(res, 200, await pagesIn(name, email)); }
    send(res, 404, {});
  } catch (e) { send(res, 200, { ok: false, error: e.message }); }
}).listen(8090, () => console.log('Marg backup på :8090'));
