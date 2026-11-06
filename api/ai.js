import { PROMPTS } from '../prompts/index.js';

const MAX_MESSAGES = 30;
const MAX_TOTAL_CHARS = 12000; // 만족도 평가는 후보 12개의 사실을 한 번에 보낸다
const PROVIDER_TIMEOUT_MS = 15000; // 제공자 3곳을 한 바퀴 돌아도 등록 함수 제한(60초) 안에 끝나게 한다
const MAX_OUTPUT_TOKENS = 2048;
// 11-06 실측: 1~2초 응답 · 무료 일일 500회. 3.8 Flash는 일일 20회에 60초를 넘겨 제외
const DEFAULT_GEMINI_MODELS = 'gemini-3.5-flash-lite,gemini-3.1-flash-lite';
// 발표 때 청중 약 60명이 같은 와이파이(공인 IP 하나)로 1~2분 안에 몰린다(13:09 관리자). 실제 한도는 Gemini 쪽이다
const RATE_LIMIT_PER_MINUTE = 300;

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
  if (!res.ok) {
    const error = new Error(`HTTP ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

async function callGemini(model, prompt, messages) {
  const { system, json } = prompt;
  const data = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    { 'x-goog-api-key': process.env.GEMINI_API_KEY },
    {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.text }],
      })),
      generationConfig: {
        maxOutputTokens: prompt.maxTokens ?? MAX_OUTPUT_TOKENS,
        ...(json ? { responseMimeType: 'application/json' } : {}),
      },
    },
  );
  return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
}

async function callGroq(prompt, messages) {
  const { system, json } = prompt;
  const data = await postJson(
    'https://api.groq.com/openai/v1/chat/completions',
    { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    {
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
      max_tokens: prompt.maxTokens ?? MAX_OUTPUT_TOKENS,
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
  const geminiModels = (process.env.GEMINI_MODELS || DEFAULT_GEMINI_MODELS).split(',').map((m) => m.trim());
  return [
    ...geminiModels.map((model) => ({
      name: model,
      key: process.env.GEMINI_API_KEY,
      call: (prompt, messages) => callGemini(model, prompt, messages),
    })),
    { name: 'groq', key: process.env.GROQ_API_KEY, call: callGroq },
  ].filter((p) => p.key);
}

// 한도 초과(429)나 과부하(503)일 때 다시 줄을 설 수 있는 시간. 평소에는 기다리지 않는다.
// 발표 때 청중 60명이 동시에 쓴다(13:21 관리자 결정: 넘칠 때만 대기). 칭호가 가장 오래 기다릴 가치가 있다.
const WAIT_BUDGET_MS = { verdict: 30000, conditions: 15000, satisfaction: 8000 };
const RETRY_GAP_MS = [800, 2000];
const isBusy = (err) => err.status === 429 || err.status === 503 || err.name === 'TimeoutError';
const pause = () => new Promise((r) => setTimeout(r, RETRY_GAP_MS[0] + Math.random() * (RETRY_GAP_MS[1] - RETRY_GAP_MS[0])));

// 폴백 순서대로 시도한다. 전부 바쁘면 예산 안에서 잠깐 쉬고 처음부터 다시 돈다.
// 모델이 없거나(404) 요청이 잘못된 오류는 그 요청 안에서 다시 시도하지 않는다.
// 끝내 실패하면 null이며 호출한 쪽이 간이 계산이나 고정 문구로 이어 간다.
export async function askAi(task, messages) {
  const deadline = Date.now() + (WAIT_BUDGET_MS[task] ?? 0);
  let providers = activeProviders();
  for (;;) {
    let busy = false;
    for (const provider of providers) {
      try {
        const text = await provider.call(PROMPTS[task], messages);
        if (text) return { text, provider: provider.name };
        console.error(`${provider.name}: 빈 응답`);
      } catch (err) {
        console.error(`${provider.name}: ${err.message}`);
        if (isBusy(err)) busy = true;
        else providers = providers.filter((p) => p !== provider);
      }
    }
    if (!busy || providers.length === 0 || Date.now() + RETRY_GAP_MS[1] > deadline) return null;
    await pause();
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용' });

  const ip = String(req.headers['x-forwarded-for'] ?? 'local').split(',')[0].trim();
  if (isRateLimited(ip)) return res.status(429).json({ error: '요청이 너무 많음', fallback: true });

  let body;
  try {
    body = req.body; // Vercel은 깨진 JSON이면 이 접근에서 예외를 던진다
  } catch {
    return res.status(400).json({ error: '잘못된 JSON' });
  }

  const problem = validate(body);
  if (problem) return res.status(400).json({ error: problem });

  const answer = await askAi(body.task, body.messages);
  if (answer) return res.status(200).json(answer);
  // fallback: true를 받은 화면은 내장 콘텐츠로 시연을 이어간다
  return res.status(503).json({ error: 'AI 사용 불가', fallback: true });
}
