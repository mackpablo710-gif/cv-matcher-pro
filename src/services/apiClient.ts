const BASE = '/api';

async function post<T>(endpoint: string, body: object): Promise<T> {
  const res = await fetch(`${BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Error desconocido' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const extractPdfText = (base64Data: string) =>
  post<{ text: string }>('/extract-pdf', { base64Data });

export const getInitialMatch = (cvText: string, jdText: string) =>
  post<{ score: number; summary: string; key_matches: string[]; key_gaps: string[] }>(
    '/initial-match',
    { cvText, jdText }
  );

export const adaptCV = (cvText: string, jdText: string, language: string) =>
  post<any>('/adapt-cv', { cvText, jdText, language });
