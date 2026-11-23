import assert from 'node:assert';
import { summarize, missing, totalMinutes, buddy } from './rules.js';

assert.equal(missing(0, 3), 1);
assert.equal(missing(2, 1), 0);
assert.equal(missing(0, 1), 2);
assert.equal(missing(1, 5), 0);

const joined = '2026-10-05T12:00:00'; // 월요일 가입, 다음 주부터 계산
const now = new Date('2026-11-25T12:00:00'); // 지난주까지 6주 완료

// 운동 0회: 6주 x 3 = 18 미달, 쿠폰 3개(Q4) 사용, 15회 벌금
assert.deepEqual(summarize([], joined, now), {
  misses: 15, couponsLeft: 0, week: { cardio: 0, strength: 0, left: 3 },
});

// 매주 다 채우고 11/9 주만 유산소 1회: 미달 2, 쿠폰으로 다 덮음
const ws = [];
for (const d of ['10-13', '10-20', '10-27', '11-03', '11-10', '11-17']) {
  ws.push({ kind: 'cardio', created_at: `2026-${d}T10:00:00` });
  if (d !== '11-10') ws.push({ kind: 'strength', created_at: `2026-${d}T11:00:00` }, { kind: 'strength', created_at: `2026-${d}T12:00:00` });
}
ws.push({ kind: 'strength', created_at: '2026-11-24T10:00:00' });
assert.deepEqual(summarize(ws, joined, now), {
  misses: 0, couponsLeft: 1, week: { cardio: 0, strength: 1, left: 2 },
});

assert.equal(totalMinutes([
  { created_at: '2026-11-24T10:00:00', ended_at: '2026-11-24T11:30:00' },
  { created_at: '2026-11-24T10:00:00', ended_at: '2026-11-25T10:00:00' }, // 4시간으로 자름
  { created_at: '2026-11-24T10:00:00' }, // 운동 중은 제외
]), 90 + 240);

const bw = (u, d) => ({ user_id: u, end_photo: 'x', created_at: `2026-11-${d}T10:00:00` });
assert.deepEqual(buddy('me', [bw('me', 24), bw('me', 25), bw('a', 24), bw('b', 24), bw('b', 25), bw('b', 25)]), { id: 'b', days: 2 });
assert.equal(buddy('me', [bw('me', 24), bw('a', 25)]), null);

console.log('ok');
