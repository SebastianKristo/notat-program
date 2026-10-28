// Marg updater: holder git-repoet og Docker-tjenestene oppdatert på forespørsel fra API-et.
// Kjører med Docker-socketen og repoet montert på samme sti som på verten (MARG_DIR).
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';

const DIR = process.env.MARG_DIR || '/opt/marg';
const SERVICES = ['api', 'caddy', 'db', 'backup'];
let job = { running: false, log: '', ok: null, finished: null };

const git = (...a) => execFileSync('git', ['-C', DIR, ...a], { encoding: 'utf8' }).trim();
const run = (cmd, args, cwd) => new Promise((ok, fail) => {
  const p = spawn(cmd, args, { cwd });
  const add = d => { job.log = (job.log + d).slice(-20000); };
  p.stdout.on('data', add); p.stderr.on('data', add);
  p.on('close', c => c === 0 ? ok() : fail(new Error(`${cmd} avsluttet med ${c}`)));
});

async function update() {
  job = { running: true, log: '', ok: null, finished: null };
  try {
    await run('git', ['-C', DIR, 'pull', '--ff-only']);
    await run('docker', ['run', '--rm', '-v', `${DIR}:/app`, '-w', '/app', 'node:22-alpine', 'sh', '-c', 'npm ci --no-audit --no-fund && npm run build']);
    await run('docker', ['compose', 'up', '-d', '--build', ...SERVICES], `${DIR}/server`);
    job.ok = true;
  } catch (e) { job.log += '\n' + e.message; job.ok = false; }
  job.running = false; job.finished = new Date().toISOString();
}

const send = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
http.createServer((req, res) => {
  if (req.url === '/status') {
    let st = {};
    try {
      execFileSync('git', ['-C', DIR, 'fetch', '-q'], { timeout: 20000 });
      const cur = git('rev-parse', 'HEAD'), up = git('rev-parse', '@{u}');
      st = { current: cur.slice(0, 7), latest: up.slice(0, 7), date: git('log', '-1', '--format=%cI'), behind: +git('rev-list', '--count', 'HEAD..@{u}'),
        changes: cur === up ? [] : git('log', '--format=%s', 'HEAD..@{u}').split('\n').slice(0, 10) };
    } catch (e) { st = { error: 'Fikk ikke sjekket git: ' + e.message.split('\n')[0] }; }
    return send(res, 200, { ...st, job });
  }
  if (req.url === '/update' && req.method === 'POST') {
    if (job.running) return send(res, 409, { error: 'Oppdatering pågår allerede' });
    update();
    return send(res, 202, { started: true });
  }
  send(res, 404, {});
}).listen(8080, () => console.log('Marg updater på :8080'));
