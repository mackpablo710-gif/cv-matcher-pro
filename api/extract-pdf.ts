import type { VercelRequest, VercelResponse } from '@vercel/node';
import { inflateSync, inflateRawSync } from 'zlib';

function decodePDFStr(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\(\d{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
}

function extractTextFromPDF(buf: Buffer): string {
  const bytes = buf.toString('binary');
  let out = '';

  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;

  while ((m = streamRe.exec(bytes)) !== null) {
    const raw = Buffer.from(m[1], 'binary');
    let data: Buffer;
    try { data = inflateSync(raw); } catch {
      try { data = inflateRawSync(raw); } catch { data = raw; }
    }
    const s = data.toString('latin1');

    const btRe = /BT([\s\S]*?)ET/g;
    let bt: RegExpExecArray | null;
    while ((bt = btRe.exec(s)) !== null) {
      const block = bt[1];
      block.replace(/\(([^)]*)\)\s*Tj/g, (_, t) => { out += decodePDFStr(t) + ' '; return ''; });
      block.replace(/\[([^\]]*)\]\s*TJ/g, (_, arr) => {
        arr.replace(/\(([^)]*)\)/g, (_: string, t: string) => { out += decodePDFStr(t); return ''; });
        out += ' ';
        return '';
      });
    }
    out += '\n';
  }

  return out.replace(/[ \t]{2,}/g, ' ').trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { base64Data } = req.body;
    const buffer = Buffer.from(base64Data, 'base64');
    const text = extractTextFromPDF(buffer);

    if (!text || text.length < 30) {
      return res.status(422).json({ error: 'No se pudo extraer texto. Asegúrate de que el PDF no sea una imagen escaneada.' });
    }

    res.json({ text });
  } catch (err: any) {
    res.status(500).json({ error: 'No se pudo leer el PDF. Intenta de nuevo.' });
  }
}
