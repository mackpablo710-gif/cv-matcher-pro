import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { base64Data } = req.body;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    const r = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'file',
            file: {
              filename: 'cv.pdf',
              file_data: `data:application/pdf;base64,${base64Data}`,
            },
          } as any,
          {
            type: 'text',
            text: 'Extract all the text from this CV PDF exactly as written. Do not summarize. Return only the full text content.',
          },
        ],
      }],
    });

    const text = r.choices[0]?.message?.content || '';
    res.json({ text });
  } catch (err: any) {
    const status = err?.status || 500;
    if (status === 429) return res.status(429).json({ error: 'Límite de uso de IA alcanzado. Por favor intenta en unos minutos.' });
    res.status(500).json({ error: 'No se pudo leer el PDF. Intenta de nuevo.' });
  }
}
