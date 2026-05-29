import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

const MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash-lite'];

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  const delays = [2000, 5000, 10000, 15000];
  let lastError: any;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try { return await fn(); }
    catch (err: any) {
      lastError = err;
      const msg: string = err?.message || '';
      const retry = msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand') || msg.includes('Please retry');
      if (!retry || attempt === maxAttempts - 1) throw err;
      await new Promise(r => setTimeout(r, delays[attempt]));
    }
  }
  throw lastError;
}

function safeParseJSON(text: string) {
  try { return JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim() || '{}'); }
  catch { throw new Error('Respuesta de Gemini no válida.'); }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { cvText, jdText, language } = req.body;
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    let text = '';
    for (const model of MODELS) {
      try {
        const r = await withRetry(() => ai.models.generateContent({
          model,
          contents: `Eres un experto en optimización de CVs para ATS y reclutamiento.\n\nIDIOMA DE SALIDA: ${language}\n\nOBJETIVO: Mejorar el match del CV con la Job Description siendo honesto y preciso. Además, generar preguntas de entrevista específicas al cargo.\n\nPASO 0 — DETECCIÓN DE CAMBIO DE INDUSTRIA:\nAntes de adaptar, evalúa si la industria principal del CV difiere de la industria de la JD. Si hay cambio de industria (ej: retail → tecnología, educación → finanzas), activa el modo CAMBIO_INDUSTRIA = true. Esto afecta todas las reglas siguientes.\n\nESTRATEGIA ADAPTACIÓN (en orden de prioridad):\n1. Mejora la redacción: más profesional, concisa, orientada a resultados, con la terminología exacta de la JD.\n2. Incorpora keywords de la JD donde sean HONESTAMENTE aplicables a la experiencia real del candidato.\n3. En el RESUMEN: solo reformula lo que ya existe con lenguaje de la JD. NUNCA agregues expertise, títulos de especialidad ni afirmaciones de conocimiento que no tengas evidencia en el CV. El resumen describe quién ES el candidato, no quién quiere ser.\n   - PERMITIDO: "Profesional con experiencia en gestión de equipos..." (si tiene esa experiencia)\n   - PROHIBIDO: "Experto en X" / "Especialista en Y" / "Profesional de la industria Z" si esa industria/skill no aparece en su experiencia.\n   - Si CAMBIO_INDUSTRIA=true: el resumen debe destacar habilidades TRANSFERIBLES (liderazgo, análisis, gestión de clientes, etc.) y omitir cualquier referencia a expertise en la industria destino.\n\nREGLAS ESTRICTAS:\n1. NUNCA inventes empresas, cargos, fechas, títulos ni cifras que no existan en el CV.\n2. NUNCA agregues tecnologías, herramientas ni certificaciones que no estén en el CV. Si la JD las pide y el candidato no las tiene, van en missing_keywords.\n3. NO hagas inferencias creativas ni exageradas. Menos es más.\n4. Solo agrega frases a bullets de experiencia si son muy evidentes (criterio: el candidato respondería "sí, claro"). Máximo 2-3 agregados totales. TODO agregado va en sugerencias_revision.\n5. NO uses markdown. Solo texto plano.\n6. USA siempre tildes correctas (á,é,í,ó,ú,ñ).\n7. Si hay requisitos OBLIGATORIOS que el candidato definitivamente no cumple: pon cannot_improve: true.\n\nKEYWORDS SUGERIBLES (nuevo campo):\nIdentifica keywords de la JD que el candidato NO tiene en su CV pero que SÍ podría reclamar honestamente si pensara en ello — basadas en habilidades transferibles evidentes de su experiencia. Estas van en keywords_sugeribles como sugerencias para que el candidato considere agregar si son verídicas.\nEjemplo válido: vendedor B2B con 5 años sin mencionar "gestión de pipeline" → sugerir esa keyword.\nEjemplo INVÁLIDO en cambio de industria: candidato de retail → "experto en software SaaS" (no es transferible sin evidencia).\n\nPREGUNTAS DE ENTREVISTA: Genera exactamente 9 preguntas muy específicas al cargo y a la experiencia del candidato: 3 técnicas del cargo, 3 conductuales/STAR y 3 sobre responsabilidades concretas de la JD. Para cada una incluye un tip corto (1 oración) de cómo responderla bien basado en el CV del candidato.\n\nCV ORIGINAL:\n${cvText}\n\nJOB DESCRIPTION:\n${jdText}\n\nResponde SOLO este JSON:\n{\n  "cv_adaptado": {\n    "personal_info": { "name": "", "email": "", "phone": "", "location": "", "summary": "" },\n    "experience": [{ "company": "", "position": "", "period": "", "description": [] }],\n    "education": [{ "institution": "", "degree": "", "period": "", "description": [] }],\n    "skills": { "technical": [], "soft": [] },\n    "others": { "languages": "", "tools": "", "additional": "" }\n  },\n  "analisis": {\n    "match_score_original": 0,\n    "match_score_adapted": 0,\n    "cambio_industria": false,\n    "industria_cv": "",\n    "industria_jd": "",\n    "summary_adapted": "",\n    "keywords_usadas": [],\n    "keywords_sugeribles": [{ "keyword": "", "razon": "" }],\n    "missing_keywords": [],\n    "cannot_improve": false,\n    "missing_mandatory": [],\n    "sugerencias_revision": [{ "seccion": "", "agregado": "", "razon": "" }],\n    "preguntas": [\n      { "tipo": "tecnica", "pregunta": "", "tip": "" },\n      { "tipo": "tecnica", "pregunta": "", "tip": "" },\n      { "tipo": "tecnica", "pregunta": "", "tip": "" },\n      { "tipo": "conductual", "pregunta": "", "tip": "" },\n      { "tipo": "conductual", "pregunta": "", "tip": "" },\n      { "tipo": "conductual", "pregunta": "", "tip": "" },\n      { "tipo": "cargo", "pregunta": "", "tip": "" },\n      { "tipo": "cargo", "pregunta": "", "tip": "" },\n      { "tipo": "cargo", "pregunta": "", "tip": "" }\n    ]\n  }\n}`,
          config: { responseMimeType: 'application/json', temperature: 0.3 },
        }));
        text = r.text || ''; break;
      } catch (err: any) {
        const msg = err?.message || '';
        if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('NOT_FOUND') || msg.includes('quota')) continue;
        throw err;
      }
    }
    res.json(safeParseJSON(text));
  } catch (err: any) {
    const msg = err?.message || '';
    res.status(msg.includes('503') || msg.includes('UNAVAILABLE') ? 503 : 500)
       .json({ error: msg.includes('503') || msg.includes('UNAVAILABLE') ? 'Gemini está muy ocupado. Por favor intenta de nuevo en unos segundos.' : msg });
  }
}
