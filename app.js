import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/+esm';
import { summarize, weekStart, totalMinutes, buddy, parseKinds, kindsText } from './rules.js';

// Supabase > Settings > API Keys 의 publishable 키 (브라우저 공개용, RLS로 보호)
const SUPABASE_URL = 'https://ihbwffqdhjhjnwtyytsm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_xM4r7niqDRbcb40AXIMHAg_xjHV0ZXp';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const app = document.getElementById('app');
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const won = n => n.toLocaleString('ko-KR') + '원';
const hhmm = d => new Date(d).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
const dayLabel = d => new Date(d).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD (로컬)
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};

let me, profiles = [], workouts = [], comments = [], notices = [], weights = [], pokes = [], chatMsgs = [],
  rooms = [], members = [], wrs = [], proposals = [], votes = [], reactions = [], canNotice = false;
let roomId = +store.get('roomId') || null;

function toast(t) {
  const el = $('#toast'); el.textContent = t; el.style.display = 'block';
  clearTimeout(toast.t); toast.t = setTimeout(() => el.style.display = 'none', 2500);
}
const prof = id => profiles.find(p => p.id === id);
const nick = id => prof(id)?.nickname ?? '?';
const ava = (p, cls = '') => p?.avatar
  ? `<img class="ava ${cls}" src="${esc(p.avatar)}" alt="">`
  : `<span class="ava ${cls}">${esc((p?.nickname ?? '?')[0])}</span>`;
const who = id => `<a class="who" href="#u/${id}">${ava(prof(id))}<b>${esc(nick(id))}</b></a>`;
const check = r => { if (r.error) throw r.error; return r.data; };
// 버튼 액션 공통: 실패하면 토스트
const act = fn => async e => {
  const b = e?.currentTarget; if (b) b.disabled = true;
  try { await fn(e); } catch (err) { toast(err.message ?? String(err)); } finally { if (b) b.disabled = false; }
};
const onSubmit = (form, fn) => form.onsubmit = e => { e.preventDefault(); act(fn)({ currentTarget: form.querySelector('button:not([type=button])') }); };

// 사진 리사이즈(긴 변 1280) 후 업로드, 공개 URL 반환
async function upload(file) {
  const img = await createImageBitmap(file);
  const s = Math.min(1, 1280 / Math.max(img.width, img.height));
  const c = Object.assign(document.createElement('canvas'), { width: img.width * s, height: img.height * s });
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
  const path = `${me.id}/${crypto.randomUUID()}.jpg`;
  check(await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' }));
  return sb.storage.from('photos').getPublicUrl(path).data.publicUrl;
}
// camera=true: 폰에서 바로 카메라 (운동 인증용), false: 앨범 선택 허용
const pickPhoto = (camera = true) => new Promise(res => {
  const i = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' });
  if (camera) i.setAttribute('capture', 'environment');
  // 화면에 붙여둬야 안드로이드에서 선택 후 change가 확실히 옴
  i.hidden = true; document.body.append(i);
  i.onchange = () => { res(i.files[0]); i.remove(); };
  i.oncancel = () => { res(); i.remove(); }; // 선택창 취소 시 버튼 잠김 방지
  i.click();
});

// ---------- 방 ----------
const room = () => rooms.find(r => r.id === roomId);
const inRoom = (w, r = roomId) => wrs.some(x => x.workout_id === w.id && x.room_id === r);
const roomWs = () => workouts.filter(w => inRoom(w));
const roomMembers = (r = roomId) => members.filter(m => m.room_id === r);
const memberIds = () => roomMembers().map(m => m.user_id);
const statsOf = uid => summarize(roomWs().filter(w => w.user_id === uid && w.approved_by),
  roomMembers().find(m => m.user_id === uid)?.joined_at ?? new Date(), room());
const progress = s => {
  const r = room(), total = Object.values(s.week.counts).reduce((a, b) => a + b, 0);
  return [...r.kinds.filter(k => k.min).map(k => `${esc(k.name)} ${s.week.counts[k.name] ?? 0}/${k.min}`), `전체 ${total}/${r.weekly}`].join(' · ');
};
function setRoom(id) { roomId = id; store.set('roomId', id); }

async function load() {
  const since = d => new Date(Date.now() - d * 864e5).toISOString();
  const res = await Promise.all([
    sb.from('profiles').select('*'),
    sb.from('workouts').select('*').order('created_at', { ascending: false }),
    sb.from('comments').select('*').order('created_at'),
    sb.from('notices').select('*').gte('created_at', since(7)).order('created_at', { ascending: false }),
    sb.from('weights').select('*').order('created_at'),
    sb.from('pokes').select('*').gte('created_at', since(2)).order('created_at', { ascending: false }),
    sb.from('chat').select('*').order('created_at', { ascending: false }).limit(300), // ponytail: 최근 300개만
    sb.from('rooms').select('*').order('created_at'),
    sb.from('room_members').select('*'),
    sb.from('workout_rooms').select('*'),
    sb.from('proposals').select('*').order('created_at', { ascending: false }),
    sb.from('votes').select('*'),
    sb.from('reactions').select('*'),
  ]);
  [profiles, workouts, comments, notices, weights, pokes, chatMsgs, rooms, members, wrs, proposals, votes, reactions] = res.map(check);
  chatMsgs.reverse();
  me = profiles.find(x => x.id === me.id) ?? { id: me.id };
  if (!room()) setRoom(rooms[0]?.id ?? null);
  canNotice = roomId ? check(await sb.rpc('can_notice', { r: roomId })) : false;
}

async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return loginView();
  me = { id: session.user.id };
  await load();
  if (!me.nickname) return nicknameView();
  const code = location.hash.startsWith('#join/') ? location.hash.slice(6) : store.get('joinCode');
  if (code) return joinRoom(code);
  $('#nav').hidden = false;
  route();
  popNotice();
  if (!boot.live) { boot.live = true; subscribeLive(); }
}
async function joinRoom(code) {
  store.set('joinCode', null);
  try {
    const id = check(await sb.rpc('join_room', { code }));
    await load(); setRoom(id);
    toast(`${room()?.name ?? ''} 방에 들어왔어요`);
  } catch (e) { toast(e.message); }
  history.replaceState(null, '', '#home');
  boot();
}

// ---------- 알림 ----------
const seenGet = k => +store.get(k) || 0;
function showPop(label, body, btn, onClose) {
  const el = document.createElement('div');
  el.className = 'pop';
  el.innerHTML = `<div role="dialog" aria-label="알림"><p class="muted">${label}</p><p class="body">${body}</p><button>${btn}</button></div>`;
  el.querySelector('button').onclick = () => { el.remove(); onClose(); };
  document.body.append(el);
}
// 😈: 화면 전체를 덮었다가 스르르 사라짐 (누르면 바로 넘김)
function showCover(from, body, onClose) {
  const el = document.createElement('div');
  el.className = 'cover'; el.setAttribute('role', 'alert');
  el.innerHTML = `<p class="from">${from}</p><p class="body">${body}</p><p class="skip">누르면 넘어가요</p>`;
  let done = false;
  const close = () => { if (done) return; done = true; el.remove(); onClose(); };
  el.onanimationend = close; el.onclick = close;
  document.body.append(el);
}
// 안 본 😈(내 방들 모두, 보낸 사람 제외) 먼저, 없으면 나를 찌른 콕
function popNotice() {
  const n = notices.find(n => n.id > seenGet('seenNotice') && n.user_id !== me.id);
  if (n) {
    const rn = rooms.find(r => r.id === n.room_id)?.name;
    return showCover(`😈 ${esc(nick(n.user_id))} → ${n.target ? (n.target === me.id ? '너' : esc(nick(n.target))) : '전체'}${rooms.length > 1 ? ` · ${esc(rn)}` : ''}`,
      esc(n.body), () => { store.set('seenNotice', notices[0].id); popNotice(); });
  }
  const mine = pokes.filter(p => p.to_id === me.id && p.id > seenGet('seenPoke'));
  if (mine.length) showPop(`👉 ${mine.map(p => esc(nick(p.from_id))).join(', ')}`, '운동하래요', '운동하러 가기',
    () => { store.set('seenPoke', mine[0].id); location.hash = 'go'; });
}

function noticeSection() {
  const list = notices.filter(n => n.room_id === roomId);
  return `<div class="card"><h2>😈</h2>
    ${list.slice(0, 5).map(n => `<div class="notice"><span class="muted">${esc(nick(n.user_id))} → <span class="to">${n.target ? esc(nick(n.target)) : '전체'}</span> · ${hhmm(n.created_at)}</span>
      <p class="body">${esc(n.body)}</p>${n.user_id === me.id ? `<button class="x" data-del="${n.id}" aria-label="지우기">✕</button>` : ''}</div>`).join('') || '<p class="muted">이번 주 조용하네</p>'}
    ${canNotice ? `<form id="noticeForm" style="margin-top:10px">
        <select id="nTarget" aria-label="받는 사람"><option value="">전체</option>${memberIds().filter(id => id !== me.id).map(id => `<option value="${id}">${esc(nick(id))}</option>`).join('')}</select>
        <input id="nBody" maxlength="80" placeholder="예: 에몽가 돼지 공부좀 해라 ㅋㅋ" required>
        <button class="ghost">😈</button></form>`
      : '<p class="muted">지난주 이 방 규칙 채운 사람만 쓸 수 있어요. 억울하면 운동하기</p>'}</div>`;
}
function bindNotice(rerender) {
  app.querySelectorAll('[data-del]').forEach(x => x.onclick = act(async () => {
    check(await sb.from('notices').delete().eq('id', +x.dataset.del)); await load(); rerender(); toast('지웠어요');
  }));
  const f = $('#noticeForm'); if (!f) return;
  onSubmit(f, async () => {
    check(await sb.from('notices').insert({ room_id: roomId, target: $('#nTarget').value || null, body: $('#nBody').value.trim() }));
    await load(); rerender(); toast('😈');
  });
}

// ---------- 로그인 ----------
function loginView() {
  $('#nav').hidden = true;
  if (location.hash.startsWith('#join/')) store.set('joinCode', location.hash.slice(6));
  app.innerHTML = `<h1 style="text-align:center;font-size:44px;margin-top:40px">오운완 💪</h1>
    <p class="muted" style="text-align:center;margin-top:-8px">${store.get('joinCode') ? '초대받았어요. 로그인하거나 가입하면 바로 방에 들어가요' : '주 3회, 같이 운동하자'}</p>
    <form class="card" id="loginForm">
    <input id="email" type="email" placeholder="이메일" autocomplete="email" required>
    <input id="pw" type="password" placeholder="비밀번호 (6자 이상)" autocomplete="current-password" required>
    <button id="login">로그인</button><p></p>
    <button type="button" class="ghost" id="signup">회원가입</button>
    <p class="muted" style="text-align:center">비밀번호를 잊었으면 관리자에게 말해주세요. 임시 비밀번호로 바꿔줘요.</p></form>`;
  const cred = () => ({ email: $('#email').value.trim(), password: $('#pw').value });
  onSubmit($('#loginForm'), async () => { check(await sb.auth.signInWithPassword(cred())); await boot(); });
  $('#signup').onclick = act(async () => {
    const r = check(await sb.auth.signUp(cred()));
    if (!r.session) throw new Error('Supabase에서 이메일 인증(Confirm email)을 꺼주세요');
    await boot();
  });
}

function nicknameView() {
  app.innerHTML = `<h1>닉네임 정하기</h1><div class="card">
    <input id="nick" placeholder="닉네임" maxlength="12"><button id="save">시작하기</button></div>`;
  $('#save').onclick = act(async () => {
    const nickname = $('#nick').value.trim();
    if (!nickname) throw new Error('닉네임을 입력해주세요');
    check(await sb.from('profiles').insert({ id: me.id, nickname }));
    await boot();
  });
}

function route() {
  const page = location.hash.slice(1) || 'home';
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('on', a.hash === '#' + page));
  if (!room() && page !== 'me') return roomPage();
  if (page.startsWith('u/')) return profile(page.slice(2));
  ({ home, go, feed, members: membersPage, me: mePage, room: roomPage }[page] ?? home)();
}
window.onhashchange = () => location.hash.startsWith('#join/') ? joinRoom(location.hash.slice(6)) : route();

// 상단 방 선택
function roomBar() {
  return `<div class="roombar"><select id="roomSel" aria-label="방 선택">${rooms.map(r => `<option value="${r.id}" ${r.id === roomId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
    <a class="tag" href="#room">방 설정</a></div>`;
}
function bindRoomBar(rerender) {
  const s = $('#roomSel'); if (!s) return;
  s.onchange = act(async () => { setRoom(+s.value); await load(); rerender(); });
}

// ---------- 홈 ----------
// 몸무게 꺾은선 그래프 (목표는 점선)
function spark(vals, target) {
  const all = target ? [...vals, target] : vals;
  const min = Math.min(...all) - 1, max = Math.max(...all) + 1;
  const x = i => vals.length === 1 ? 150 : 12 + i * 276 / (vals.length - 1);
  const y = v => 64 - (v - min) / (max - min) * 54;
  return `<svg viewBox="0 0 300 74" class="spark" role="img" aria-label="몸무게 변화 그래프">
    ${target ? `<line x1="0" x2="300" y1="${y(target)}" y2="${y(target)}" stroke="#ff8fab" stroke-width="2" stroke-dasharray="5 5"/>` : ''}
    <polyline points="${vals.map((v, i) => `${x(i)},${y(v)}`).join(' ')}" fill="none" stroke="#a98bf5" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${vals.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="4.5" fill="#fff" stroke="#a98bf5" stroke-width="2.5"/>`).join('')}</svg>`;
}
const ongoingOf = id => workouts.find(w => w.user_id === id && !w.end_photo && new Date(w.created_at) >= weekStart(new Date()));

// 홈 = 개요 (게임 로비 느낌), 맨 아래 "운동하러 가기"
function home() {
  const r = room(), s = statsOf(me.id), rws = roomWs();
  const mineAll = workouts.filter(w => w.user_id === me.id);
  const done = mineAll.filter(w => w.approved_by).length;
  const mins = totalMinutes(mineAll);
  const kg = weights.filter(w => w.user_id === me.id).map(w => +w.kg);
  const target = me.target_weight ? +me.target_weight : null;
  const bud = buddy(me.id, rws);
  const toApprove = rws.filter(w => w.user_id !== me.id && w.end_photo && !w.approved_by).length;
  const friends = memberIds().filter(id => id !== me.id).map(id => ({ id, left: statsOf(id).week.left }));
  const poked = id => pokes.some(k => k.from_id === me.id && k.to_id === id && k.day === today());
  const diff = kg.length > 1 ? +(kg.at(-1) - kg[0]).toFixed(1) : 0;
  app.innerHTML = `${roomBar()}<h1 class="who">${ava(me)}${esc(me.nickname)}, 오운완?</h1>
    <div class="card"><h2>이번 주</h2>
      <div class="big">${s.week.left ? `${s.week.left}회 남았어요` : '완료 🎉'}</div>
      <p class="muted">${progress(s)} · 쿠폰 ${s.couponsLeft}/${r.coupons}${s.misses ? ` · <span class="warn">벌금 ${won(s.misses * r.fine)}</span>` : ''}</p></div>
    <div class="card"><h2>몸무게</h2>${kg.length
      ? `<div class="row"><div><span class="muted">처음</span><b class="jua kg">${kg[0]}kg</b></div><span class="muted">→</span>
         <div><span class="muted">지금</span><b class="jua kg">${kg.at(-1)}kg</b></div>
         <span class="tag">${diff > 0 ? '+' : ''}${diff}kg</span></div>${spark(kg, target)}
         ${target ? `<p class="muted" style="margin:0">분홍 점선 = 목표 ${target}kg</p>` : ''}`
      : `<p class="muted">내 정보에서 현재 몸무게 넣으면 그래프 생겨요</p>`}</div>
    <div class="grid3 card">
      <div><b>${done}회</b><span class="muted">운동 횟수</span></div>
      <div><b>${mins >= 60 ? `${Math.floor(mins / 60)}시간 ` : ''}${mins % 60}분</b><span class="muted">운동 시간</span></div>
      <div><b>${toApprove}</b><span class="muted">확인 요청</span></div>
    </div>
    ${toApprove ? `<button class="yel" onclick="location.hash='feed'">친구 인증 확인하러 가기 👀</button><p></p>` : ''}
    <div class="card"><h2>같이 운동 많이 한 친구</h2>${bud
      ? `<div class="row">${who(bud.id)}<span class="tag">${bud.days}일 같이 🔥</span></div>`
      : '<p class="muted">같은 날 운동하면 여기 떠요</p>'}</div>
    <div class="card"><h2>친구 운동시키기</h2>
      ${friends.map(({ id, left }) => `<div class="row" style="padding:6px 0">${who(id)}
        ${left ? `<button class="small ${poked(id) ? 'ghost' : 'yel'}" data-poke="${id}" ${poked(id) ? 'disabled' : ''}>${poked(id) ? '오늘 찔렀음' : `👉 콕 (${left}회 남음)`}</button>`
          : '<span class="ok">이번 주 완료</span>'}</div>`).join('') || '<p class="muted">아직 혼자예요. 방 설정에서 초대 링크 보내요</p>'}</div>
    ${noticeSection()}
    <a class="cta" href="#go">${ongoingOf(me.id) ? '운동 끝내러 가기' : '운동하러 가기'}</a>`;
  bindRoomBar(home);
  bindNotice(home);
  app.querySelectorAll('[data-poke]').forEach(b => b.onclick = act(async () => {
    const res = await sb.from('pokes').insert({ to_id: b.dataset.poke });
    if (res.error?.code === '23505') throw new Error('오늘은 이미 찔렀어요');
    check(res); await load(); home(); toast(`${nick(b.dataset.poke)} 찔렀어요`);
  }));
}

// ---------- 운동 시작 → 끝 사진 ----------
function go() {
  const ongoing = ongoingOf(me.id);
  const kinds = [...new Set(rooms.flatMap(r => r.kinds.map(k => k.name)))];
  const sharedTo = w => rooms.filter(r => inRoom(w, r.id)).map(r => esc(r.name)).join(', ');
  app.innerHTML = `<h1>운동하러 가기</h1>
    <div class="card">${ongoing
      ? `<h2>운동 중 (${esc(ongoing.kind)}) · ${hhmm(ongoing.created_at)} 시작</h2>
         <p class="muted">공유: ${sharedTo(ongoing)}</p>
         <div class="pics"><img src="${esc(ongoing.start_photo)}" alt="시작 사진"><div>끝 사진</div></div>
         <button id="finish">운동 끝 사진 찍기 📸</button><p></p><button class="ghost small" id="cancel">취소</button>`
      : `<h2>운동 종류</h2><select id="kind">${[...kinds, '기타'].map(k => `<option>${esc(k)}</option>`).join('')}</select>
         <h2>올릴 방</h2>${rooms.map(r => `<label class="chk"><input type="checkbox" value="${r.id}" checked> ${esc(r.name)}
           <span class="muted">${esc(kindsText(r.kinds.filter(k => k.min)) || '종류 자유')} · 주 ${r.weekly}회</span></label>`).join('')}
         <p></p><button id="start">시작 사진 찍기 📸</button>`}</div>`;
  if (ongoing) {
    $('#finish').onclick = act(async () => {
      const f = await pickPhoto(); if (!f) return;
      toast('올리는 중…');
      check(await sb.from('workouts').update({ end_photo: await upload(f), ended_at: new Date().toISOString() }).eq('id', ongoing.id));
      await load(); toast('인증 완료! 친구 확인 기다리는 중'); location.hash = 'home';
    });
    $('#cancel').onclick = act(async () => {
      check(await sb.from('workouts').delete().eq('id', ongoing.id)); await load(); go();
    });
  } else {
    $('#start').onclick = act(async () => {
      const ids = [...app.querySelectorAll('.chk input:checked')].map(i => +i.value);
      if (!ids.length) throw new Error('올릴 방을 하나 이상 골라요');
      const kind = $('#kind').value, f = await pickPhoto(); if (!f) return;
      toast('올리는 중…');
      const w = check(await sb.from('workouts').insert({ kind, start_photo: await upload(f) }).select().single());
      check(await sb.from('workout_rooms').insert(ids.map(room_id => ({ workout_id: w.id, room_id }))));
      toast('화이팅! 끝나면 끝 사진 찍기'); await load(); go();
    });
  }
}

// ---------- 단체방: 로그 / 채팅 ----------
// 운동 사진 이모지 반응 (누르면 토글, 길게 누르면 누가 눌렀는지)
const EMOJIS = ['🔥', '💪', '😂', '👍', '🤮'];
function rxBar(w, end) {
  const rs = reactions.filter(r => r.workout_id === w.id && r.photo_end === end);
  return `<div class="rx">${EMOJIS.map(e => {
    const who_ = rs.filter(r => r.emoji === e), mine = who_.some(r => r.user_id === me.id);
    return `<button class="rxb ${mine ? 'on' : ''}" data-rx="${w.id}:${end ? 1 : 0}:${e}" title="${esc(who_.map(r => nick(r.user_id)).join(', '))}">${e}${who_.length ? ` <b>${who_.length}</b>` : ''}</button>`;
  }).join('')}</div>`;
}
function bindRx() {
  app.querySelectorAll('[data-rx]').forEach(b => b.onclick = act(async () => {
    const [id, end, emoji] = b.dataset.rx.split(':');
    const row = { workout_id: +id, photo_end: end === '1', emoji };
    const mine = reactions.some(r => r.workout_id === row.workout_id && r.photo_end === row.photo_end && r.emoji === emoji && r.user_id === me.id);
    check(mine ? await sb.from('reactions').delete().match({ ...row, user_id: me.id }) : await sb.from('reactions').insert(row));
    const y = window.scrollY; await load(); feed(); window.scrollTo(0, y);
  }));
}

// 시작/끝 사진 한 장 = 스냅 카드 한 장
function snap(w, end) {
  const t = end ? (w.ended_at ?? w.created_at) : w.created_at;
  return `<article class="snap ${end ? 'r' : 'l'}"><img src="${esc(photoOf(w, end))}" loading="lazy" alt="">
    <div class="ov"><span class="nm">${ava(prof(w.user_id), 'sm')}${esc(nick(w.user_id))}</span>
      <b class="tm">${hhmm(t)}</b><span class="cap">${esc(w.kind)} ${end ? '끝 🔥' : '시작 💪'}</span></div>
    ${!end && !w.end_photo ? '<span class="badge">운동 중…</span>' : ''}
    <button class="rp" data-reply="${w.id}:${end ? 1 : 0}" aria-label="이 사진에 답장">↩</button></article>`;
}
const photoOf = (w, end) => end ? w.end_photo : w.start_photo;

let feedMode = store.get('feedMode') || 'log';
let replyTo = null; // {w, end}
function feed() {
  const seg = `<div class="seg"><button class="${feedMode === 'log' ? 'on' : ''}" data-mode="log">로그</button><button class="${feedMode === 'chat' ? 'on' : ''}" data-mode="chat">채팅</button></div>`;
  feedMode === 'chat' ? chatView(roomBar() + seg) : logView(roomBar() + seg);
  bindRoomBar(feed);
  bindRx();
  app.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { feedMode = b.dataset.mode; store.set('feedMode', feedMode); feed(); });
  app.querySelectorAll('[data-reply]').forEach(b => b.onclick = () => {
    const [id, end] = b.dataset.reply.split(':');
    replyTo = { w: workouts.find(w => w.id === +id), end: end === '1' };
    feedMode = 'chat'; feed(); $('#chatIn')?.focus();
  });
}

function chatView(top) {
  // 이 방에 올린 운동 사진(시작/끝)은 자동으로 채팅에 사진 메시지로 섞임
  const ev = [
    ...roomWs().slice(0, 40).flatMap(w => [
      { t: w.created_at, uid: w.user_id, w, end: false },
      ...(w.end_photo ? [{ t: w.ended_at ?? w.created_at, uid: w.user_id, w, end: true }] : []),
    ]),
    ...chatMsgs.filter(m => m.room_id === roomId).map(m => ({ t: m.created_at, uid: m.user_id, m })),
  ].sort((a, b) => new Date(a.t) - new Date(b.t));
  let lastDay = '', html = top + '<div class="chat">';
  for (const e of ev) {
    const d = dayLabel(e.t);
    if (d !== lastDay) { html += `<div class="day">${d}</div>`; lastDay = d; }
    const mine = e.uid === me.id;
    let inner;
    if (e.w) {
      inner = `<div class="ph"><img src="${esc(photoOf(e.w, e.end))}" loading="lazy" alt="${esc(e.w.kind)} 사진"><span>${esc(e.w.kind)} ${e.end ? '끝' : '시작'}</span>
        <button class="rp" data-reply="${e.w.id}:${e.end ? 1 : 0}" aria-label="이 사진에 답장">↩</button></div>${rxBar(e.w, e.end)}`;
    } else {
      const rw = e.m.workout_id && workouts.find(w => w.id === e.m.workout_id);
      inner = `<div class="bub">${rw ? `<div class="quote"><img src="${esc(photoOf(rw, e.m.photo_end))}" alt=""><span>${esc(nick(rw.user_id))} ${esc(rw.kind)} ${e.m.photo_end ? '끝' : '시작'}</span></div>` : ''}${e.m.body ? esc(e.m.body) : ''}${e.m.photo ? `<img class="cimg" src="${esc(e.m.photo)}" loading="lazy" alt="보낸 사진">` : ''}</div>`;
    }
    html += `<div class="msg ${mine ? 'mine' : ''}">${mine ? '' : ava(prof(e.uid), 'sm')}
      <div>${mine ? '' : `<p class="who-s">${esc(nick(e.uid))}</p>`}${inner}</div><span class="time">${hhmm(e.t)}</span></div>`;
  }
  html += `</div><form class="chatbar" id="chatForm">
    ${replyTo ? `<div class="replying"><img src="${esc(photoOf(replyTo.w, replyTo.end))}" alt="">${esc(nick(replyTo.w.user_id))} 사진에 답장<button type="button" class="x" id="noReply" aria-label="답장 취소">✕</button></div>` : ''}
    <div class="row"><button type="button" class="ghost pic" id="chatPic" aria-label="사진 보내기">📷</button><input id="chatIn" maxlength="300" placeholder="메시지" autocomplete="off" required><button aria-label="보내기">↑</button></div></form>`;
  app.innerHTML = html;
  window.scrollTo(0, document.body.scrollHeight);
  $('#noReply') && ($('#noReply').onclick = () => { replyTo = null; feed(); });
  // 사진 보내기 (앨범/카메라). 입력창에 쓴 글이 있으면 같이 보냄
  $('#chatPic').onclick = act(async () => {
    const f = await pickPhoto(false); if (!f) return;
    toast('올리는 중…');
    const body = $('#chatIn').value.trim() || null;
    check(await sb.from('chat').insert({ room_id: roomId, body, photo: await upload(f), workout_id: replyTo?.w.id ?? null, photo_end: replyTo ? replyTo.end : null }));
    replyTo = null; await load(); feed();
  });
  onSubmit($('#chatForm'), async () => {
    const body = $('#chatIn').value.trim(); if (!body) return;
    check(await sb.from('chat').insert({ room_id: roomId, body, workout_id: replyTo?.w.id ?? null, photo_end: replyTo ? replyTo.end : null }));
    replyTo = null; await load(); feed(); $('#chatIn')?.focus();
  });
}

// 새 채팅/운동 사진 실시간 반영 (단체방 보고 있을 때만 다시 그림, 쓰던 글은 유지)
function subscribeLive() {
  sb.channel('live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat' }, refreshLive)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workouts' }, refreshLive)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, refreshLive)
    .subscribe();
}
async function refreshLive() {
  await load();
  if (location.hash !== '#feed') return;
  const draft = $('#chatIn')?.value, focused = document.activeElement?.id === 'chatIn';
  feed();
  if (draft && $('#chatIn')) $('#chatIn').value = draft;
  if (focused) $('#chatIn')?.focus();
}
// 끝 카드 아래: 확인(👍) + 한마디
function reactBox(w) {
  const cs = comments.filter(c => c.workout_id === w.id);
  return `<div class="react">
    ${!w.end_photo ? `<p class="muted">운동 중… 끝 사진 올라오면 확인 가능</p>`
      : w.approved_by ? `<p class="ok"><b>👍 ${esc(nick(w.approved_by))} 확인 완료</b></p>`
      : w.user_id === me.id ? `<p class="muted">친구 확인 기다리는 중…</p>`
      : `<button class="yel small" data-ok="${w.id}">👍 확인해주기</button>`}
    ${cs.map(c => `<p><b>${esc(nick(c.user_id))}</b> ${esc(c.body)}</p>`).join('')}
    <form data-cmt="${w.id}"><input maxlength="60" placeholder="한마디 남기기" required><button>↑</button></form></div>`;
}

function logView(top) {
  // ponytail: 최근 30개 운동만, 무한 스크롤은 필요해지면
  const ev = roomWs().slice(0, 30).flatMap(w => [
    { w, end: false, t: w.created_at },
    ...(w.end_photo ? [{ w, end: true, t: w.ended_at ?? w.created_at }] : []),
  ]).sort((a, b) => new Date(b.t) - new Date(a.t));
  let lastDay = '', html = top;
  for (const e of ev) {
    const d = dayLabel(e.t);
    if (d !== lastDay) { html += `<div class="day">${d}</div>`; lastDay = d; }
    // 끝 카드 밑에 반응, 아직 운동 중이면 시작 카드 밑에
    html += snap(e.w, e.end) + rxBar(e.w, e.end) + (e.end || !e.w.end_photo ? reactBox(e.w) : '<div style="height:10px"></div>');
  }
  app.innerHTML = ev.length ? html : html + '<p class="muted">아직 인증이 없어요. 첫 오운완 올려봐요!</p>';
  app.querySelectorAll('[data-ok]').forEach(b => b.onclick = act(async () => {
    check(await sb.rpc('approve', { wid: +b.dataset.ok })); await load(); feed();
  }));
  app.querySelectorAll('[data-cmt]').forEach(f => onSubmit(f, async () => {
    check(await sb.from('comments').insert({ workout_id: +f.dataset.cmt, body: f.querySelector('input').value.trim() }));
    await load(); feed();
  }));
}

// ---------- 사람 ----------
function profile(id) {
  const p = prof(id), r = room();
  if (!p) return home();
  const s = statsOf(id);
  const done = roomWs().filter(w => w.user_id === id && w.end_photo);
  const showW = id === me.id || r.show_weight;
  app.innerHTML = `<div class="card" style="text-align:center">${ava(p, 'lg')}
      <h1 style="margin:8px 0 4px">${esc(p.nickname)}</h1>
      <p class="muted">${!showW ? '이 방은 몸무게 비공개' : p.current_weight ? `${p.current_weight}kg${p.target_weight ? ` → 목표 ${p.target_weight}kg` : ''}` : '체중 미입력'}</p>
      <div class="grid3" style="margin-top:12px">
        <div><b>${s.week.left ? s.week.left + '회' : '완료'}</b><span class="muted">이번 주 남음</span></div>
        <div><b>${done.length}</b><span class="muted">이 방 인증</span></div>
        <div><b class="${s.misses ? 'warn' : ''}">${won(s.misses * r.fine)}</b><span class="muted">벌금</span></div>
      </div></div>
    <h2>인증 기록 · ${esc(r.name)}</h2>
    <div class="tiles">${done.map(w => `<div class="tile"><img src="${esc(w.end_photo)}" loading="lazy" alt="">
      <span>${new Date(w.created_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })} ${esc(w.kind)} ${w.approved_by ? '✓' : ''}</span></div>`).join('')
      || '<p class="muted">아직 기록이 없어요</p>'}</div>`;
}

function membersPage() {
  const r = room();
  const rows = memberIds().map(id => ({ id, s: statsOf(id) }));
  const pot = rows.reduce((a, x) => a + x.s.misses * r.fine, 0);
  app.innerHTML = `${roomBar()}<h1>멤버</h1>
    <div class="card"><h2>벌금통</h2><div class="big">${won(pot)}</div><p class="muted">미달 1회당 ${won(r.fine)}</p></div>
    ${rows.map(({ id, s }) => `<div class="card"><div class="row">${who(id)}${id === r.owner ? '<span class="tag">방장</span>' : ''}
      <span class="${s.week.left ? '' : 'ok'}">${s.week.left ? `이번 주 ${s.week.left}회 남음` : '이번 주 완료 🎉'}</span></div>
      <p class="muted">${progress(s)} · 쿠폰 ${s.couponsLeft}/${r.coupons} · 벌금 <span class="${s.misses ? 'warn' : ''}">${won(s.misses * r.fine)}</span></p></div>`).join('')}
    ${me.is_admin ? `<div class="card"><h2>관리자: 비밀번호 초기화</h2>
      <select id="resetWho">${profiles.map(p => `<option value="${p.id}">${esc(p.nickname)}</option>`).join('')}</select>
      <input id="resetPw" placeholder="임시 비밀번호 (6자 이상)" autocomplete="off">
      <button id="resetBtn">초기화</button></div>` : ''}`;
  bindRoomBar(membersPage);
  if (me.is_admin) $('#resetBtn').onclick = act(async () => {
    check(await sb.rpc('admin_reset_password', { uid: $('#resetWho').value, pw: $('#resetPw').value }));
    $('#resetPw').value = ''; toast('바꿨어요. 임시 비밀번호 알려주세요');
  });
}

// ---------- 방 설정: 초대, 규칙 투표, 방 만들기/들어가기 ----------
const ruleFields = (r = {}) => `
  <label>주 몇 회</label><input name="weekly" type="number" min="1" max="14" value="${r.weekly ?? 3}" required>
  <label>운동 종류와 최소 횟수 (쉼표로)</label><input name="kinds" value="${esc(kindsText(r.kinds ?? [{ name: '유산소', min: 1 }, { name: '근력', min: 2 }]))}" placeholder="예: 유산소 1, 근력 2, 요가">
  <label>분기당 쿠폰</label><input name="coupons" type="number" min="0" max="30" value="${r.coupons ?? 3}" required>
  <label>미달 1회당 벌금 (원)</label><input name="fine" type="number" min="0" step="1000" value="${r.fine ?? 10000}" required>
  <label class="chk"><input name="show_weight" type="checkbox" ${r.show_weight ?? true ? 'checked' : ''}> 몸무게·목표 공개</label>`;
function readRules(f) {
  const v = n => f.elements[n];
  const out = { weekly: +v('weekly').value, kinds: parseKinds(v('kinds').value), coupons: +v('coupons').value, fine: +v('fine').value, show_weight: v('show_weight').checked };
  if (out.kinds.reduce((a, k) => a + k.min, 0) > out.weekly) throw new Error('종류별 최소 횟수 합이 주 횟수보다 많아요');
  return out;
}
const describe = ch => [
  ch.name && `이름 → ${esc(ch.name)}`, ch.weekly && `주 ${ch.weekly}회`, ch.kinds && `종류 ${esc(kindsText(ch.kinds)) || '자유'}`,
  ch.coupons != null && `쿠폰 ${ch.coupons}개`, ch.fine != null && `벌금 ${won(ch.fine)}`, ch.show_weight != null && `몸무게 ${ch.show_weight ? '공개' : '비공개'}`,
].filter(Boolean).join(' · ');

function roomPage() {
  const r = room();
  const link = r && `${location.origin}${location.pathname}#join/${r.invite_code}`;
  const mcount = r ? roomMembers().length : 0;
  const props = r ? proposals.filter(p => p.room_id === r.id).slice(0, 6) : [];
  app.innerHTML = `${r ? roomBar() : ''}<h1>${r ? esc(r.name) : '방이 없어요'}</h1>
    ${r ? `<div class="card"><h2>초대 링크</h2><p class="muted" style="word-break:break-all">${esc(link)}</p>
      <button class="yel" id="copy">링크 복사</button></div>
    <div class="card"><h2>지금 규칙</h2><p>${describe({ weekly: r.weekly, kinds: r.kinds, coupons: r.coupons, fine: r.fine, show_weight: r.show_weight })}</p>
      <p class="muted">바꾸려면 아래에서 제안 → 멤버 ${mcount}명 중 과반수(${Math.floor(mcount / 2) + 1}명) 찬성하면 바로 적용</p></div>
    ${props.map(p => {
      const vs = votes.filter(v => v.proposal_id === p.id), my = vs.find(v => v.user_id === me.id);
      return `<div class="card"><div class="row"><b>${esc(nick(p.proposer))}의 제안</b><span class="tag">${{ open: '투표 중', applied: '적용됨', rejected: '기각' }[p.status]}</span></div>
        <p>${describe(p.changes)}</p><p class="muted">찬성 ${vs.filter(v => v.yes).length} · 반대 ${vs.filter(v => !v.yes).length} / ${mcount}명${my ? ` · 나는 ${my.yes ? '찬성' : '반대'}` : ''}</p>
        ${p.status === 'open' ? `<div class="row"><button class="small" data-vote="${p.id}:1">찬성</button><button class="small ghost" data-vote="${p.id}:0">반대</button></div>` : ''}</div>`;
    }).join('')}
    <details class="card"><summary><b>규칙 바꾸자고 하기</b></summary><form id="propForm" style="margin-top:10px">
      <label>방 이름</label><input name="name" value="${esc(r.name)}" maxlength="20">${ruleFields(r)}<button>제안하기</button></form></details>
    <button class="ghost small" id="leave">이 방 나가기</button><p></p>` : ''}
    <details class="card" ${r ? '' : 'open'}><summary><b>새 방 만들기</b></summary><form id="newForm" style="margin-top:10px">
      <label>방 이름</label><input name="name" maxlength="20" placeholder="예: 헬스방" required>${ruleFields()}
      <p class="muted">만든 뒤 규칙 변경은 과반수 동의가 필요해요</p><button>만들기</button></form></details>
    <details class="card" ${r ? '' : 'open'}><summary><b>초대 코드로 들어가기</b></summary><form id="joinForm" style="margin-top:10px">
      <input name="code" placeholder="초대 링크나 코드 붙여넣기" required><button>들어가기</button></form></details>`;
  bindRoomBar(roomPage);
  if (r) {
    $('#copy').onclick = act(async () => {
      try { await navigator.clipboard.writeText(link); toast('복사했어요. 단톡에 붙여넣기'); }
      catch { toast('복사 안 되면 위 링크 길게 눌러서 복사'); }
    });
    app.querySelectorAll('[data-vote]').forEach(b => b.onclick = act(async () => {
      const [pid, yes] = b.dataset.vote.split(':');
      const st = check(await sb.rpc('vote', { pid: +pid, agree: yes === '1' }));
      await load(); roomPage(); toast({ applied: '과반수 찬성. 바로 적용됐어요', rejected: '과반수 반대로 기각', open: '투표했어요' }[st]);
    }));
    onSubmit($('#propForm'), async () => {
      const f = $('#propForm'), next = { name: f.elements.name.value.trim(), ...readRules(f) };
      const ch = {};
      for (const k in next) if (JSON.stringify(next[k]) !== JSON.stringify(r[k])) ch[k] = next[k];
      if (!Object.keys(ch).length) throw new Error('바뀐 게 없어요');
      const st = check(await sb.rpc('propose', { r: r.id, ch }));
      await load(); roomPage(); toast(st === 'applied' ? '바로 적용됐어요' : '제안 올렸어요. 투표 기다리는 중');
    });
    $('#leave').onclick = act(async () => {
      if ($('#leave').dataset.sure !== '1') { $('#leave').dataset.sure = '1'; $('#leave').textContent = '진짜 나가기 (한 번 더 누르기)'; return; }
      check(await sb.from('room_members').delete().eq('room_id', r.id).eq('user_id', me.id));
      setRoom(null); await load(); location.hash = 'room'; roomPage(); toast('나갔어요');
    });
  }
  onSubmit($('#newForm'), async () => {
    const f = $('#newForm'), x = readRules(f);
    const id = check(await sb.rpc('create_room', { p_name: f.elements.name.value.trim(), p_weekly: x.weekly, p_kinds: x.kinds, p_coupons: x.coupons, p_fine: x.fine, p_show: x.show_weight }));
    setRoom(id); await load(); $('#nav').hidden = false; location.hash = 'room'; roomPage(); toast('방 만들었어요. 초대 링크 보내요');
  });
  onSubmit($('#joinForm'), async () => {
    const v = $('#joinForm').elements.code.value.trim();
    await joinRoom(v.includes('#join/') ? v.split('#join/')[1] : v);
  });
}

// ---------- 내 정보 ----------
function mePage() {
  app.innerHTML = `<h1>내 정보</h1><div class="card">
    <div style="text-align:center;margin-bottom:12px">${ava(me, 'lg')}<p></p>
      <button class="ghost small" id="avatar">프로필 사진 바꾸기</button>
      ${room() ? `<a class="muted" href="#u/${me.id}" style="display:block;margin-top:10px">내 인증 기록 보기 →</a>` : ''}</div>
    <label>닉네임</label><input id="nick" value="${esc(me.nickname)}" maxlength="12">
    <label>목표 체중 (kg)</label><input id="tw" type="number" step="0.1" value="${me.target_weight ?? ''}">
    <label>현재 체중 (kg)</label><input id="cw" type="number" step="0.1" value="${me.current_weight ?? ''}">
    <label>체중계 사진</label>
    ${me.weight_photo ? `<img src="${esc(me.weight_photo)}" style="width:100%;border-radius:14px;margin-bottom:10px">` : ''}
    <button class="ghost" id="wphoto">체중계 사진 찍기</button><p></p>
    <button id="save">저장</button></div>
    <div class="card"><h2>비밀번호 변경</h2>
      <input id="newPw" type="password" placeholder="새 비밀번호 (6자 이상)" autocomplete="new-password">
      <button class="ghost" id="changePw">변경</button></div>
    <button class="ghost" id="logout">로그아웃</button>`;
  const num = v => v === '' ? null : +v;
  $('#avatar').onclick = act(async () => {
    const f = await pickPhoto(false); if (!f) return;
    toast('올리는 중…');
    const r = check(await sb.from('profiles').update({ avatar: await upload(f) }).eq('id', me.id).select('id'));
    if (!r.length) throw new Error('프사 저장 실패. 다시 로그인해봐요');
    await load(); mePage();
  });
  $('#wphoto').onclick = act(async () => {
    const f = await pickPhoto(); if (!f) return;
    toast('올리는 중…');
    check(await sb.from('profiles').update({ weight_photo: await upload(f) }).eq('id', me.id));
    await load(); mePage();
  });
  $('#save').onclick = act(async () => {
    const cw = num($('#cw').value);
    check(await sb.from('profiles').update({ nickname: $('#nick').value.trim() || me.nickname, target_weight: num($('#tw').value), current_weight: cw }).eq('id', me.id));
    // 몸무게 바뀌면 그래프용 기록 추가
    if (cw && cw !== +me.current_weight) check(await sb.from('weights').insert({ kg: cw }));
    await load(); toast('저장됨');
  });
  $('#changePw').onclick = act(async () => {
    check(await sb.auth.updateUser({ password: $('#newPw').value }));
    $('#newPw').value = ''; toast('비밀번호 바뀜');
  });
  $('#logout').onclick = act(async () => { await sb.auth.signOut(); boot(); });
}

boot().catch(e => { app.innerHTML = `<p class="warn">${esc(e.message)}</p><p class="muted">새로고침 해보고 계속 안 되면 관리자한테 말해줘요</p>`; });
