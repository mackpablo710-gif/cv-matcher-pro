import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { base64Data } = req.body;
    const buffer = Buffer.from(base64Data, 'base64');
    // Dynamic import avoids the serverless startup issue with pdf-parse
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse/lib/pdf-parse.js');
    const data = await pdfParse(buffer);
    res.json({ text: data.text || '' });
  } catch (err: any) {
    res.status(500).json({ error: 'No se pudo leer el PDF. Intenta de nuevo.' });
  }
}
