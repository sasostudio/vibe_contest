// IP별 분당 요청 제한. 서버 인스턴스 안에서만 센다(인스턴스가 여러 개면 각자 센다).
export function createLimiter(perMinute) {
  const hits = new Map();
  return {
    limited(key, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < 60000);
      recent.push(now);
      hits.set(key, recent);
      return recent.length > perMinute;
    },
    reset() {
      hits.clear();
    },
  };
}

export const clientIp = (req) => String(req.headers['x-forwarded-for'] ?? 'local').split(',')[0].trim();
