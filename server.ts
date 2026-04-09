import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3011;

app.use(cors({ origin: ['http://localhost:3010', 'http://127.0.0.1:3010'] }));
app.use(express.json({ limit: '20mb' }));

const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not defined');
  return new GoogleGenAI({ apiKey });
};

const safeParseJSON = (text: string) => {
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned || '{}');
  } catch {
    throw new Error('La respuesta de Gemini no vino en JSON válido.');
  }
};

// ─── Retry wrapper: handles 503 / UNAVAILABLE with exponential backoff ─────
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  const delays = [2000, 5000, 10000, 15000];
  let lastError: any;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const msg: string = err?.message || '';
      const isRetryable =
        msg.includes('503') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('high demand') ||
        msg.includes('overloaded') ||
        msg.includes('Please retry');
      if (!isRetryable || attempt === maxAttempts - 1) throw err;
      const wait = delays[attempt];
      console.log(`⏳ Gemini 503 — intento ${attempt + 1}/${maxAttempts}, reintentando en ${wait / 1000}s...`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw lastError;
}

// ─── Model fallback list ──────────────────────────────────────────────────────
// If primary model is unavailable, try the next one in line
const MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash-lite'];

async function generateWithFallback(params: {
  contents: any;
  config?: any;
}): Promise<string> {
  let lastError: any;
  for (const model of MODELS) {
    try {
      const ai = getAI();
      const response = await withRetry(() =>
        ai.models.generateContent({ model, ...params })
      );
      return response.text || '';
    } catch (err: any) {
      lastError = err;
      const msg: string = err?.message || '';
      // Only try next model if it's a model-level error (503, quota, not found)
      if (
        msg.includes('503') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('high demand') ||
        msg.includes('NOT_FOUND') ||
        msg.includes('quota')
      ) {
        console.log(`⚠️  Modelo ${model} falló, probando siguiente...`);
        continue;
      }
      throw err; // Other errors (auth, bad request) → rethrow immediately
    }
  }
  throw lastError;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.post('/api/extract-pdf', async (req, res) => {
  try {
    const { base64Data } = req.body;
    // PDF extraction needs inline data — use withRetry directly (no fallback model needed for PDF)
    const text = await withRetry(async () => {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents: {
          parts: [
            { inlineData: { mimeType: 'application/pdf', data: base64Data } },
            { text: 'Extract all the text from this CV PDF exactly as written. Do not summarize. Return full text content.' },
          ],
        },
      });
      return response.text || '';
    });
    res.json({ text: text || '' });
  } catch (err: any) {
    const msg: string = err?.message || '';
    if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
      res.status(503).json({ error: 'Gemini está muy ocupado ahora. Por favor intenta en unos segundos.' });
    } else {
      res.status(500).json({ error: msg });
    }
  }
});

app.post('/api/initial-match', async (req, res) => {
  try {
    const { cvText, jdText } = req.body;
    const text = await generateWithFallback({
      contents: `Analiza la coincidencia entre el CV y la Job Description.

CV:
${cvText}

Job Description:
${jdText}

Devuelve SOLO un JSON válido con esta estructura exacta:
{
  "score": 0,
  "summary": "",
  "key_matches": [],
  "key_gaps": []
}

Reglas:
1. score: número entero 0-100
2. key_matches y key_gaps: arrays de strings (máx 6 items cada uno)
3. summary: texto breve y claro en español
4. No uses markdown, solo JSON`,
      config: { responseMimeType: 'application/json', temperature: 0.2 },
    });

    const parsed = safeParseJSON(text);
    res.json({
      score: Math.max(0, Math.min(100, Math.round(Number(parsed?.score ?? 0)))),
      summary: parsed?.summary || '',
      key_matches: Array.isArray(parsed?.key_matches) ? parsed.key_matches : [],
      key_gaps: Array.isArray(parsed?.key_gaps) ? parsed.key_gaps : [],
    });
  } catch (err: any) {
    const msg: string = err?.message || '';
    if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
      res.status(503).json({ error: 'Gemini está muy ocupado ahora. Por favor intenta de nuevo en unos segundos.' });
    } else {
      res.status(500).json({ error: msg });
    }
  }
});

app.post('/api/adapt-cv', async (req, res) => {
  try {
    const { cvText, jdText, language } = req.body;
    const text = await generateWithFallback({
      contents: `Eres un experto en optimización de CVs para ATS.

IDIOMA DE SALIDA: ${language}

OBJETIVO: Mejorar el CV para aumentar el match con la Job Description SIN inventar información.

REGLAS:
1. NO inventes experiencia, empresas, fechas ni logros.
2. Mejora la redacción para hacerla más profesional y estratégica.
3. Incorpora lenguaje y términos de la Job Description.
4. NO uses markdown (**, *, etc). Solo texto plano.
5. match_score_adapted debe ser >= match_score_original.

CV ORIGINAL:
${cvText}

JOB DESCRIPTION:
${jdText}

Responde SOLO este JSON:
{
  "cv_adaptado": {
    "personal_info": { "name": "", "email": "", "phone": "", "location": "", "summary": "" },
    "experience": [{ "company": "", "position": "", "period": "", "description": [] }],
    "education": [{ "institution": "", "degree": "", "period": "", "description": [] }],
    "skills": { "technical": [], "soft": [] },
    "others": { "languages": "", "tools": "", "additional": "" }
  },
  "analisis": {
    "match_score_original": 0,
    "match_score_adapted": 0,
    "summary_adapted": "",
    "keywords_usadas": [],
    "missing_keywords": []
  }
}`,
      config: { responseMimeType: 'application/json', temperature: 0.3 },
    });

    res.json(safeParseJSON(text));
  } catch (err: any) {
    const msg: string = err?.message || '';
    if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
      res.status(503).json({ error: 'Gemini está muy ocupado ahora. Por favor intenta de nuevo en unos segundos.' });
    } else {
      res.status(500).json({ error: msg });
    }
  }
});

app.listen(PORT, () => {
  console.log(`✅ CV Matcher Pro server running on port ${PORT}`);
});
