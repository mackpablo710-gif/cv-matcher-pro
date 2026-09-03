import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

const MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.0-flash-lite'];

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  const delays = [1500, 3000, 6000];
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
    const { cvText, jdText } = req.body;
    if (!cvText || !jdText) return res.status(400).json({ error: 'Missing params' });

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    let text = '';

    for (const model of MODELS) {
      try {
        const r = await withRetry(() => ai.models.generateContent({
          model,
          contents: `Eres un experto en procesos de selección y entrevistas laborales.\n\nAnaliza la Job Description y el CV del candidato, luego genera preguntas de entrevista MUY ESPECÍFICAS al cargo y a la experiencia del candidato.\n\nCV DEL CANDIDATO:\n${cvText}\n\nJOB DESCRIPTION:\n${jdText}\n\nINSTRUCCIONES:\n- Genera exactamente 9 preguntas divididas en 3 categorías: 3 técnicas del cargo, 3 conductuales/situacionales y 3 específicas a la descripción del cargo.\n- Las preguntas técnicas deben referirse a los skills y herramientas mencionados en la JD.\n- Las conductuales deben usar el formato STAR (Situación-Tarea-Acción-Resultado) y referirse a desafíos del cargo.\n- Las preguntas específicas al cargo deben abordar responsabilidades concretas mencionadas en la JD.\n- Para cada pregunta incluye un TIP corto (1 oración) de cómo responderla bien, basado en lo que el candidato ya tiene en su CV.\n- USA siempre tildes y caracteres correctos en español (á,é,í,ó,ú,ñ).\n- NO uses markdown.\n\nResponde SOLO este JSON:\n{\n  "questions": [\n    { "tipo": "tecnica", "pregunta": "", "tip": "" },\n    { "tipo": "tecnica", "pregunta": "", "tip": "" },\n    { "tipo": "tecnica", "pregunta": "", "tip": "" },\n    { "tipo": "conductual", "pregunta": "", "tip": "" },\n    { "tipo": "conductual", "pregunta": "", "tip": "" },\n    { "tipo": "conductual", "pregunta": "", "tip": "" },\n    { "tipo": "cargo", "pregunta": "", "tip": "" },\n    { "tipo": "cargo", "pregunta": "", "tip": "" },\n    { "tipo": "cargo", "pregunta": "", "tip": "" }\n  ]\n}`,
          config: { responseMimeType: 'application/json', temperature: 0.4 },
        }));
        text = r.text || ''; break;
      } catch (err: any) {
        const msg = err?.message || '';
        if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('NOT_FOUND') || msg.includes('quota')) continue;
        throw err;
      }
    }

    const parsed = safeParseJSON(text);
    res.json({
      questions: Array.isArray(parsed?.questions) ? parsed.questions : [],
    });
  } catch (err: any) {
    const msg = err?.message || '';
    res.status(msg.includes('503') || msg.includes('UNAVAILABLE') ? 503 : 500)
       .json({ error: msg.includes('503') || msg.includes('UNAVAILABLE') ? 'Gemini está muy ocupado. Intenta de nuevo.' : msg });
  }
}
