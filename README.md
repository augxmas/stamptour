# Tracker Host/Supervisor Service

TypeScript + MariaDB 기반으로 host와 supervisor가 프로젝트를 관리하고, 방문 QR 및 Gift 소진을 처리하는 서버입니다.

## 빠른 시작

1. 의존성 설치

npm install

2. 환경변수 파일 생성

.env.example 을 복사하여 .env 생성

3. DB 스키마 적용

sql/schema.sql 실행

4. 서버 실행

개발: npm run dev
빌드: npm run build
실행: npm run start

## 기본 접속 URL

- Host Admin: /admin
- Supervisor: /supervisor
- Visitor Landing: /v/:projectSerial/:locationSeq

## 로그인 계정

- supervisor: 아이디/비밀번호는 `.env`의 `SUPERVISOR_USERNAME` / `SUPERVISOR_PASSWORD` 참고
- host: /api/host/register 로 생성 후 supervisor 승인 필요

## 주요 요구사항 반영 항목

- host, supervisor 분리 로그인/세션 (4분 idle 종료)
- 프로젝트 등록 필드
  - 프로젝트명칭, 일련번호, 설명(200자), 기간(from/to), Gift, 예산, 비밀번호(6자리 숫자)
- 프로젝트 일련번호 규칙
  - yyyymmdd_dddd 형식
- 기간 검증
  - from: 오늘 이전 불가
  - to: from + 5일 이상
- 비밀번호 발송/검증
  - 비밀번호발송 시 이메일 전송
  - 불일치 시 실패 횟수 반환
  - 3회 실패 시 host 프로젝트 등록 잠금
- 위치정보 관리
  - 최대 15개 등록
  - 수정/disable(삭제 아님)
  - location_seq 증가형 유지, display_seq 는 빈 슬롯 재사용
- 견적 메일 발송
  - (주)모노라마 정보 기반
  - SMTP: smtp.worksmobile.com:465 SSL
- supervisor 프로세스
  - host 승인
  - 입금확인
  - 모바일 이미지/파비콘 업로드
  - 개시 버튼으로 QR 생성
  - 개시 전 QR 생성 금지
  - QR zip 다운로드
- visitor 프로세스
  - QR URL 접속
  - 휴대폰 식별(cookie 저장)
  - 위치 방문 기록 및 진행률
  - 미션 완료 시 완료 상태 응답
  - Gift 사용/증정 시 6자리 비밀번호 검증

## API 개요

- Host Auth
  - POST /api/host/register
  - POST /api/host/login
  - POST /api/host/logout
  - GET /api/host/me
- Host Project
  - POST /api/host/project-pin/send
  - POST /api/host/projects
  - GET /api/host/projects
  - POST /api/host/projects/:id/locations
  - PUT /api/host/projects/:projectId/locations/:locationId
  - PUT /api/host/projects/:projectId/locations/:locationId/disable
  - GET /api/host/projects/:id/locations
  - GET /api/host/projects/:id/qr-zip
- Supervisor
  - POST /api/supervisor/login
  - POST /api/supervisor/logout
  - GET /api/supervisor/me
  - GET /api/supervisor/hosts
  - PUT /api/supervisor/hosts/:id/status
  - GET /api/supervisor/projects
  - PUT /api/supervisor/projects/:id/deposit-confirm
  - POST /api/supervisor/projects/:id/assets
  - POST /api/supervisor/projects/:id/start
  - GET /api/supervisor/projects/:id/qr-zip
- Visitor
  - POST /api/visitor/identify
  - POST /api/visitor/visit
  - GET /api/visitor/progress/:projectSerial
  - GET /api/visitor/mission-qr/:projectSerial
  - POST /api/visitor/gift/redeem

## 주의사항

- 그리드 sorting/filtering, Excel 전체 다운로드, 커스텀 모달 UI는 API 기반으로 확장 가능한 구조로 두고 최소 UI를 구현했습니다.
- 카카오맵 실제 SDK 연동은 좌표 저장 형태로 구현되어 있으며, 프론트엔드에서 지도 위젯 연결이 필요합니다.
- PWA 설치 유도 팝업은 브라우저 이벤트 처리 프론트 구현이 추가로 필요합니다.
