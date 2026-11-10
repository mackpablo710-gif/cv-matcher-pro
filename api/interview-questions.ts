import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

function openaiError(err: any): { status: number; message: string } {
  const status = err?.status || 500;
  if (status === 429) return { status: 429, message: 'Límite de uso de IA alcanzado. Por favor intenta en unos minutos.' };
  if (status === 503) return { status: 503, message: 'La IA está muy ocupada ahora. Por favor intenta de nuevo.' };
  return { status: 500, message: err?.message || 'Error desconocido' };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { cvText, jdText } = req.body;
    if (!cvText || !jdText) return res.status(400).json({ error: 'Missing params' });
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const r = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      max_tokens: 1800,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: `Genera 9 preguntas de entrevista específicas. Responde SOLO JSON válido:
{"questions":[{"tipo":"tecnica","pregunta":"","tip":""},{"tipo":"tecnica","pregunta":"","tip":""},{"tipo":"tecnica","pregunta":"","tip":""},{"tipo":"conductual","pregunta":"","tip":""},{"tipo":"conductual","pregunta":"","tip":""},{"tipo":"conductual","pregunta":"","tip":""},{"tipo":"cargo","pregunta":"","tip":""},{"tipo":"cargo","pregunta":"","tip":""},{"tipo":"cargo","pregunta":"","tip":""}]}
3 técnicas (skills de la JD), 3 conductuales (STAR), 3 del cargo. tip: 1 oración basada en el CV. Español con tildes.

CV: ${cvText}
JD: ${jdText}`,
      }],
    });
    const text = r.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(text);
    res.json({ questions: Array.isArray(parsed?.questions) ? parsed.questions : [] });
  } catch (err: any) {
    const { status, message } = openaiError(err);
    res.status(status).json({ error: message });
  }
}
