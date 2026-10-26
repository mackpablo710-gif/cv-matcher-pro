import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

function geminiError(err: any): { status: number; message: string } {
  const msg: string = err?.message || String(err) || '';
  if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
    return { status: 429, message: 'Límite de uso de IA alcanzado. Por favor intenta en unos minutos.' };
  }
  if (msg.includes('503') || msg.includes('UNAVAILABLE')) {
    return { status: 503, message: 'La IA está muy ocupada ahora. Por favor intenta de nuevo.' };
  }
  return { status: 500, message: msg || 'Error desconocido' };
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
    const r = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `Eres experto en CVs para ATS. Idioma de salida: ${language}.

REGLAS:
- Mejora redacción con terminología exacta de la JD.
- Incorpora keywords donde sean HONESTAMENTE aplicables.
- NUNCA inventes empresas, cargos, fechas, tecnologías ni certificaciones.
- Solo añade frases a bullets si son muy evidentes (máx 2-3, van en sugerencias_revision).
- Si el candidato cambia de industria: destaca habilidades transferibles en el summary.
- Si faltan requisitos obligatorios clave: cannot_improve=true.
- SCORE equilibrado: experiencia relevante en áreas similares = 70-85%. Solo baja de 60% si faltan requisitos obligatorios.
- Texto plano, tildes correctas (á,é,í,ó,ú,ñ).

CV: ${cvText}

JD: ${jdText}

Responde SOLO este JSON:
{
  "cv_adaptado": {
    "personal_info": {"name":"","email":"","phone":"","location":"","summary":""},
    "experience": [{"company":"","position":"","period":"","description":[]}],
    "education": [{"institution":"","degree":"","period":"","description":[]}],
    "skills": {"technical":[],"soft":[]},
    "others": {"languages":"","tools":"","additional":""}
  },
  "analisis": {
    "match_score_original": 0,
    "match_score_adapted": 0,
    "cambio_industria": false,
    "industria_cv": "",
    "industria_jd": "",
    "summary_adapted": "",
    "keywords_usadas": [],
    "keywords_sugeribles": [{"keyword":"","razon":""}],
    "missing_keywords": [],
    "cannot_improve": false,
    "missing_mandatory": [],
    "sugerencias_revision": [{"seccion":"","agregado":"","razon":""}]
  }
}`,
      config: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 4000 },
    });
    res.json(safeParseJSON(r.text || ''));
  } catch (err: any) {
    const { status, message } = geminiError(err);
    res.status(status).json({ error: message });
  }
}
