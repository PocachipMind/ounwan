# 오운완 💪

친구끼리 쓰는 운동 인증 웹앱. 주 N회 운동 인증하고, 못 채우면 벌금.

**바로 쓰기:** https://pocachipmind.github.io/ounwan/

## 기능

- **운동 인증**: 시작 사진 → 끝 사진. 친구가 👍 확인해야 인정
- **방**: 방마다 규칙(주 몇 회, 운동 종류별 최소 횟수, 분기 쿠폰, 벌금, 몸무게 공개). 초대 링크로 입장, 사진 하나를 여러 방에 동시에 공유
- **규칙 변경 투표**: 방 만든 뒤에는 멤버 과반수 찬성하면 바로 적용
- **벌금 계산**: 주(월~일) 미달분은 분기 쿠폰으로 먼저 차감, 남은 1회당 벌금
- **단체방**: 셋로그 같은 사진 로그 / 채팅 전환. 운동 사진이 채팅에 자동으로 올라옴. 사진 답장, 채팅 사진, 꾹 눌러서 이모지 반응
- **홈**: 이번 주 남은 횟수, 몸무게 그래프, 운동 횟수·시간, 같이 운동 많이 한 친구, 콕 찌르기
- **😈**: 지난주 규칙 채운 사람만 쓸 수 있는 전체화면 장난 메시지
- **계정**: 한글 아이디 가능, 메일 인증 없음, 관리자가 비밀번호 초기화

## 구조

빌드 없음. 정적 파일 + Supabase.

| 파일 | 내용 |
|---|---|
| `index.html` | 화면 틀, 스타일 |
| `app.js` | 화면, 데이터 불러오기/저장 |
| `rules.js` | 벌금·쿠폰·운동시간 계산 (순수 함수) |
| `rules.test.js` | `rules.js` 테스트 |
| `schema.sql` | 처음 DB 구조 |
| `migrations/` | 그 이후 DB 변경 (번호 순서대로) |

- 프론트: 바닐라 JS, GitHub Pages
- 백엔드: Supabase (Postgres, Auth, Storage, Realtime). 권한은 전부 RLS와 `security definer` 함수로 DB에서 막음

## 직접 띄우기

1. Supabase 프로젝트 만들고 SQL Editor에서 `schema.sql` → `migrations/*.sql` 순서대로 실행
2. Authentication → Email → **Confirm email 끄기**
3. `app.js` 맨 위 `SUPABASE_URL`, `SUPABASE_KEY`(publishable 키)를 내 프로젝트 값으로 교체
4. 아무 정적 서버로 띄우기
   ```
   python -m http.server 5173
   ```
5. 관리자 지정: `update profiles set is_admin = true where nickname = '<닉네임>';`

## 테스트

```
node rules.test.js
```
