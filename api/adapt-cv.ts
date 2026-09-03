import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

const MODELS = ['gemini-2.0-flash', 'gemini-flash-latest', 'gemini-2.0-flash-lite'];

function safeParseJSON(text: string) {
  try { return JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim() || '{}'); }
  catch { throw new Error('Respuesta de Gemini no válida.'); }
}

async function callModel(ai: GoogleGenAI, model: string, contents: string, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('aborted'));
    const abort = () => reject(new Error('aborted'));
    signal.addEventListener('abort', abort, { once: true });
    ai.models.generateContent({
      model,
      contents,
      config: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 4000 },
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
        new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 50000)),
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
    const { cvText, jdText, language } = req.body;
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const text = await raceModels(ai,
      `Eres experto en CVs para ATS. Idioma de salida: ${language}.

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
}`
    );
    res.json(safeParseJSON(text));
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error desconocido' });
  }
}
