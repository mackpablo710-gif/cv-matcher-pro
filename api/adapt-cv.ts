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
          contents: `Eres un experto en optimización de CVs para ATS y reclutamiento.\n\nIDIOMA DE SALIDA: ${language}\n\nOBJETIVO: Maximizar el match del CV con la Job Description mediante dos estrategias combinadas:\nA) Mejorar la redacción y lenguaje para alinearlos con la JD.\nB) Enriquecer el CV con contenido inferible y razonable basado en la experiencia real del candidato.\n\nREGLAS:\n1. NUNCA inventes empresas, cargos, fechas, títulos académicos ni cifras que no estén en el CV.\n2. SÍ PUEDES agregar al resumen, responsabilidades o skills, frases y keywords que sean razonablemente inferibles de la experiencia descrita. Ejemplos válidos: si fue Jefe de Proyectos → puede inferirse liderazgo de equipos, coordinación con stakeholders, gestión de riesgos; si trabajó en ventas B2B → puede inferirse CRM, negociación, prospección.\n3. TODO contenido que no estaba LITERALMENTE en el CV original debe incluirse en "sugerencias_revision" para que el candidato lo revise. Sé específico: indica la sección y el texto exacto agregado.\n4. Incorpora terminología y keywords de la JD donde apliquen honestamente a la experiencia real.\n5. Mejora la redacción para que sea más profesional, concisa y orientada a resultados.\n6. NO uses markdown (**, *, #). Solo texto plano.\n7. USA tildes y caracteres especiales correctos (á,é,í,ó,ú,ñ,ü). Nunca omitas tildes.\n8. match_score_adapted debe reflejar la mejora real lograda. Sé ambicioso pero honesto.\n9. Si hay requisitos OBLIGATORIOS de la JD que el candidato definitivamente no cumple: pon cannot_improve: true y lista esos requisitos en missing_mandatory.\n\nCV ORIGINAL:\n${cvText}\n\nJOB DESCRIPTION:\n${jdText}\n\nResponde SOLO este JSON:\n{\n  "cv_adaptado": {\n    "personal_info": { "name": "", "email": "", "phone": "", "location": "", "summary": "" },\n    "experience": [{ "company": "", "position": "", "period": "", "description": [] }],\n    "education": [{ "institution": "", "degree": "", "period": "", "description": [] }],\n    "skills": { "technical": [], "soft": [] },\n    "others": { "languages": "", "tools": "", "additional": "" }\n  },\n  "analisis": {\n    "match_score_original": 0,\n    "match_score_adapted": 0,\n    "summary_adapted": "",\n    "keywords_usadas": [],\n    "missing_keywords": [],\n    "cannot_improve": false,\n    "missing_mandatory": [],\n    "sugerencias_revision": [{ "seccion": "", "agregado": "", "razon": "" }]\n  }\n}`,
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
