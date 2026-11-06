import { PROMPTS } from '../prompts/index.js';

const MAX_MESSAGES = 30;
const MAX_TOTAL_CHARS = 8000;
const PROVIDER_TIMEOUT_MS = 20000;
const RATE_LIMIT_PER_MINUTE = 60; // 대회장 참가자가 같은 공인 IP를 쓸 수 있어 넉넉하게 둔다

const hits = new Map();

function isRateLimited(ip, now = Date.now()) {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT_PER_MINUTE;
}

export function resetRateLimit() {
  hits.clear();
}

function validate(body) {
  const { task, messages } = body ?? {};
  if (typeof task !== 'string' || !Object.hasOwn(PROMPTS, task)) return '알 수 없는 작업';
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return '메시지 개수 오류';
  }
  const valid = messages.every(
    (m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.text === 'string' && m.text.length > 0,
  );
  if (!valid) return '메시지 형식 오류';
  const total = messages.reduce((sum, m) => sum + m.text.length, 0);
  return total > MAX_TOTAL_CHARS ? '입력이 너무 김' : null;
}

async function postJson(url, headers, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function callGemini({ system, json }, messages) {
  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const data = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    { 'x-goog-api-key': process.env.GEMINI_API_KEY },
    {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.text }],
      })),
      ...(json ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
    },
  );
  return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
}

async function callGroq({ system, json }, messages) {
  const data = await postJson(
    'https://api.groq.com/openai/v1/chat/completions',
    { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    {
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: system },
        ...messages.map((m) => ({ role: m.role, content: m.text })),
      ],
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    },
  );
  return data.choices?.[0]?.message?.content ?? '';
}

// 순서가 곧 폴백 순서다. 키가 없는 제공자는 건너뛴다.
function activeProviders() {
  return [
    { name: 'gemini', key: process.env.GEMINI_API_KEY, call: callGemini },
    { name: 'groq', key: process.env.GROQ_API_KEY, call: callGroq },
  ].filter((p) => p.key);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용' });

  const ip = String(req.headers['x-forwarded-for'] ?? 'local').split(',')[0].trim();
  if (isRateLimited(ip)) return res.status(429).json({ error: '요청이 너무 많음', fallback: true });

  const problem = validate(req.body);
  if (problem) return res.status(400).json({ error: problem });

  const prompt = PROMPTS[req.body.task];
  for (const provider of activeProviders()) {
    try {
      const text = await provider.call(prompt, req.body.messages);
      if (text) return res.status(200).json({ text, provider: provider.name });
      console.error(`${provider.name}: 빈 응답`);
    } catch (err) {
      console.error(`${provider.name}: ${err.message}`);
    }
  }
  // fallback: true를 받은 화면은 내장 콘텐츠로 시연을 이어간다
  return res.status(503).json({ error: 'AI 사용 불가', fallback: true });
}
