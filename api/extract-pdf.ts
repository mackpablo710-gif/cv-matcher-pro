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
  return { status: 500, message: msg || 'No se pudo leer el PDF. Intenta de nuevo.' };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const { base64Data } = req.body;
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 3000));
      const result = await ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents: { parts: [
          { inlineData: { mimeType: 'application/pdf', data: base64Data } },
          { text: 'Extract all the text from this CV PDF exactly as written. Do not summarize. Return full text content.' },
        ]},
      });
      return res.json({ text: result.text || '' });
    } catch (err: any) {
      const { status, message } = geminiError(err);
      if (status === 503 && attempt < 2) continue;
      return res.status(status).json({ error: message });
    }
  }
}
