import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

const MODELS = ['gemini-2.0-flash', 'gemini-flash-latest', 'gemini-2.0-flash-lite'];
const RACE_TIMEOUT_MS = 50000;

async function raceModels(ai: GoogleGenAI, contents: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let failures = 0;
    for (const model of MODELS) {
      Promise.race([
        ai.models.generateContent({
          model,
          contents,
          config: { responseMimeType: 'application/json', temperature: 0.3 },
        }),
        new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), RACE_TIMEOUT_MS)),
      ])
        .then(r => { if (!settled && r.text) { settled = true; resolve(r.text); } })
        .catch(() => { failures++; if (failures === MODELS.length && !settled) reject(new Error('All models failed or timed out')); });
    }
  });
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
    const text = await raceModels(ai,
      `Eres un experto en optimización de CVs para ATS y reclutamiento.

IDIOMA DE SALIDA: ${language}

OBJETIVO: Mejorar el match del CV con la Job Description siendo honesto y preciso.

PASO 0 — DETECCIÓN DE CAMBIO DE INDUSTRIA:
Evalúa si la industria del CV difiere de la industria de la JD. Si hay cambio de industria, activa CAMBIO_INDUSTRIA = true.

ESTRATEGIA:
1. Mejora la redacción: más profesional, orientada a resultados, con terminología exacta de la JD.
2. Incorpora keywords de la JD donde sean HONESTAMENTE aplicables a la experiencia real.
3. En el RESUMEN: solo reformula lo que ya existe. NUNCA agregues expertise que no esté en el CV.
   - Si CAMBIO_INDUSTRIA=true: destaca habilidades TRANSFERIBLES, omite expertise en industria destino.

REGLAS ESTRICTAS:
1. NUNCA inventes empresas, cargos, fechas ni cifras.
2. NUNCA agregues tecnologías o certificaciones que no estén en el CV.
3. Solo agrega frases a bullets si son muy evidentes. Máximo 2-3 agregados. TODO agregado va en sugerencias_revision.
4. NO uses markdown. Solo texto plano.
5. USA siempre tildes correctas (á,é,í,ó,ú,ñ).

KEYWORDS SUGERIBLES:
Identifica keywords de la JD que el candidato NO tiene pero SÍ podría reclamar honestamente por habilidades transferibles.

SCORE: Evalúa el match de forma equilibrada. Un candidato con experiencia relevante en áreas similares debe obtener 70-85%. Solo baja de 60% si faltan requisitos obligatorios clave.

CV ORIGINAL:
${cvText}

JOB DESCRIPTION:
${jdText}

Responde SOLO este JSON:
{
  "cv_adaptado": {
    "personal_info": { "name": "", "email": "", "phone": "", "location": "", "summary": "" },
    "experience": [{ "company": "", "position": "", "period": "", "description": [] }],
    "education": [{ "institution": "", "degree": "", "period": "", "description": [] }],
    "skills": { "technical": [], "soft": [] },
    "others": { "languages": "", "tools": "", "additional": "" }
  },
  "analisis": {
    "match_score_original": 0,
    "match_score_adapted": 0,
    "cambio_industria": false,
    "industria_cv": "",
    "industria_jd": "",
    "summary_adapted": "",
    "keywords_usadas": [],
    "keywords_sugeribles": [{ "keyword": "", "razon": "" }],
    "missing_keywords": [],
    "cannot_improve": false,
    "missing_mandatory": [],
    "sugerencias_revision": [{ "seccion": "", "agregado": "", "razon": "" }]
  }
}`
    );
    res.json(safeParseJSON(text));
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error desconocido' });
  }
}
