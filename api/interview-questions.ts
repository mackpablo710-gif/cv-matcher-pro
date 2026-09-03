import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

const MODELS = ['gemini-flash-latest', 'gemini-2.0-flash-lite', 'gemini-2.0-flash'];

function safeParseJSON(text: string) {
  try { return JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim() || '{}'); }
  catch { return {}; }
}

async function callModel(ai: GoogleGenAI, model: string, contents: string, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('aborted'));
    const abort = () => reject(new Error('aborted'));
    signal.addEventListener('abort', abort, { once: true });
    ai.models.generateContent({
      model,
      contents,
      config: { responseMimeType: 'application/json', temperature: 0.4, maxOutputTokens: 1800 },
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
        new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 28000)),
      ]);
      p.then(text => {
        if (!controller.signal.aborted) { controller.abort(); resolve(text); }
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
    if (!cvText || !jdText) return res.status(400).json({ error: 'Missing params' });
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const text = await raceModels(ai,
      `Genera 9 preguntas de entrevista específicas. Responde SOLO JSON válido:
{"questions":[{"tipo":"tecnica","pregunta":"","tip":""},{"tipo":"tecnica","pregunta":"","tip":""},{"tipo":"tecnica","pregunta":"","tip":""},{"tipo":"conductual","pregunta":"","tip":""},{"tipo":"conductual","pregunta":"","tip":""},{"tipo":"conductual","pregunta":"","tip":""},{"tipo":"cargo","pregunta":"","tip":""},{"tipo":"cargo","pregunta":"","tip":""},{"tipo":"cargo","pregunta":"","tip":""}]}
3 técnicas (skills de la JD), 3 conductuales (STAR), 3 del cargo. tip: 1 oración basada en el CV. Español con tildes.

CV: ${cvText}
JD: ${jdText}`
    );
    const parsed = safeParseJSON(text);
    res.json({ questions: Array.isArray(parsed?.questions) ? parsed.questions : [] });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error desconocido' });
  }
}
