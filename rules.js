// 규칙: 주(월~일) 3회 = 유산소 1 + 근력 2. 미달분은 분기당 쿠폰 3개로 자동 차감, 남은 미달 1회당 벌금.
const pad = n => String(n).padStart(2, '0');
export const COUPONS_PER_QUARTER = 3;

export const weekStart = d => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - (x.getDay() + 6) % 7);
  return x;
};
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const quarter = d => `${d.getFullYear()}Q${Math.floor(d.getMonth() / 3)}`;

// 근력 대신 유산소 더 한 건 인정, 유산소 대신 근력은 불인정
export const missing = (cardio, strength) => Math.max(1 - cardio, 3 - cardio - strength, 0);

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

// workouts: 한 사람의 승인된 운동 [{kind:'cardio'|'strength', created_at}]
export function summarize(workouts, joinedAt, now = new Date()) {
  const byWeek = {};
  for (const w of workouts) {
    const k = dayKey(weekStart(w.created_at));
    (byWeek[k] ??= { cardio: 0, strength: 0 })[w.kind]++;
  }
  const thisWeek = weekStart(now);
  const used = {};
  let misses = 0;
  const wk = weekStart(joinedAt);
  wk.setDate(wk.getDate() + 7); // 가입한 주는 유예
  for (; wk < thisWeek; wk.setDate(wk.getDate() + 7)) {
    const c = byWeek[dayKey(wk)] ?? { cardio: 0, strength: 0 };
    const miss = missing(c.cardio, c.strength);
    const q = quarter(wk);
    const use = Math.min(miss, COUPONS_PER_QUARTER - (used[q] ?? 0));
    used[q] = (used[q] ?? 0) + use;
    misses += miss - use;
  }
  const cur = byWeek[dayKey(thisWeek)] ?? { cardio: 0, strength: 0 };
  return {
    misses,
    couponsLeft: COUPONS_PER_QUARTER - (used[quarter(thisWeek)] ?? 0),
    week: { ...cur, left: missing(cur.cardio, cur.strength) },
  };
}
