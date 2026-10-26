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
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const r = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: `Compara el CV con la JD. Devuelve SOLO este JSON en español con tildes:
{"score":0,"job_title":"","company_name":"","summary":"","key_matches":[],"key_gaps":[]}
score: entero 0-100 realista. key_matches/key_gaps: máx 5 items. summary: 1-2 oraciones. Sin markdown.

CV:
${cvText}

JD:
${jdText}`,
      config: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 600 },
    });
    const parsed = safeParseJSON(r.text || '');
    res.json({
      score: Math.max(0, Math.min(100, Math.round(Number(parsed?.score ?? 0)))),
      job_title: parsed?.job_title || '',
      company_name: parsed?.company_name || '',
      summary: parsed?.summary || '',
      key_matches: Array.isArray(parsed?.key_matches) ? parsed.key_matches : [],
      key_gaps: Array.isArray(parsed?.key_gaps) ? parsed.key_gaps : [],
    });
  } catch (err: any) {
    const { status, message } = geminiError(err);
    res.status(status).json({ error: message });
  }
}
