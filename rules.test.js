import assert from 'node:assert';
import { summarize, missing, totalMinutes, buddy, parseKinds, kindsText } from './rules.js';

const R = { weekly: 3, kinds: [{ name: '유산소', min: 1 }, { name: '근력', min: 2 }], coupons: 3 };
const c = (cardio, strength) => ({ 유산소: cardio, 근력: strength });
assert.equal(missing(c(0, 3), R), 1);
assert.equal(missing(c(2, 1), R), 1); // 근력 2회는 꼭 근력으로
assert.equal(missing(c(0, 1), R), 2);
assert.equal(missing(c(1, 5), R), 0);
assert.equal(missing({ 요가: 3 }, R), 3);
// 종류 제한 없는 방: 아무거나 4회
assert.equal(missing({ 요가: 1, 러닝: 2 }, { weekly: 4, kinds: [], coupons: 0 }), 1);

assert.deepEqual(parseKinds('유산소 1, 근력 2, 요가'), [{ name: '유산소', min: 1 }, { name: '근력', min: 2 }, { name: '요가', min: 0 }]);
assert.equal(kindsText(R.kinds), '유산소 1, 근력 2');

const joined = '2026-10-05T12:00:00'; // 월요일 가입, 다음 주부터 계산
const now = new Date('2026-11-25T12:00:00'); // 지난주까지 6주 완료

// 운동 0회: 6주 x 3 = 18 미달, 쿠폰 3개(Q4) 사용, 15회 벌금
assert.deepEqual(summarize([], joined, R, now), { misses: 15, couponsLeft: 0, week: { counts: {}, left: 3 } });

// 매주 다 채우고 11/9 주만 유산소 1회: 미달 2, 쿠폰으로 다 덮음
const ws = [];
for (const d of ['10-13', '10-20', '10-27', '11-03', '11-10', '11-17']) {
  ws.push({ kind: '유산소', created_at: `2026-${d}T10:00:00` });
  if (d !== '11-10') ws.push({ kind: '근력', created_at: `2026-${d}T11:00:00` }, { kind: '근력', created_at: `2026-${d}T12:00:00` });
}
ws.push({ kind: '근력', created_at: '2026-11-24T10:00:00' });
assert.deepEqual(summarize(ws, joined, R, now), { misses: 0, couponsLeft: 1, week: { counts: { 근력: 1 }, left: 2 } });

assert.equal(totalMinutes([
  { created_at: '2026-11-24T10:00:00', ended_at: '2026-11-24T11:30:00' },
  { created_at: '2026-11-24T10:00:00', ended_at: '2026-11-25T10:00:00' }, // 4시간으로 자름
  { created_at: '2026-11-24T10:00:00' }, // 운동 중은 제외
]), 90 + 240);

const bw = (u, d) => ({ user_id: u, end_photo: 'x', created_at: `2026-11-${d}T10:00:00` });
assert.deepEqual(buddy('me', [bw('me', 24), bw('me', 25), bw('a', 24), bw('b', 24), bw('b', 25), bw('b', 25)]), { id: 'b', days: 2 });
assert.equal(buddy('me', [bw('me', 24), bw('a', 25)]), null);

console.log('ok');
