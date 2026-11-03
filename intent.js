// Vercel serverless function (Gemini version).
// Env vars: LLM_API_KEY (your Google AI Studio key, required), LLM_MODEL (optional, default below).
// The model only turns text into an intent, or phrases a recap from facts we computed.
// Distances, queues, routes and counts always come from the app's own engine.
const MODEL = process.env.LLM_MODEL || 'gemini-2.5-flash';

async function gemini(system, text, json, maxTokens) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.LLM_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { temperature: 0, maxOutputTokens: maxTokens, ...(json ? { responseMimeType: 'application/json' } : {}) }
    })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j.error || j));
  const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
  return parts.map(p => p.text || '').join('');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const b = req.body || {};
  try {
    if (b.facts) { // recap mode: one friendly sentence from counted facts
      const out = await gemini('You write ONE friendly sentence (max 30 words) recapping cricket action for a fan who stepped away. Use only the facts given. Never add players, scores or events that are not in the facts.', String(b.facts).slice(0, 400), false, 256);
      return res.status(200).json({ recap: out.trim() });
    }
    const text = String(b.text || '').slice(0, 300);
    const out = await gemini('You convert a cricket-stadium fan request (English, Hindi or Hinglish) into JSON only, with no prose. Schema: {"intent":"nearest"|"explain"|"unknown","type":"toilet"|"food"|"aid"|"gate"|null,"stepFree":boolean}. stepFree is true only if the fan mentions a wheelchair, ramp, step-free access, walker, elderly relative or disability. Use "explain" when the fan asks about an umpire signal or decision. Never invent facilities.', text, true, 512);
    const it = JSON.parse(out.match(/\{[\s\S]*\}/)[0]);
    const ok = ['nearest', 'explain', 'unknown'].includes(it.intent);
    res.status(200).json(ok ? { intent: it.intent, type: ['toilet', 'food', 'aid', 'gate'].includes(it.type) ? it.type : null, stepFree: !!it.stepFree } : { intent: 'unknown' });
  } catch (e) {
    console.error('intent error:', e.message); // visible in Vercel > Logs
    res.status(200).json({ intent: 'unknown' }); // app falls back to keyword matching
  }
};
