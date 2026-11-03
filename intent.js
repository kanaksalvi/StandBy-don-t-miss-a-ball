// Vercel serverless function. Env vars: LLM_API_KEY (required), LLM_MODEL (optional).
// The model only turns text into an intent, or phrases a recap from facts we computed. It never invents routes or queues.
const call = async (system, content, max) => {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': process.env.LLM_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: process.env.LLM_MODEL || 'claude-haiku-5-5', max_tokens: max, system, messages: [{ role: 'user', content }] })
    });
    const j = await r.json();
    return (j.content || []).map(c => c.text || '').join('');
};
module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).end();
    const b = req.body || {};
    try {
        if (b.facts) { // recap mode
            const out = await call('You write ONE friendly sentence (max 30 words) recapping cricket action for a fan who stepped away. Use only the facts given. Never add players, scores or events that are not in the facts.', String(b.facts).slice(0, 400), 80);
            return res.status(200).json({ recap: out.trim() });
        }
        const text = String(b.text || '').slice(0, 300);
        const out = await call('You convert a cricket-stadium fan request (English, Hindi or Hinglish) into JSON only, with no prose. Schema: {"intent":"nearest"|"explain"|"unknown","type":"toilet"|"food"|"aid"|"gate"|null,"stepFree":boolean}. stepFree is true only if the fan mentions a wheelchair, ramp, step-free access, walker, elderly relative or disability. Use "explain" when the fan asks about an umpire signal or decision. Never invent facilities.', text, 120);
        const it = JSON.parse(out.match(/\{[\s\S]*\}/)[0]);
        const ok = ['nearest', 'explain', 'unknown'].includes(it.intent);
        res.status(200).json(ok ? { intent: it.intent, type: ['toilet', 'food', 'aid', 'gate'].includes(it.type) ? it.type : null, stepFree: !!it.stepFree } : { intent: 'unknown' });
    } catch (e) { res.status(200).json({ intent: 'unknown' }); }
};