import Anthropic from '@anthropic-ai/sdk';

// USD per million tokens (inn, ut) for budsjettestimat. Ukjente modeller regnes som Opus.
const CLAUDE_PRICE = { opus: [4, 20], sonnet: [2, 10], haiku: [0.1, 0.5], fable: [10, 50] };
const USD_NOK = 10.5;
const SYSTEM = 'Du er Marg, en hjelpsom assistent i en notatapp. Svar kort og på norsk.';
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';

const on = v => v === 'true';
const price = model => CLAUDE_PRICE[Object.keys(CLAUDE_PRICE).find(k => model.includes(k)) || 'opus'];
const month = () => new Date().toISOString().slice(0, 7);
class AIError extends Error { constructor(msg, code = 502) { super(msg); this.code = code; } }

export function createAI({ db, settings }) {
  const ollamaUrl = () => settings.ollama_url.replace(/\/$/, '');
  const claude = () => new Anthropic({ apiKey: settings.claude_key });

  const usage = async () => +((await db.query('SELECT coalesce(sum(cost_nok),0) n FROM ai_usage WHERE month=$1 AND provider=$2', [month(), 'claude'])).rows[0].n);

  const listOllama = async () => {
    if (!on(settings.ollama_enabled) || !ollamaUrl()) return [];
    const r = await fetch(ollamaUrl() + '/api/tags', { signal: AbortSignal.timeout(4000) });
    return ((await r.json()).models || []).map(m => m.name).filter(n => !/embed/.test(n));
  };
  const listGemini = async () => {
    if (!on(settings.gemini_enabled) || !settings.gemini_key) return [];
    const r = await fetch(`${GEMINI}/models?key=${encodeURIComponent(settings.gemini_key)}&pageSize=200`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new AIError('Gemini: ' + ((await r.json().catch(() => ({}))).error?.message || r.status));
    return ((await r.json()).models || []).filter(m => m.supportedGenerationMethods?.includes('generateContent') && /^models\/gemini/.test(m.name)).map(m => m.name.slice(7));
  };
  const listClaude = async () => {
    if (!on(settings.claude_enabled) || !settings.claude_key) return [];
    const ids = [];
    try { for await (const m of claude().models.list()) ids.push(m.id); }
    catch (e) { throw new AIError(e instanceof Anthropic.AuthenticationError ? 'Claude: ugyldig API-nøkkel' : `Claude: ${e.message}`); }
    return ids;
  };

  // Alle modeller som "leverandør:modell"
  async function models() {
    const out = [], errors = {};
    for (const [p, f] of [['ollama', listOllama], ['gemini', listGemini], ['claude', listClaude]]) {
      try { out.push(...(await f()).map(m => `${p}:${m}`)); } catch (e) { errors[p] = e.message; }
    }
    return { models: out, errors };
  }

  async function test(provider) {
    const list = { ollama: listOllama, gemini: listGemini, claude: listClaude }[provider];
    const m = await list();
    if (!m.length) throw new AIError('Ingen modeller funnet');
    return { ok: true, models: m.length };
  }

  // --- strømming per leverandør; write(text) kalles for hver bit ---
  async function* ollamaStream(model, system, prompt) {
    if (!ollamaUrl()) throw new AIError('Ollama er ikke satt opp', 503);
    const r = await fetch(ollamaUrl() + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, system, prompt, stream: true }) });
    if (!r.ok) throw new AIError('Ollama: ' + (await r.text()));
    const dec = new TextDecoder(); let buf = '';
    for await (const chunk of r.body) {
      buf += dec.decode(chunk, { stream: true });
      let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.trim()) try { yield JSON.parse(line).response || ''; } catch {} }
    }
  }

  async function* geminiStream(model, system, prompt) {
    const r = await fetch(`${GEMINI}/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(settings.gemini_key)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }] }) });
    if (r.status === 429) throw new AIError('Gemini: grensen for gratis nivå er nådd (per minutt eller døgn)', 429);
    if (!r.ok) throw new AIError('Gemini: ' + ((await r.json().catch(() => ({}))).error?.message || r.status));
    const dec = new TextDecoder(); let buf = '';
    for await (const chunk of r.body) {
      buf += dec.decode(chunk, { stream: true });
      let i; while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (line.startsWith('data:')) try { yield (JSON.parse(line.slice(5)).candidates?.[0]?.content?.parts || []).map(p => p.text || '').join(''); } catch {}
      }
    }
  }

  async function* claudeStream(model, system, prompt) {
    const budget = +settings.claude_budget;
    if (budget > 0 && (await usage()) >= budget) throw new AIError(`Claude: månedsbudsjettet på ${budget} kr er brukt opp`, 402);
    const stream = claude().beta.messages.stream({
      model, max_tokens: 16000, system,
      messages: [{ role: 'user', content: prompt }],
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default'
    });
    try {
      for await (const ev of stream) if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') yield ev.delta.text;
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new AIError('Claude: ugyldig API-nøkkel', 401);
      if (e instanceof Anthropic.RateLimitError) throw new AIError('Claude: for mange forespørsler, prøv igjen snart', 429);
      if (e instanceof Anthropic.APIError) throw new AIError(`Claude: ${e.message}`, e.status || 502);
      throw e;
    }
    const msg = await stream.finalMessage();
    const [pin, pout] = price(model), u = msg.usage || {};
    const cost = ((u.input_tokens || 0) * pin + (u.output_tokens || 0) * pout) / 1e6 * USD_NOK;
    await db.query('INSERT INTO ai_usage(month, provider, cost_nok) VALUES ($1,$2,$3)', [month(), 'claude', cost]);
    if (msg.stop_reason === 'refusal') yield '\n\n(Claude avslo forespørselen.)';
  }

  const streams = { ollama: ollamaStream, gemini: geminiStream, claude: claudeStream };

  // Velger leverandør og modell, med reserve til Ollama hvis en skytjeneste feiler.
  async function run({ model, prompt, context = {} }, write) {
    let [provider, ...rest] = (model || settings.default_model || '').split(':'); let name = rest.join(':');
    if (!streams[provider]) { provider = 'ollama'; name = ''; }
    const notes = [];
    if (provider !== 'ollama' && context.private && on(settings.private_local)) { notes.push('Privat side – bruker lokal Ollama.'); provider = 'ollama'; name = ''; }
    if (!on(settings[provider + '_enabled'])) { notes.push(`${provider} er slått av – bruker Ollama.`); provider = 'ollama'; name = ''; }
    if (provider === 'ollama') {
      const avail = await listOllama().catch(() => []);
      if (!name || (avail.length && !avail.includes(name))) {
        const def = settings.default_model.startsWith('ollama:') ? settings.default_model.slice(7) : '';
        name = avail.includes(def) ? def : avail[0] || name || 'llama3.1:8b';
      }
    } else if (!name) name = settings[provider + '_model'];
    const system = SYSTEM + (context.text ? `\n\nSiden brukeren har åpen:\n"""\n${String(context.text).slice(0, 30000)}\n"""` : '');

    const go = async (p, m) => { let any = false; for await (const t of streams[p](m, system, prompt)) { if (t) { any = true; write(t); } } return any; };
    if (notes.length) write(notes.join(' ') + '\n\n');
    try { await go(provider, name); return { provider, model: name }; }
    catch (e) {
      if (provider === 'ollama' || settings.fallback !== 'ollama' || !on(settings.ollama_enabled)) throw e;
      write(`(${e.message.replace(/\.$/, "")}. Bruker Ollama i stedet.)\n\n`);
      const m = (await listOllama().catch(() => []))[0] || 'llama3.1:8b';
      await go('ollama', m); return { provider: 'ollama', model: m, fallback: true };
    }
  }

  return { models, test, run, usage, AIError };
}
