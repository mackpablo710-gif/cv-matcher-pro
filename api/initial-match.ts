import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

const MODELS = ['gemini-flash-latest', 'gemini-2.0-flash-lite', 'gemini-2.0-flash'];
const MODEL_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('MODEL_TIMEOUT')), ms)),
  ]);
}

function safeParseJSON(text: string) {
  try { return JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim() || '{}'); }
  catch { throw new Error('Respuesta de Gemini no válida.'); }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { cvText, jdText } = req.body;
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    let text = '';
    for (const model of MODELS) {
      try {
        const r = await withTimeout(
          ai.models.generateContent({
            model,
            contents: `Analiza la coincidencia entre el CV y la Job Description.\n\nCV:\n${cvText}\n\nJob Description:\n${jdText}\n\nDevuelve SOLO un JSON válido con esta estructura exacta:\n{\n  "score": 0,\n  "job_title": "",\n  "company_name": "",\n  "summary": "",\n  "key_matches": [],\n  "key_gaps": []\n}\n\nReglas:\n1. score: número entero 0-100, sé riguroso y realista\n2. job_title: extrae el título del cargo de la Job Description (máx 60 caracteres)\n3. company_name: extrae el nombre de la empresa de la Job Description. Si no está mencionada explícitamente, devuelve string vacío ""\n4. key_matches y key_gaps: arrays de strings (máx 6 items cada uno)\n5. summary: texto breve y claro en español con tildes correctas (á,é,í,ó,ú,ñ)\n6. USA SIEMPRE tildes y caracteres especiales correctos del español\n7. No uses markdown, solo JSON`,
            config: { responseMimeType: 'application/json', temperature: 0.2 },
          }),
          MODEL_TIMEOUT_MS,
        );
        text = r.text || ''; break;
      } catch (err: any) {
        const msg = err?.message || '';
        if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('NOT_FOUND') || msg.includes('quota') || msg.includes('MODEL_TIMEOUT')) continue;
        throw err;
      }
    }
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
    const msg = err?.message || '';
    res.status(msg.includes('503') || msg.includes('UNAVAILABLE') ? 503 : 500)
       .json({ error: msg.includes('503') || msg.includes('UNAVAILABLE') ? 'Gemini está muy ocupado. Por favor intenta de nuevo en unos segundos.' : msg });
  }
}
