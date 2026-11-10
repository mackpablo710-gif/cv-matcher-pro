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
    const { cvText, jdText } = req.body;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const r = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 600,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: `Compara el CV con la JD. Devuelve SOLO este JSON en español con tildes:
{"score":0,"job_title":"","company_name":"","summary":"","key_matches":[],"key_gaps":[]}
score: entero 0-100 realista. key_matches/key_gaps: máx 5 items. summary: 1-2 oraciones.

CV:
${cvText}

JD:
${jdText}`,
      }],
    });
    const text = r.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(text);
    res.json({
      score: Math.max(0, Math.min(100, Math.round(Number(parsed?.score ?? 0)))),
      job_title: parsed?.job_title || '',
      company_name: parsed?.company_name || '',
      summary: parsed?.summary || '',
      key_matches: Array.isArray(parsed?.key_matches) ? parsed.key_matches : [],
      key_gaps: Array.isArray(parsed?.key_gaps) ? parsed.key_gaps : [],
    });
  } catch (err: any) {
    const { status, message } = openaiError(err);
    res.status(status).json({ error: message });
  }
}
