// 규칙(방마다): rule = { weekly: 주 몇 회, kinds: [{name, min}], coupons: 분기당 쿠폰 }
// 주(월~일) 미달분은 분기 쿠폰으로 자동 차감, 남은 미달 1회당 벌금.
const pad = n => String(n).padStart(2, '0');

export const weekStart = d => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - (x.getDay() + 6) % 7);
  return x;
};
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const quarter = d => `${d.getFullYear()}Q${Math.floor(d.getMonth() / 3)}`;

// 미달 횟수 = max(종류별 최소 못 채운 합, 주 횟수 - 전체 횟수)
export function missing(counts, rule) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const short = rule.kinds.reduce((a, k) => a + Math.max(k.min - (counts[k.name] ?? 0), 0), 0);
  return Math.max(short, rule.weekly - total, 0);
}

// "유산소 1, 근력 2" → [{name:'유산소',min:1},{name:'근력',min:2}]
export function parseKinds(text) {
  return text.split(',').map(s => s.trim()).filter(Boolean).map(s => {
    const m = s.match(/^(.+?)\s*(\d+)?$/);
    return { name: m[1].trim().slice(0, 12), min: +(m[2] ?? 0) };
  });
}
export const kindsText = kinds => kinds.map(k => `${k.name} ${k.min}`).join(', ');

// 끝낸 운동 총 시간(분). 끝 사진 늦게 올린 경우 대비 1회 최대 4시간
export const totalMinutes = ws => Math.round(ws.filter(w => w.ended_at)
  .reduce((a, w) => a + Math.min(new Date(w.ended_at) - new Date(w.created_at), 4 * 3600e3), 0) / 60000);

// 같은 날 운동한 날이 가장 많은 친구 {id, days} 또는 null
export function buddy(myId, ws) {
  const days = id => new Set(ws.filter(w => w.user_id === id && w.end_photo).map(w => dayKey(new Date(w.created_at))));
  const mine = days(myId);
  let best = null;
  for (const id of new Set(ws.map(w => w.user_id))) {
    if (id === myId) continue;
    const n = [...days(id)].filter(d => mine.has(d)).length;
    if (n && (!best || n > best.days)) best = { id, days: n };
  }
  return best;
}

// workouts: 한 사람이 그 방에 올린 승인된 운동 [{kind, created_at}]
export function summarize(workouts, joinedAt, rule, now = new Date()) {
  const byWeek = {};
  for (const w of workouts) {
    const k = dayKey(weekStart(w.created_at));
    const c = (byWeek[k] ??= {});
    c[w.kind] = (c[w.kind] ?? 0) + 1;
  }
  const thisWeek = weekStart(now);
  const used = {};
  let misses = 0;
  const wk = weekStart(joinedAt);
  wk.setDate(wk.getDate() + 7); // 들어온 주는 유예
  for (; wk < thisWeek; wk.setDate(wk.getDate() + 7)) {
    const miss = missing(byWeek[dayKey(wk)] ?? {}, rule);
    const q = quarter(wk);
    const use = Math.min(miss, rule.coupons - (used[q] ?? 0));
    used[q] = (used[q] ?? 0) + use;
    misses += miss - use;
  }
  const counts = byWeek[dayKey(thisWeek)] ?? {};
  return {
    misses,
    couponsLeft: rule.coupons - (used[quarter(thisWeek)] ?? 0),
    week: { counts, left: missing(counts, rule) },
  };
}
