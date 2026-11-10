import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

function openaiError(err: any): { status: number; message: string } {
  const msg: string = err?.message || String(err) || '';
  const status = err?.status || 500;
  if (status === 429) return { status: 429, message: 'Límite de uso de IA alcanzado. Por favor intenta en unos minutos.' };
  if (status === 503) return { status: 503, message: 'La IA está muy ocupada ahora. Por favor intenta de nuevo.' };
  return { status: 500, message: msg || 'Error desconocido' };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { cvText, jdText, language } = req.body;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const r = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: `Eres experto en CVs para ATS. Idioma de salida: ${language}.

REGLAS:
- Mejora redacción con terminología exacta de la JD.
- Incorpora keywords donde sean HONESTAMENTE aplicables.
- NUNCA inventes empresas, cargos, fechas, tecnologías ni certificaciones.
- Si agregas o expandes alguna frase en un bullet, SIEMPRE la registras en sugerencias_revision con seccion, agregado y razon. Esto es obligatorio — el usuario debe poder revisarlo.
- Si el candidato cambia de industria: destaca habilidades transferibles en el summary.
- Si faltan requisitos obligatorios clave: cannot_improve=true.
- SCORE REALISTA: match_score_adapted debe ser como máximo match_score_original + 15 puntos. Un CV adaptado no puede saltar más de 15 puntos — solo mejora redacción y keywords, no inventa experiencia.
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
      }],
    });
    const text = r.choices[0]?.message?.content || '{}';
    res.json(JSON.parse(text));
  } catch (err: any) {
    const { status, message } = openaiError(err);
    res.status(status).json({ error: message });
  }
}
