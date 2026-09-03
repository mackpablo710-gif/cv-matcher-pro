import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

const MODELS = ['gemini-flash-latest', 'gemini-2.0-flash-lite', 'gemini-2.0-flash'];

function safeParseJSON(text: string) {
  try { return JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim() || '{}'); }
  catch { return {}; }
}

async function callModel(ai: GoogleGenAI, model: string, contents: string, signal: AbortSignal): Promise<string> {
  const timeoutId = setTimeout(() => {}, 0); // keep reference
  clearTimeout(timeoutId);
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('aborted'));
    const abort = () => reject(new Error('aborted'));
    signal.addEventListener('abort', abort, { once: true });
    ai.models.generateContent({
      model,
      contents,
      config: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 600 },
    })
      .then(r => { signal.removeEventListener('abort', abort); if (!signal.aborted && r.text) resolve(r.text); else reject(new Error('empty')); })
      .catch(err => { signal.removeEventListener('abort', abort); reject(err); });
  });
}

async function raceModels(ai: GoogleGenAI, contents: string): Promise<string> {
  const controller = new AbortController();
  return new Promise((resolve, reject) => {
    let failures = 0;
    for (const model of MODELS) {
      const p = Promise.race([
        callModel(ai, model, contents, controller.signal),
        new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 22000)),
      ]);
      p.then(text => {
        if (!controller.signal.aborted) {
          controller.abort();
          resolve(text);
        }
      }).catch(() => {
        failures++;
        if (failures === MODELS.length) reject(new Error('All models failed'));
      });
    }
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { cvText, jdText } = req.body;
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const text = await raceModels(ai,
      `Compara el CV con la JD. Devuelve SOLO este JSON en español con tildes:
{"score":0,"job_title":"","company_name":"","summary":"","key_matches":[],"key_gaps":[]}
score: entero 0-100 realista. key_matches/key_gaps: máx 5 items cada uno. summary: 1-2 oraciones. Sin markdown.

CV:
${cvText}

JD:
${jdText}`
    );
    const parsed = safeParseJSON(text);
    res.json({
      score: Math.max(0, Math.min(100, Math.round(Number(parsed?.score ?? 0)))),
      job_title: parsed?.job_title || '',
      company_name: parsed?.company_name || '',
      summary: parsed?.summary || '',
      key_matches: Array.isArray(parsed?.key_matches) ? parsed.key_matches : [],
      key_gaps: Array.isArray(parsed?.key_gaps) ? parsed.key_gaps : [],
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error desconocido' });
  }
}
