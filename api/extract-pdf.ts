import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { base64Data } = req.body;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_file',
              file_data: `data:application/pdf;base64,${base64Data}`,
            },
            {
              type: 'input_text',
              text: 'Extract all the text from this CV PDF exactly as written. Do not summarize. Return only the full text content.',
            },
          ],
        },
      ],
    });

    const text = response.output_text || '';
    res.json({ text });
  } catch (err: any) {
    const status = err?.status || 500;
    if (status === 429) return res.status(429).json({ error: 'Límite de uso de IA alcanzado. Por favor intenta en unos minutos.' });
    res.status(500).json({ error: 'No se pudo leer el PDF. Intenta de nuevo.' });
  }
}
