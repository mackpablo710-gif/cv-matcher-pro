import type { VercelRequest, VercelResponse } from '@vercel/node';
import { inflateSync, inflateRawSync } from 'zlib';
import OpenAI from 'openai';

function decodePDFStr(s: string): string {
  return s
    .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\')
    .replace(/\\(\d{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
}

function extractRaw(buf: Buffer): string {
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
        const tokenRe = /\(([^)]*)\)|(-?\d+(?:\.\d+)?)/g;
        let tok: RegExpExecArray | null;
        let pending = '';
        while ((tok = tokenRe.exec(arr)) !== null) {
          if (tok[1] !== undefined) { pending += decodePDFStr(tok[1]); }
          else if (parseFloat(tok[2]) < -300) { out += pending + ' '; pending = ''; }
        }
        if (pending) out += pending;
        out += ' ';
        return '';
      });
      out += '\n';
    }
  }
  return out.replace(/[ \t]{2,}/g, ' ').trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { base64Data } = req.body;
    const buffer = Buffer.from(base64Data, 'base64');

    const rawText = extractRaw(buffer);
    if (!rawText || rawText.length < 30) {
      return res.status(422).json({ error: 'No se pudo extraer texto. Verifica que el PDF no sea una imagen escaneada.' });
    }

    // Clean up word-splits and encoding artifacts with a fast AI pass
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const r = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `You are a PDF text cleaner. Fix word splits (e.g. "Las Ni eves" → "Las Nieves", "cade nas" → "cadenas", "202 5" → "2025") and remove encoding artifacts (e.g. "CIAL\\" → "CIAL)") in this CV text extracted from a PDF. Keep ALL content, structure, and information intact. Return ONLY the corrected text with no commentary.

${rawText}`,
      }],
    });

    const text = r.choices[0]?.message?.content || rawText;
    res.json({ text });
  } catch (err: any) {
    const status = err?.status || 500;
    if (status === 429) return res.status(429).json({ error: 'Límite de uso de IA alcanzado. Por favor intenta en unos minutos.' });
    res.status(500).json({ error: 'No se pudo leer el PDF. Intenta de nuevo.' });
  }
}
