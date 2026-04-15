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
          contents: `Eres un experto en optimización de CVs para ATS.\n\nIDIOMA DE SALIDA: ${language}\n\nOBJETIVO: Mejorar la presentación del CV para aumentar su match con la Job Description, SIN inventar ni agregar información que no esté en el CV original.\n\nREGLAS ESTRICTAS:\n1. NO inventes experiencia, empresas, fechas, logros ni cifras que no estén en el CV.\n2. SKILLS: solo incluye habilidades que ya existan en el CV original o que estén evidentemente implícitas en la experiencia descrita. NO agregues tecnologías, herramientas ni certificaciones de la JD si no aparecen en el CV. Si la JD pide algo que el candidato no tiene, ponlo en missing_keywords, NO en el CV.\n3. Mejora la redacción para hacerla más profesional, concisa y orientada a resultados.\n4. Incorpora el lenguaje y terminología de la JD donde sea HONESTAMENTE aplicable a la experiencia real del candidato.\n5. NO uses markdown (**, *, etc). Solo texto plano.\n6. USA SIEMPRE tildes y caracteres especiales correctos del español (á,é,í,ó,ú,ñ,ü). Nunca omitas tildes.\n7. match_score_adapted debe ser al menos 2 puntos mayor que match_score_original cuando hay mejoras reales posibles.\n8. Si el candidato no cumple requisitos OBLIGATORIOS que hacen imposible mejorar más de 1 punto: pon cannot_improve: true y lista los requisitos en missing_mandatory.\n\nCV ORIGINAL:\n${cvText}\n\nJOB DESCRIPTION:\n${jdText}\n\nResponde SOLO este JSON:\n{\n  "cv_adaptado": {\n    "personal_info": { "name": "", "email": "", "phone": "", "location": "", "summary": "" },\n    "experience": [{ "company": "", "position": "", "period": "", "description": [] }],\n    "education": [{ "institution": "", "degree": "", "period": "", "description": [] }],\n    "skills": { "technical": [], "soft": [] },\n    "others": { "languages": "", "tools": "", "additional": "" }\n  },\n  "analisis": {\n    "match_score_original": 0,\n    "match_score_adapted": 0,\n    "summary_adapted": "",\n    "keywords_usadas": [],\n    "missing_keywords": [],\n    "cannot_improve": false,\n    "missing_mandatory": []\n  }\n}`,
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
