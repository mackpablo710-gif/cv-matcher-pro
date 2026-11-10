import type { VercelRequest, VercelResponse } from '@vercel/node';
import { pathToFileURL } from 'url';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { base64Data } = req.body;
    const buffer = Buffer.from(base64Data, 'base64');

    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

    const pdf = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
    }).promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .filter((item: any) => 'str' in item)
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n';
    }

    res.json({ text: fullText.trim() });
  } catch (err: any) {
    res.status(500).json({ error: 'No se pudo leer el PDF. Intenta de nuevo.' });
  }
}
