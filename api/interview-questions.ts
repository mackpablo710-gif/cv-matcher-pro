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
  catch { return {}; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { cvText, jdText } = req.body;
    if (!cvText || !jdText) return res.status(400).json({ error: 'Missing params' });
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const r = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: `Genera 9 preguntas de entrevista específicas. Responde SOLO JSON válido:
{"questions":[{"tipo":"tecnica","pregunta":"","tip":""},{"tipo":"tecnica","pregunta":"","tip":""},{"tipo":"tecnica","pregunta":"","tip":""},{"tipo":"conductual","pregunta":"","tip":""},{"tipo":"conductual","pregunta":"","tip":""},{"tipo":"conductual","pregunta":"","tip":""},{"tipo":"cargo","pregunta":"","tip":""},{"tipo":"cargo","pregunta":"","tip":""},{"tipo":"cargo","pregunta":"","tip":""}]}
3 técnicas (skills de la JD), 3 conductuales (STAR), 3 del cargo. tip: 1 oración basada en el CV. Español con tildes.

CV: ${cvText}
JD: ${jdText}`,
      config: { responseMimeType: 'application/json', temperature: 0.4, maxOutputTokens: 1800 },
    });
    const parsed = safeParseJSON(r.text || '');
    res.json({ questions: Array.isArray(parsed?.questions) ? parsed.questions : [] });
  } catch (err: any) {
    const { status, message } = geminiError(err);
    res.status(status).json({ error: message });
  }
}
