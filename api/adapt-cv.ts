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
          contents: `Eres un experto en optimización de CVs para ATS y reclutamiento.\n\nIDIOMA DE SALIDA: ${language}\n\nOBJETIVO: Mejorar el match del CV con la Job Description siendo honesto y preciso.\n\nESTRATEGIA (en orden de prioridad):\n1. Mejora la redacción: más profesional, concisa, orientada a resultados, con la terminología exacta de la JD.\n2. Incorpora keywords de la JD donde sean HONESTAMENTE aplicables a la experiencia real del candidato.\n3. Solo si es muy evidente y defendible, puedes agregar 1 a 3 responsabilidades o frases al resumen que sean consecuencia natural del cargo y experiencia del candidato. Criterio: si alguien le preguntara al candidato "¿hiciste esto?", la respuesta muy probable es "sí, claro". Ejemplo válido: vendedor B2B con 5 años → "gestión de cartera de clientes". Ejemplo INVÁLIDO: vendedor → "experto en marketing digital".\n\nREGLAS ESTRICTAS:\n1. NUNCA inventes empresas, cargos, fechas, títulos ni cifras que no existan en el CV.\n2. NUNCA agregues tecnologías, herramientas ni certificaciones que no estén en el CV o en la experiencia del candidato. Si la JD las pide y el candidato no las tiene, van en missing_keywords.\n3. NO hagas inferencias creativas ni exageradas. Menos es más: es mejor un CV honesto con 5 puntos menos de score que uno inflado que no resiste una entrevista.\n4. Solo agrega sugerencias si son realmente necesarias para el match Y muy evidentes. Máximo 2-3 sugerencias totales.\n5. TODO lo que agregues que no estaba literalmente en el CV → inclúyelo en "sugerencias_revision" con el texto exacto.\n6. NO uses markdown. Solo texto plano.\n7. USA siempre tildes correctas (á,é,í,ó,ú,ñ).\n8. Si hay requisitos OBLIGATORIOS que el candidato definitivamente no cumple: pon cannot_improve: true.\n\nCV ORIGINAL:\n${cvText}\n\nJOB DESCRIPTION:\n${jdText}\n\nResponde SOLO este JSON:\n{\n  "cv_adaptado": {\n    "personal_info": { "name": "", "email": "", "phone": "", "location": "", "summary": "" },\n    "experience": [{ "company": "", "position": "", "period": "", "description": [] }],\n    "education": [{ "institution": "", "degree": "", "period": "", "description": [] }],\n    "skills": { "technical": [], "soft": [] },\n    "others": { "languages": "", "tools": "", "additional": "" }\n  },\n  "analisis": {\n    "match_score_original": 0,\n    "match_score_adapted": 0,\n    "summary_adapted": "",\n    "keywords_usadas": [],\n    "missing_keywords": [],\n    "cannot_improve": false,\n    "missing_mandatory": [],\n    "sugerencias_revision": [{ "seccion": "", "agregado": "", "razon": "" }]\n  }\n}`,
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
