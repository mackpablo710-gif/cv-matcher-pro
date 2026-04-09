import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

const MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash-lite'];

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  const delays = [2000, 5000, 10000, 15000];
  let lastError: any;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try { return await fn(); }
    catch (err: any) {
      lastError = err;
      const msg: string = err?.message || '';
      const retry = msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand') || msg.includes('Please retry');
      if (!retry || attempt === maxAttempts - 1) throw err;
      await new Promise(r => setTimeout(r, delays[attempt]));
    }
  }
  throw lastError;
}

function safeParseJSON(text: string) {
  try { return JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim() || '{}'); }
  catch { throw new Error('Respuesta de Gemini no válida.'); }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { cvText, jdText, language } = req.body;
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    let text = '';
    for (const model of MODELS) {
      try {
        const r = await withRetry(() => ai.models.generateContent({
          model,
          contents: `Eres un experto en optimización de CVs para ATS.\n\nIDIOMA DE SALIDA: ${language}\n\nOBJETIVO: Mejorar el CV para aumentar el match con la Job Description SIN inventar información.\n\nREGLAS:\n1. NO inventes experiencia, empresas, fechas ni logros.\n2. Mejora la redacción para hacerla más profesional y estratégica.\n3. Incorpora lenguaje y términos de la Job Description donde sea natural.\n4. NO uses markdown (**, *, etc). Solo texto plano.\n5. USA SIEMPRE tildes y caracteres especiales correctos del español (á,é,í,ó,ú,ñ,ü). Nunca omitas tildes.\n6. match_score_adapted debe ser HONESTO y REALISTA. No lo infles artificialmente. Solo sube si hay mejoras concretas y verificables en keywords y redacción. La mejora típica es de 5 a 15 puntos sobre el score original. Si el perfil no calza bien con el cargo, el score adaptado puede ser similar al original.\n\nCV ORIGINAL:\n${cvText}\n\nJOB DESCRIPTION:\n${jdText}\n\nResponde SOLO este JSON:\n{\n  "cv_adaptado": {\n    "personal_info": { "name": "", "email": "", "phone": "", "location": "", "summary": "" },\n    "experience": [{ "company": "", "position": "", "period": "", "description": [] }],\n    "education": [{ "institution": "", "degree": "", "period": "", "description": [] }],\n    "skills": { "technical": [], "soft": [] },\n    "others": { "languages": "", "tools": "", "additional": "" }\n  },\n  "analisis": {\n    "match_score_original": 0,\n    "match_score_adapted": 0,\n    "summary_adapted": "",\n    "keywords_usadas": [],\n    "missing_keywords": []\n  }\n}`,
          config: { responseMimeType: 'application/json', temperature: 0.3 },
        }));
        text = r.text || ''; break;
      } catch (err: any) {
        const msg = err?.message || '';
        if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('NOT_FOUND') || msg.includes('quota')) continue;
        throw err;
      }
    }
    res.json(safeParseJSON(text));
  } catch (err: any) {
    const msg = err?.message || '';
    res.status(msg.includes('503') || msg.includes('UNAVAILABLE') ? 503 : 500)
       .json({ error: msg.includes('503') || msg.includes('UNAVAILABLE') ? 'Gemini está muy ocupado. Por favor intenta de nuevo en unos segundos.' : msg });
  }
}
