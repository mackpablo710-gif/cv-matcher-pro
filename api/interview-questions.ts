import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

const MODELS = ['gemini-flash-latest', 'gemini-2.0-flash-lite', 'gemini-1.5-flash-8b'];
const RACE_TIMEOUT_MS = 28000;

async function raceModels(ai: GoogleGenAI, contents: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let failures = 0;
    for (const model of MODELS) {
      Promise.race([
        ai.models.generateContent({
          model,
          contents,
          config: { responseMimeType: 'application/json', temperature: 0.4 },
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
    const { cvText, jdText } = req.body;
    if (!cvText || !jdText) return res.status(400).json({ error: 'Missing params' });
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const text = await raceModels(ai,
      `Eres un experto en procesos de selección y entrevistas laborales.\n\nAnaliza la Job Description y el CV del candidato, luego genera preguntas de entrevista MUY ESPECÍFICAS al cargo y a la experiencia del candidato.\n\nCV DEL CANDIDATO:\n${cvText}\n\nJOB DESCRIPTION:\n${jdText}\n\nINSTRUCCIONES:\n- Genera exactamente 9 preguntas divididas en 3 categorías: 3 técnicas del cargo, 3 conductuales/situacionales y 3 específicas a la descripción del cargo.\n- Las preguntas técnicas deben referirse a los skills y herramientas mencionados en la JD.\n- Las conductuales deben usar el formato STAR (Situación-Tarea-Acción-Resultado) y referirse a desafíos del cargo.\n- Las preguntas específicas al cargo deben abordar responsabilidades concretas mencionadas en la JD.\n- Para cada pregunta incluye un TIP corto (1 oración) de cómo responderla bien, basado en lo que el candidato ya tiene en su CV.\n- USA siempre tildes y caracteres correctos en español (á,é,í,ó,ú,ñ).\n- NO uses markdown.\n\nResponde SOLO este JSON:\n{\n  "questions": [\n    { "tipo": "tecnica", "pregunta": "", "tip": "" },\n    { "tipo": "tecnica", "pregunta": "", "tip": "" },\n    { "tipo": "tecnica", "pregunta": "", "tip": "" },\n    { "tipo": "conductual", "pregunta": "", "tip": "" },\n    { "tipo": "conductual", "pregunta": "", "tip": "" },\n    { "tipo": "conductual", "pregunta": "", "tip": "" },\n    { "tipo": "cargo", "pregunta": "", "tip": "" },\n    { "tipo": "cargo", "pregunta": "", "tip": "" },\n    { "tipo": "cargo", "pregunta": "", "tip": "" }\n  ]\n}`
    );
    const parsed = safeParseJSON(text);
    res.json({ questions: Array.isArray(parsed?.questions) ? parsed.questions : [] });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error desconocido' });
  }
}
