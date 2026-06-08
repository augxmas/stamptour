// @ts-nocheck
// ============================================================
// 모노라마 트래커 — 종합 도입 제안서 PPTX (v2)
//   행사·이벤트 전 과정을 관리하는 통합 운영 솔루션 제안
//   실행: npx ts-node scripts/generate-tracker-proposal-v2.ts
//   결과: docs/모노라마_트래커_종합제안서.pptx
// ============================================================
import path from "path";
import fs from "fs";
import PptxGenJS from "pptxgenjs";

const pres = new PptxGenJS();
pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 inches (16:9)

const C = {
  primary:    "0D4D8A", primaryLt: "EFF6FF",
  accent:     "15803D", accentLt:  "F0FDF4",
  pink:       "BE185D", pinkLt:    "FCE7F3",
  warn:       "F59E0B", warnLt:    "FEF3C7",
  purple:     "7C3AED", purpleLt:  "EDE9FE",
  orange:     "9A3412", orangeLt:  "FFF7ED",
  red:        "DC2626",
  dark:       "1E293B",
  gray:       "64748B", grayLt: "F8FAFC",
  border:     "E2E8F0",
  white:      "FFFFFF",
};
const F = "Malgun Gothic";

// ── Helpers ────────────────────────────────────────────────
function addCover(s, title, sub, footer) {
  s.background = { color: C.primary };
  s.addShape("rect", { x: 0, y: 0, w: 0.3, h: 7.5, fill: { color: C.accent } });
  s.addShape("rect", { x: 12.5, y: 0, w: 0.8, h: 7.5, fill: { color: "0A3D6E" } });
  s.addText(title, {
    x: 0.8, y: 2.0, w: 11.2, h: 1.6,
    fontFace: F, fontSize: 48, bold: true, color: C.white,
  });
  if (sub) s.addText(sub, {
    x: 0.8, y: 3.7, w: 11.2, h: 1.5,
    fontFace: F, fontSize: 20, color: C.white,
  });
  if (footer) s.addText(footer, {
    x: 0.8, y: 6.8, w: 11.2, h: 0.4,
    fontFace: F, fontSize: 12, color: C.white, italic: true,
  });
}

function addHeader(s, tag, title) {
  s.background = { color: C.white };
  s.addShape("rect", { x: 0, y: 0, w: 13.33, h: 1.0, fill: { color: C.primary } });
  s.addShape("rect", { x: 0, y: 0.95, w: 13.33, h: 0.05, fill: { color: C.accent } });
  s.addText(tag, { x: 0.5, y: 0.05, w: 6, h: 0.4, fontFace: F, fontSize: 11, color: C.white, italic: true });
  s.addText(title, { x: 0.5, y: 0.4, w: 12.3, h: 0.55, fontFace: F, fontSize: 24, bold: true, color: C.white });
}

function addSectionDivider(s, num, title, sub) {
  s.background = { color: C.primaryLt };
  s.addShape("rect", { x: 0, y: 3.0, w: 13.33, h: 1.5, fill: { color: C.primary } });
  s.addText(num, { x: 0.5, y: 1.5, w: 4, h: 1.2, fontFace: F, fontSize: 100, bold: true, color: C.primary });
  s.addText(title, { x: 0.7, y: 3.0, w: 12, h: 1.5, fontFace: F, fontSize: 36, bold: true, color: C.white, valign: "middle" });
  if (sub) s.addText(sub, { x: 0.7, y: 4.7, w: 12, h: 1.2, fontFace: F, fontSize: 18, color: C.dark });
}

function addBullets(s, items, opts) {
  const o = { x: 0.7, y: 1.4, w: 12.0, h: 5.5, size: 14, color: C.dark, ...opts };
  const arr = items.map(t => ({
    text: t,
    options: { bullet: { type: "bullet" }, fontFace: F, fontSize: o.size, color: o.color, paraSpaceAfter: 6 },
  }));
  s.addText(arr, { x: o.x, y: o.y, w: o.w, h: o.h });
}

function addCard(s, x, y, w, h, opts) {
  const o = { fill: C.primaryLt, border: C.primary, title: "", titleColor: C.primary, body: "", emoji: "", ...opts };
  s.addShape("roundRect", { x, y, w, h, fill: { color: o.fill }, line: { color: o.border, width: 1 }, rectRadius: 0.08 });
  if (o.emoji) s.addText(o.emoji, { x, y: y + 0.15, w, h: 0.5, fontFace: F, fontSize: 28, align: "center" });
  if (o.title) s.addText(o.title, { x, y: y + 0.65, w, h: 0.5, fontFace: F, fontSize: 14, bold: true, color: o.titleColor, align: "center" });
  if (o.body) s.addText(o.body, { x: x + 0.15, y: y + 1.2, w: w - 0.3, h: h - 1.3, fontFace: F, fontSize: 11, color: C.dark, align: "center", valign: "top" });
}

function addTable(s, rows, opts) {
  const o = { x: 0.7, y: 1.4, w: 11.9, headerColor: C.primary, ...opts };
  s.addTable(rows, { x: o.x, y: o.y, w: o.w, colW: o.colW, rowH: o.rowH || 0.42,
    border: { type: "solid", color: C.border, pt: 0.5 } });
}

// ═════════════════════════════════════════════════════════════
//  Slide 1 — 표지
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addCover(s,
    "모노라마 트래커",
    "행사·이벤트 전 과정을 하나로 연결하는\n통합 운영 플랫폼 종합 제안서",
    `(주)모노라마 · ${new Date().toLocaleDateString("ko-KR")}`,
  );
}

// ═════════════════════════════════════════════════════════════
//  Slide 2 — 목차
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addHeader(s, "Contents", "목차");
  const items = [
    ["01", "Why Tracker — 행사 운영의 새로운 표준"],
    ["02", "한눈에 보는 트래커 시스템 구성도"],
    ["03", "주최기관(Host) — 통합 관리자 시스템"],
    ["04", "방문객(Visitor) — 통합 PWA 경험"],
    ["05", "가맹점·현장요원 — 행사 운영 파트너"],
    ["06", "정산·분석 — 모든 보상의 자동 집계"],
    ["07", "보안·운영 — 안심하고 맡기는 인프라"],
    ["08", "도입 로드맵 + 가격 정책"],
  ];
  items.forEach(([n, t], i) => {
    const y = 1.5 + i * 0.65;
    s.addShape("roundRect", { x: 1.5, y, w: 0.9, h: 0.55, fill: { color: C.primary }, line: { color: C.primary }, rectRadius: 0.06 });
    s.addText(n, { x: 1.5, y, w: 0.9, h: 0.55, fontFace: F, fontSize: 18, bold: true, color: C.white, align: "center", valign: "middle" });
    s.addText(t, { x: 2.6, y, w: 9.5, h: 0.55, fontFace: F, fontSize: 16, color: C.dark, valign: "middle" });
  });
}

// ═════════════════════════════════════════════════════════════
//  Slide 3 — 섹션 1 표지: Why Tracker
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addSectionDivider(s, "01", "Why Tracker", "행사 운영의 새로운 표준 — 단일 플랫폼으로 전 과정 통합");
}

// ═════════════════════════════════════════════════════════════
//  Slide 4 — 행사 운영의 현실
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addHeader(s, "Problem", "행사 운영의 현실 — 6개의 분리된 시스템");
  const probs = [
    { e: "📋", t: "사전등록",   d: "구글폼·네이버폼\n엑셀 다운로드" },
    { e: "🎫", t: "현장등록",   d: "종이대장·수기 입력\n실시간 집계 불가" },
    { e: "🎯", t: "Tour/Quiz", d: "별도 앱·종이 스탬프\n방문/응답 분리" },
    { e: "🎁", t: "Gift/경품", d: "종이쿠폰·바코드\n사용 추적 불가" },
    { e: "📝", t: "설문조사",   d: "구글폼·전화\n응답률 저조" },
    { e: "💰", t: "정산",       d: "엑셀 수기 집계\n오류·누락 빈번" },
  ];
  probs.forEach((p, i) => {
    const x = 0.7 + (i % 3) * 4.2;
    const y = 1.4 + Math.floor(i / 3) * 2.6;
    addCard(s, x, y, 4.0, 2.3, { fill: "FEF2F2", border: C.red, emoji: p.e, title: p.t, titleColor: C.red, body: p.d });
  });
  s.addText("→ 데이터 단절 · 정산 오류 · 부정 사용 · 응답률 저하 · 인건비 손실", {
    x: 0.7, y: 6.7, w: 11.9, h: 0.5, fontFace: F, fontSize: 14, bold: true, color: C.red, align: "center",
  });
}

// ═════════════════════════════════════════════════════════════
//  Slide 5 — Tracker 의 해결책
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addHeader(s, "Solution", "Tracker — 6개를 1개의 플랫폼으로");
  s.addText("✓ 단일 DB · 단일 로그인 · 단일 PWA · 자동 동기화 · 실시간 통계", {
    x: 0.7, y: 1.4, w: 11.9, h: 0.5, fontFace: F, fontSize: 16, bold: true, color: C.accent, align: "center",
  });
  const benefits = [
    { e: "🔗", t: "전 과정 단일화",     d: "사전등록 → 현장등록 → Tour → Quiz → 설문 → 경품 → 정산까지 하나의 워크플로우" },
    { e: "⚡", t: "실시간 자동 집계",   d: "방문·응답·지급·수령 모든 이벤트가 즉시 DB 반영. 별도 엑셀 없이 정산 가능" },
    { e: "📱", t: "Visitor PWA",      d: "프로젝트명으로 설치되는 모바일 앱. 별도 앱스토어 등록 불필요" },
    { e: "🎯", t: "스마트 QR 분기",   d: "시작 전엔 사전등록, 시작 후엔 현장등록 — 하나의 QR이 시점에 따라 자동 라우팅" },
    { e: "🛡", t: "부정 사용 차단",   d: "Gift QR 1회용 토큰 + 가맹점 인증코드 + 호스트 승인 PIN 으로 다중 보안" },
    { e: "💼", t: "역할별 전용 UI",   d: "호스트·방문객·가맹점·현장요원·관리자 5개 역할 각각 최적화된 화면" },
  ];
  benefits.forEach((b, i) => {
    const x = 0.7 + (i % 3) * 4.2;
    const y = 2.1 + Math.floor(i / 3) * 2.6;
    addCard(s, x, y, 4.0, 2.4, { fill: C.accentLt, border: C.accent, emoji: b.e, title: b.t, titleColor: C.accent, body: b.d });
  });
}

// ═════════════════════════════════════════════════════════════
//  Slide 6 — 섹션 2 표지: 시스템 구성도
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addSectionDivider(s, "02", "시스템 구성도", "5개 역할 × 통합 백엔드 × 실시간 동기화");
}

// ═════════════════════════════════════════════════════════════
//  Slide 7 — 시스템 아키텍처
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addHeader(s, "Architecture", "한눈에 보는 트래커 시스템 구성도");

  // 중앙 백엔드
  s.addShape("roundRect", { x: 4.5, y: 3.0, w: 4.3, h: 1.6, fill: { color: C.primary }, rectRadius: 0.1 });
  s.addText("Tracker 통합 백엔드", { x: 4.5, y: 3.05, w: 4.3, h: 0.55, fontFace: F, fontSize: 16, bold: true, color: C.white, align: "center" });
  s.addText("Node.js · MySQL · PWA · Push", { x: 4.5, y: 3.6, w: 4.3, h: 0.4, fontFace: F, fontSize: 11, color: C.white, align: "center" });
  s.addText("REST API + 실시간 이벤트", { x: 4.5, y: 4.0, w: 4.3, h: 0.4, fontFace: F, fontSize: 11, color: C.white, align: "center" });

  // 5개 역할 (상단 3 + 하단 2)
  const roles = [
    { x: 0.7,  y: 1.3, t: "Host",     k: "주최기관 관리자",      e: "🏢", c: C.primary },
    { x: 5.0,  y: 1.3, t: "Visitor",  k: "방문객 (PWA)",         e: "👥", c: C.accent },
    { x: 9.3,  y: 1.3, t: "Merchant", k: "가맹점",                e: "🏪", c: C.purple },
    { x: 0.7,  y: 5.5, t: "Field Agent", k: "현장요원 (PWA)",   e: "👷", c: C.warn },
    { x: 9.3,  y: 5.5, t: "Mobile Admin", k: "관리자 모바일",   e: "📱", c: C.pink },
  ];
  roles.forEach(r => {
    s.addShape("roundRect", { x: r.x, y: r.y, w: 3.3, h: 1.5, fill: { color: "FFFFFF" }, line: { color: r.c, width: 2 }, rectRadius: 0.08 });
    s.addText(r.e, { x: r.x, y: r.y + 0.1, w: 3.3, h: 0.5, fontFace: F, fontSize: 26, align: "center" });
    s.addText(r.t, { x: r.x, y: r.y + 0.6, w: 3.3, h: 0.45, fontFace: F, fontSize: 16, bold: true, color: r.c, align: "center" });
    s.addText(r.k, { x: r.x, y: r.y + 1.05, w: 3.3, h: 0.4, fontFace: F, fontSize: 11, color: C.gray, align: "center" });
  });

  // 하단 — 5개 통합 기능
  s.addText("📋 사전등록  ·  🎫 현장등록  ·  🎯 Tour  ·  🧩 Quiz  ·  📝 설문조사  ·  🎁 Gift·경품  ·  💰 정산  ·  👷 근태", {
    x: 0.7, y: 6.9, w: 11.9, h: 0.4, fontFace: F, fontSize: 13, bold: true, color: C.dark, align: "center",
  });
}

// ═════════════════════════════════════════════════════════════
//  Slide 8 — 섹션 3 표지: 호스트
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addSectionDivider(s, "03", "주최기관(Host) 시스템", "프로젝트 생성부터 정산까지 한 화면에서");
}

// ═════════════════════════════════════════════════════════════
//  Slide 9 — 호스트 대시보드 한눈에
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addHeader(s, "Host Console", "주최기관 관리자 — 8개 탭으로 모든 행사 운영");

  const tabs = [
    { e: "📋", t: "내 프로젝트",     d: "프로젝트 등록·수정·견적·진행률·승인 PIN 통합 관리" },
    { e: "👷", t: "현장요원관리",   d: "요원 등록·근태·QR·현장 인증 코드" },
    { e: "🎫", t: "입장관리",       d: "사전·현장등록 / 입장권 발급 / 방문객현황" },
    { e: "🎯", t: "Tour관리",       d: "위치 등록·QR·연계 Quiz·방문자 통계" },
    { e: "🧩", t: "Quiz관리",       d: "질문 등록·이미지·정답률·응시자 통계" },
    { e: "📝", t: "설문조사",       d: "질문 카탈로그·응답자·경품수령·결과 분석" },
    { e: "🏪", t: "가맹점관리",     d: "지원 신청·승인·인증 PIN·사업자/통장 확인" },
    { e: "💰", t: "정산",           d: "사전·현장·Gift·Quiz·설문경품 통합 집계" },
  ];
  tabs.forEach((t, i) => {
    const x = 0.7 + (i % 4) * 3.16;
    const y = 1.4 + Math.floor(i / 4) * 2.8;
    addCard(s, x, y, 3.0, 2.6, { fill: C.primaryLt, border: C.primary, emoji: t.e, title: t.t, body: t.d });
  });
}

// ═════════════════════════════════════════════════════════════
//  Slide 10 — 프로젝트 등록 / 자동 견적
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addHeader(s, "Project Setup", "프로젝트 등록 — 옵션 선택만으로 자동 견적");
  s.addText("호스트가 행사 기간·옵션을 선택하면 시스템이 즉시 견적을 계산하고 메일 발송. 입금 확인 후 자동 시작.", {
    x: 0.7, y: 1.3, w: 11.9, h: 0.5, fontFace: F, fontSize: 13, color: C.gray,
  });
  const rows = [
    ["선택 옵션", "자동 계산 항목", "비고"],
    ["사전등록 사용", "일수 × 일 단위 요금", "프로젝트 시작 N일 전부터"],
    ["현장등록 사용", "프로젝트 일수 × 일 단위 요금", "행사 기간 동일"],
    ["Tour 관리",   "프로젝트 일수 × Tour 요금", "위치/전시물 무제한"],
    ["Quiz 관리",   "프로젝트 일수 × Quiz 요금", "질문 등록 무제한"],
    ["설문조사",     "프로젝트당 정액", "응답자 경품 옵션은 추가 비용 없음"],
    ["현장요원관리", "프로젝트당 정액", "요원 수 무제한"],
    ["보상액 초과 허용", "(체크 / 미체크)", "예산 초과 시 신규 보상 중지 여부"],
  ];
  addTable(s, rows.map((r, i) => r.map(c => ({
    text: c,
    options: i === 0
      ? { fontFace: F, fontSize: 12, bold: true, color: C.white, fill: { color: C.primary }, align: "center", valign: "middle" }
      : { fontFace: F, fontSize: 12, color: C.dark, fill: { color: i % 2 ? C.white : C.grayLt }, valign: "middle" },
  }))), { y: 2.0, colW: [3.0, 4.5, 4.4], rowH: 0.45 });
  s.addText("💡 모든 옵션은 프로젝트 단위로 ON/OFF — 작은 행사부터 대형 박람회까지 동일 시스템", {
    x: 0.7, y: 6.7, w: 11.9, h: 0.4, fontFace: F, fontSize: 13, italic: true, color: C.accent, align: "center",
  });
}

// ═════════════════════════════════════════════════════════════
//  Slide 11 — Tour/Quiz 관리
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addHeader(s, "Tour & Quiz", "위치별 QR 발급 + 연계 Quiz + 방문자 통계");
  // 좌
  s.addShape("roundRect", { x: 0.7, y: 1.4, w: 6.0, h: 5.5, fill: { color: C.warnLt }, line: { color: C.warn, width: 1 }, rectRadius: 0.08 });
  s.addText("🎯 Tour 관리", { x: 0.9, y: 1.6, w: 5.6, h: 0.5, fontFace: F, fontSize: 18, bold: true, color: C.orange });
  addBullets(s, [
    "위치/전시물 등록 — 좌표·이미지·연계 Quiz",
    "각 위치마다 고유 QR 자동 발급 + 280×280 모달 보기",
    "방문자별 진행률 시각화 + 완주자 자동 식별",
    "Gift 발급 한도/금액 자동 계산 + 단계별 보상",
    "프로젝트별 / 방문자별 두 가지 보기",
  ], { x: 0.9, y: 2.2, w: 5.6, h: 4.5, size: 13, color: C.dark });
  // 우
  s.addShape("roundRect", { x: 6.9, y: 1.4, w: 6.0, h: 5.5, fill: { color: C.purpleLt }, line: { color: C.purple, width: 1 }, rectRadius: 0.08 });
  s.addText("🧩 Quiz 관리", { x: 7.1, y: 1.6, w: 5.6, h: 0.5, fontFace: F, fontSize: 18, bold: true, color: C.purple });
  addBullets(s, [
    "위치 연계 / 단독 — Tour 도착 후 자동 표시",
    "이미지 첨부 + 단일/다중 선택 / 단문 답안",
    "정답률·응시 진행도 실시간 집계",
    "정답 보상 (Gift bonus) — 가맹점에서 추가 결제",
    "방문자별 정답률 우수자 자동 식별 → 추가 보상",
  ], { x: 7.1, y: 2.2, w: 5.6, h: 4.5, size: 13, color: C.dark });
}

// ═════════════════════════════════════════════════════════════
//  Slide 12 — 설문조사 + 경품 QR
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addHeader(s, "Survey", "설문조사 — 응답률을 높이는 경품 QR 시스템");
  s.addText("질문 카탈로그 기반의 빠른 설문 구성 + 응답 완료 시 즉시 발급되는 경품 수령 QR", {
    x: 0.7, y: 1.3, w: 11.9, h: 0.5, fontFace: F, fontSize: 14, color: C.gray,
  });
  const flow = [
    { e: "📝", t: "설문 등록",     d: "질문·이미지·필수\n응답자 정보 수집" },
    { e: "🎁", t: "경품 설정",     d: "단가·수량·메시지\n경품 이미지" },
    { e: "📲", t: "응답자 참여",   d: "PWA에서 응답\n실시간 제출" },
    { e: "🎫", t: "경품 QR 발급", d: "응답 완료 즉시\nQR 자동 생성" },
    { e: "✅", t: "현장 수령",     d: "관리자 PWA 로 QR\n스캔 → 수령 처리" },
  ];
  flow.forEach((f, i) => {
    const x = 0.7 + i * 2.5;
    addCard(s, x, 2.1, 2.4, 2.5, { fill: C.pinkLt, border: C.pink, emoji: f.e, title: f.t, titleColor: C.pink, body: f.d });
    if (i < flow.length - 1) {
      s.addText("→", { x: x + 2.4, y: 3.0, w: 0.15, h: 0.5, fontFace: F, fontSize: 24, bold: true, color: C.pink, align: "center" });
    }
  });
  // sub 탭 4개
  s.addText("📊 4개 sub 탭으로 운영 + 결과 분석", { x: 0.7, y: 5.0, w: 11.9, h: 0.5, fontFace: F, fontSize: 16, bold: true, color: C.pink, align: "center" });
  const subs = ["설문조사현황", "📊 응답결과 (질문별 통계)", "응답자현황", "🎁 경품수령 (QR 스캔)"];
  subs.forEach((t, i) => {
    const x = 0.7 + i * 3.05;
    s.addShape("roundRect", { x, y: 5.7, w: 2.85, h: 0.9, fill: { color: C.pink }, rectRadius: 0.05 });
    s.addText(t, { x, y: 5.7, w: 2.85, h: 0.9, fontFace: F, fontSize: 12, bold: true, color: C.white, align: "center", valign: "middle" });
  });
  s.addText("응답률 분석 → 만족도 추적 → 다음 행사 개선 자료", {
    x: 0.7, y: 6.85, w: 11.9, h: 0.4, fontFace: F, fontSize: 12, italic: true, color: C.gray, align: "center",
  });
}

// ═════════════════════════════════════════════════════════════
//  Slide 13 — 가맹점관리
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addHeader(s, "Merchant Management", "가맹점관리 — 지원·승인·인증 통합");
  s.addText("가맹점이 5개 유형별로 지원 → 호스트가 유형별 개별 승인 → PIN 자동 발급", {
    x: 0.7, y: 1.3, w: 11.9, h: 0.5, fontFace: F, fontSize: 14, color: C.gray,
  });
  // 5 유형 카드
  const types = [
    { e: "🟠", t: "사전등록",     c: "1E40AF", b: "BFDBFE" },
    { e: "🟢", t: "현장등록",     c: "166534", b: "BBF7D0" },
    { e: "🎯", t: "Tour",         c: "1E40AF", b: "DBEAFE" },
    { e: "🧩", t: "Quiz",         c: "5B21B6", b: "EDE9FE" },
    { e: "🎁", t: "설문경품",     c: "9A3412", b: "FED7AA" },
  ];
  types.forEach((t, i) => {
    const x = 0.7 + i * 2.5;
    s.addShape("roundRect", { x, y: 2.0, w: 2.4, h: 1.2, fill: { color: t.b }, rectRadius: 0.06 });
    s.addText(t.e + " " + t.t, { x, y: 2.0, w: 2.4, h: 1.2, fontFace: F, fontSize: 13, bold: true, color: t.c, align: "center", valign: "middle" });
  });
  // 기능 리스트
  s.addText("✓ 가맹점관리 탭 — 핵심 기능", { x: 0.7, y: 3.6, w: 11.9, h: 0.4, fontFace: F, fontSize: 14, bold: true, color: C.primary });
  addBullets(s, [
    "사업자등록증·통장사본 클릭 한 번에 popup 모달로 확인",
    "은행·계좌번호 자동 노출 + 모바일/연락처 자동 포맷",
    "이메일 클릭 시 메일 작성 popup — 가맹점 안내 즉시 발송",
    "지원 유형별 컬럼 그룹 — 한 가맹점의 모든 지원 상태 한눈에",
    "인증비밀번호 마스킹 + 👁 토글로 안전한 PIN 관리",
    "[승인]/[거절] 인라인 미니 버튼 — 한 화면에서 5개 유형 즉시 처리",
  ], { x: 0.9, y: 4.1, w: 11.5, h: 2.8, size: 13, color: C.dark });
}

// ═════════════════════════════════════════════════════════════
//  Slide 14 — 섹션 4 표지: Visitor
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addSectionDivider(s, "04", "방문객 통합 PWA", "어떤 진입점이든 → 하나의 앱으로 통합");
}

// ═════════════════════════════════════════════════════════════
//  Slide 15 — Visitor 통합 PWA
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addHeader(s, "Visitor PWA", "프로젝트명으로 설치되는 통합 모바일 앱");
  s.addText("어떤 QR이든, 어떤 URL이든 → 프로젝트명으로 PWA 설치 유도 + 통합 메뉴", {
    x: 0.7, y: 1.3, w: 11.9, h: 0.5, fontFace: F, fontSize: 14, color: C.gray,
  });

  // 좌측 — 진입 경로
  s.addText("🔗 진입 경로 (모두 동일 PWA)", { x: 0.7, y: 2.0, w: 5.7, h: 0.4, fontFace: F, fontSize: 14, bold: true, color: C.accent });
  const entries = [
    "사전등록 URL  →  /reserve/{serial}",
    "현장등록 URL  →  /entry/{serial}",
    "통합 등록 URL →  /register/{serial} ★",
    "Tour 위치 QR →  /v/{serial}/{seq}",
    "설문조사 URL →  /survey/{serial}",
    "메인 메뉴     →  /v/{serial}",
  ];
  s.addText(entries.map(e => ({ text: e, options: { bullet: { type: "bullet" }, fontFace: F, fontSize: 12, color: C.dark, paraSpaceAfter: 5 } })),
    { x: 0.9, y: 2.5, w: 5.5, h: 3.5 });
  s.addText("★ /register/ — 시작 전 → 사전등록, 시작 후 → 현장등록 자동 분기", {
    x: 0.9, y: 5.5, w: 5.5, h: 0.4, fontFace: F, fontSize: 11, italic: true, color: C.warn,
  });

  // 우측 — 통합 메뉴 카드
  s.addShape("roundRect", { x: 7.0, y: 2.0, w: 5.6, h: 4.5, fill: { color: C.accentLt }, line: { color: C.accent, width: 2 }, rectRadius: 0.1 });
  s.addText("{프로젝트명}", { x: 7.0, y: 2.1, w: 5.6, h: 0.45, fontFace: F, fontSize: 16, bold: true, color: C.dark, align: "center" });
  s.addText("참여하실 기능을 선택해 주세요", { x: 7.0, y: 2.55, w: 5.6, h: 0.4, fontFace: F, fontSize: 11, color: C.gray, align: "center" });
  const menu = [
    { e: "📋", t: "사전등록",   x: 7.3, y: 3.05 },
    { e: "🎫", t: "현장등록",   x: 10.0, y: 3.05 },
    { e: "🎯", t: "Tour·Quiz", x: 7.3, y: 4.55, w: 5.0 },
    { e: "📝", t: "설문조사",   x: 7.3, y: 5.55 },
  ];
  menu.forEach(m => {
    const w = m.w || 2.4;
    s.addShape("roundRect", { x: m.x, y: m.y, w, h: 1.3, fill: { color: C.white }, line: { color: C.accent }, rectRadius: 0.08 });
    s.addText(m.e, { x: m.x, y: m.y + 0.15, w, h: 0.5, fontFace: F, fontSize: 22, align: "center" });
    s.addText(m.t, { x: m.x, y: m.y + 0.7, w, h: 0.5, fontFace: F, fontSize: 12, bold: true, color: C.accent, align: "center" });
  });

  s.addText("📲 홈 화면에 앱을 추가하면 한 곳에서 모든 기능을 빠르게 이용 가능", {
    x: 0.7, y: 6.7, w: 11.9, h: 0.4, fontFace: F, fontSize: 13, bold: true, color: C.accent, align: "center",
  });
}

// ═════════════════════════════════════════════════════════════
//  Slide 16 — Visitor 여정
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addHeader(s, "Visitor Journey", "방문객 참여 여정 — 한 앱에서 끝까지");

  const steps = [
    { e: "📲", t: "1. PWA 설치",      d: "어떤 URL이든\n프로젝트명으로\n홈 화면 추가" },
    { e: "📋", t: "2. 사전등록",      d: "이메일 인증·\n정보 입력 후\n혜택 QR 발급" },
    { e: "🎫", t: "3. 현장 입장",     d: "발급된 QR\n제시 → 방문확인\n자동 처리" },
    { e: "🎯", t: "4. Tour 방문",     d: "각 위치 QR 스캔\n진행률 시각화\nGift 누적" },
    { e: "🧩", t: "5. Quiz 응시",     d: "위치별 자동 표시\n정답 보너스\n실시간 채점" },
    { e: "🎁", t: "6. Gift 사용",     d: "가맹점에서 QR\n결제 시 즉시\n차감 처리" },
    { e: "📝", t: "7. 설문 응답",     d: "행사 완료 후\n응답 → 경품 QR\n자동 발급" },
    { e: "🏆", t: "8. 경품 수령",     d: "관리자 QR 스캔\n수령 완료\n반복 부정 차단" },
  ];
  steps.forEach((p, i) => {
    const x = 0.7 + (i % 4) * 3.16;
    const y = 1.4 + Math.floor(i / 4) * 2.8;
    addCard(s, x, y, 3.0, 2.6, { fill: C.accentLt, border: C.accent, emoji: p.e, title: p.t, titleColor: C.accent, body: p.d });
  });
}

// ═════════════════════════════════════════════════════════════
//  Slide 17 — 섹션 5 표지: 파트너
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addSectionDivider(s, "05", "가맹점 · 현장요원 · 관리자 PWA", "현장 운영 전 인원을 디지털로 연결");
}

// ═════════════════════════════════════════════════════════════
//  Slide 18 — 가맹점 + 현장요원 + 관리자 PWA
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addHeader(s, "Partner Apps", "3개 역할 × 3개의 모바일 PWA");

  const panes = [
    {
      c: C.purple, ct: C.purpleLt,
      e: "🏪", t: "가맹점 (Merchant)",
      items: [
        "유형별 (Tour/Quiz/사전/현장/설문경품) 지원",
        "사업자등록 + 통장사본 업로드",
        "Gift QR 스캔 결제 + PIN 인증",
        "정산 내역 실시간 확인",
        "전용 PWA 로 휴대폰에서 즉시 이용",
      ],
    },
    {
      c: C.warn, ct: C.warnLt,
      e: "👷", t: "현장요원 (Field Agent)",
      items: [
        "주민등록증 + 통장사본 업로드",
        "출퇴근 QR 스캔으로 근태 등록",
        "프로젝트별 일정·현황 확인",
        "전용 등록 PWA — 현장에서 빠른 가입",
        "근태 자동 정산 (시급/일급)",
      ],
    },
    {
      c: C.pink, ct: C.pinkLt,
      e: "📱", t: "관리자 모바일 (Mobile Admin)",
      items: [
        "/admin 접속 시 모바일이면 자동 이동",
        "경품수령 — QR 스캔 → 즉시 수령 처리",
        "방문등록 — 사전+현장 통합 QR 스캔",
        "현장요원 근태 실시간 조회",
        "이메일 저장 + PWA 설치 안내",
      ],
    },
  ];
  panes.forEach((p, i) => {
    const x = 0.7 + i * 4.2;
    s.addShape("roundRect", { x, y: 1.4, w: 4.0, h: 5.5, fill: { color: p.ct }, line: { color: p.c, width: 1 }, rectRadius: 0.08 });
    s.addText(p.e, { x, y: 1.55, w: 4.0, h: 0.7, fontFace: F, fontSize: 30, align: "center" });
    s.addText(p.t, { x, y: 2.25, w: 4.0, h: 0.5, fontFace: F, fontSize: 14, bold: true, color: p.c, align: "center" });
    s.addText(p.items.map(it => ({ text: it, options: { bullet: { type: "bullet" }, fontFace: F, fontSize: 11, color: C.dark, paraSpaceAfter: 5 } })),
      { x: x + 0.2, y: 2.9, w: 3.7, h: 4.0 });
  });
}

// ═════════════════════════════════════════════════════════════
//  Slide 19 — 섹션 6 표지: 정산·분석
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addSectionDivider(s, "06", "정산 · 분석", "모든 보상의 자동 집계 + 실시간 통계");
}

// ═════════════════════════════════════════════════════════════
//  Slide 20 — 정산 시스템
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addHeader(s, "Settlement", "정산 — 5개 보상 유형 × 3가지 보기");

  s.addText("프로젝트별 / 가맹점별 / 일별 — 한 화면에서 모든 보상의 흐름 자동 집계", {
    x: 0.7, y: 1.3, w: 11.9, h: 0.5, fontFace: F, fontSize: 13, color: C.gray,
  });

  // 5 유형 그룹
  const cats = [
    { c: "1E40AF", b: "BFDBFE", e: "🟠", t: "사전등록",   d: "단가 × 사용수\n혜택 자동 집계" },
    { c: "166534", b: "BBF7D0", e: "🟢", t: "현장등록",   d: "단가 × 사용수\n혜택 자동 집계" },
    { c: "B45309", b: "FED7AA", e: "🎁", t: "Gift",       d: "단가·사용·증정\n합계 자동 계산" },
    { c: "5B21B6", b: "EDE9FE", e: "🧩", t: "Quiz",       d: "보너스 단가 ×\n지급수" },
    { c: "9A3412", b: "FFF7ED", e: "🎁", t: "설문경품",   d: "단가 × 수령수\n자동 집계" },
  ];
  cats.forEach((c, i) => {
    const x = 0.7 + i * 2.5;
    s.addShape("roundRect", { x, y: 2.1, w: 2.4, h: 2.0, fill: { color: c.b }, line: { color: c.c }, rectRadius: 0.06 });
    s.addText(c.e, { x, y: 2.2, w: 2.4, h: 0.5, fontFace: F, fontSize: 22, align: "center" });
    s.addText(c.t, { x, y: 2.7, w: 2.4, h: 0.4, fontFace: F, fontSize: 13, bold: true, color: c.c, align: "center" });
    s.addText(c.d, { x, y: 3.15, w: 2.4, h: 0.9, fontFace: F, fontSize: 10, color: C.dark, align: "center", valign: "top" });
  });

  s.addText("총 Reward 금액 = 5개 유형 합계 (예산 대비 % 자동 표시)", {
    x: 0.7, y: 4.4, w: 11.9, h: 0.4, fontFace: F, fontSize: 13, bold: true, color: C.primary, align: "center",
  });

  // 3 view
  s.addText("📊 3개 보기", { x: 0.7, y: 5.0, w: 11.9, h: 0.4, fontFace: F, fontSize: 14, bold: true, color: C.primary });
  const views = [
    { t: "프로젝트별", d: "프로젝트 단위 한 행 요약 — 전체 보상 + 예산 사용률" },
    { t: "가맹점별",   d: "가맹점 × 프로젝트 — 가맹점 단위 정산 정산 명세" },
    { t: "일별",       d: "일자 × 가맹점 — 일자별 흐름 추적, 사전·현장·Gift·Quiz·설문경품 모두" },
  ];
  views.forEach((v, i) => {
    const x = 0.7 + i * 4.05;
    s.addShape("roundRect", { x, y: 5.6, w: 3.85, h: 1.4, fill: { color: C.grayLt }, line: { color: C.border }, rectRadius: 0.06 });
    s.addText(v.t, { x, y: 5.7, w: 3.85, h: 0.4, fontFace: F, fontSize: 13, bold: true, color: C.primary, align: "center" });
    s.addText(v.d, { x: x + 0.15, y: 6.1, w: 3.55, h: 0.85, fontFace: F, fontSize: 11, color: C.dark, align: "center", valign: "top" });
  });
}

// ═════════════════════════════════════════════════════════════
//  Slide 21 — 분석 / 통계
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addHeader(s, "Analytics", "실시간 통계 — 의사결정 도구");
  const items = [
    {
      e: "📊", t: "방문객 통계", c: C.primary, ct: C.primaryLt,
      d: "응시자 / 완주자 / 평균 진행률 / Gift 사용 합계\n진행도 막대 그래프 + 완주 배지 자동 표시",
    },
    {
      e: "🎯", t: "Tour 방문자별", c: C.warn, ct: C.warnLt,
      d: "전체 Tour 대비 방문 비율 + 첫/마지막 방문\nGift 발급/사용 횟수 + 사용 금액 누적",
    },
    {
      e: "🧩", t: "Quiz 정답률", c: C.purple, ct: C.purpleLt,
      d: "응시 진행도 + 정답률 (80%+ 녹색)\n정답률 우수자 자동 식별",
    },
    {
      e: "📝", t: "설문 응답 결과", c: C.pink, ct: C.pinkLt,
      d: "질문 유형별 자동 시각화\n객관식 막대 / 평점 평균 / 예-아니오 % / 단문 목록",
    },
    {
      e: "🎁", t: "경품 수령 추적", c: C.orange, ct: C.orangeLt,
      d: "발급 / 미수령 / 수령 완료 실시간\n다른 프로젝트 QR 자동 차단",
    },
    {
      e: "👷", t: "현장요원 근태", c: C.accent, ct: C.accentLt,
      d: "출퇴근 시각 + 누적 시간\n급여 자동 정산 기초 자료",
    },
  ];
  items.forEach((it, i) => {
    const x = 0.7 + (i % 3) * 4.2;
    const y = 1.4 + Math.floor(i / 3) * 2.7;
    addCard(s, x, y, 4.0, 2.5, { fill: it.ct, border: it.c, emoji: it.e, title: it.t, titleColor: it.c, body: it.d });
  });
}

// ═════════════════════════════════════════════════════════════
//  Slide 22 — 섹션 7 표지: 보안·운영
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addSectionDivider(s, "07", "보안 · 운영", "안심하고 맡기는 인프라");
}

// ═════════════════════════════════════════════════════════════
//  Slide 23 — 보안·운영
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addHeader(s, "Security & Ops", "보안·운영 — 데이터·인증·부정사용 방지");
  const items = [
    { e: "🔒", t: "암호화 저장",      d: "개인정보(이름·이메일·전화·계좌·사업자번호) AES 암호화 저장 + DB 접근 통제" },
    { e: "🔑", t: "다중 인증",         d: "호스트 비밀번호 + 프로젝트 PIN + 가맹점 인증코드 + Gift QR 1회용 토큰" },
    { e: "🛡", t: "권한 분리",        d: "Host / Visitor / Merchant / Field Agent / Supervisor 5개 역할 + 세션 분리" },
    { e: "📍", t: "현장 검증",         d: "Tour QR 위치 좌표 + 가맹점 QR 결제 + 관리자 수령 처리 — 다단계 검증" },
    { e: "🚫", t: "중복·부정 차단",    d: "Gift 토큰 1회 사용 + 경품 QR 1회 수령 + 다른 프로젝트 QR 거부" },
    { e: "📨", t: "메일 추적",         d: "발송 이력 탭 — 견적·승인·거절·알림 모든 메일 발송 상태 추적" },
    { e: "💾", t: "DB 백업·복원",     d: "스케줄러 + 수동 백업/복원 스크립트 + 마이그레이션 SQL 관리" },
    { e: "📲", t: "PWA 오프라인",     d: "Service Worker — 카메라/QR 등 네트워크 끊겨도 일부 기능 유지" },
  ];
  items.forEach((it, i) => {
    const x = 0.7 + (i % 4) * 3.16;
    const y = 1.4 + Math.floor(i / 4) * 2.7;
    addCard(s, x, y, 3.0, 2.5, { fill: C.grayLt, border: C.primary, emoji: it.e, title: it.t, body: it.d });
  });
}

// ═════════════════════════════════════════════════════════════
//  Slide 24 — 섹션 8 표지: 도입 로드맵
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addSectionDivider(s, "08", "도입 로드맵 + 가격", "오늘 시작해서 다음 주 행사에 사용");
}

// ═════════════════════════════════════════════════════════════
//  Slide 25 — 도입 절차
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addHeader(s, "Onboarding", "도입 절차 — 1주일 내 가능");
  const steps = [
    { day: "D-0", t: "주관기관 가입",  d: "이메일 인증 → 기관 정보 등록 → 즉시 사용 가능" },
    { day: "D-1", t: "프로젝트 등록",  d: "행사 기간 + 옵션 선택 → 자동 견적 → 메일 발송" },
    { day: "D-2", t: "입금 확인",      d: "계좌 입금 → 호스트가 입금 확인 클릭 → 프로젝트 시작 대기" },
    { day: "D-3", t: "콘텐츠 등록",   d: "Tour 위치 + 연계 Quiz + 설문조사 질문 + 가맹점 모집" },
    { day: "D-4", t: "가맹점 승인",   d: "가맹점 지원 검토 → 유형별 승인 → 인증 PIN 자동 발급" },
    { day: "D-5", t: "QR 인쇄·배포",  d: "Tour 위치 QR / 등록 통합 QR / 설문 QR 인쇄·배포" },
    { day: "D-6", t: "현장요원 등록", d: "요원 PWA 배포 → 정보 입력 → 출퇴근 QR 발급" },
    { day: "D-7", t: "행사 개시",     d: "프로젝트 자동 시작 → 실시간 통계 + 정산 시작" },
  ];
  steps.forEach((st, i) => {
    const y = 1.4 + i * 0.65;
    s.addShape("roundRect", { x: 0.7, y, w: 1.1, h: 0.55, fill: { color: C.primary }, rectRadius: 0.06 });
    s.addText(st.day, { x: 0.7, y, w: 1.1, h: 0.55, fontFace: F, fontSize: 12, bold: true, color: C.white, align: "center", valign: "middle" });
    s.addText(st.t, { x: 2.0, y, w: 3.0, h: 0.55, fontFace: F, fontSize: 13, bold: true, color: C.dark, valign: "middle" });
    s.addText(st.d, { x: 5.2, y, w: 7.5, h: 0.55, fontFace: F, fontSize: 12, color: C.gray, valign: "middle" });
  });
}

// ═════════════════════════════════════════════════════════════
//  Slide 26 — 가격 정책
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addHeader(s, "Pricing", "가격 정책 — 사용한 만큼, 옵션별 정확한 견적");
  const rows = [
    ["항목",            "비용 모델",                          "비고"],
    ["초기 구축",        "1회 정액",                          "프로젝트 초기 세팅 + 랜딩 디자인 2안 + 모바일 아이콘"],
    ["일 사용료",        "Tour 일 단위 · Quiz 일 단위",        "프로젝트 기간 × 일 단위 요금"],
    ["사전등록",         "일 단위",                            "프로젝트 시작 N일 전부터 시작일 전일까지"],
    ["현장등록",         "일 단위",                            "프로젝트 기간 동일"],
    ["현장요원관리",     "프로젝트당 정액",                    "요원 수 무제한"],
    ["설문조사",         "프로젝트당 정액",                    "응답자 경품 옵션 추가 비용 없음"],
    ["보상 자체 비용",   "(주최기관 부담)",                    "Gift / Quiz 보너스 / 설문경품 자체 금액"],
  ];
  addTable(s, rows.map((r, i) => r.map(c => ({
    text: c,
    options: i === 0
      ? { fontFace: F, fontSize: 12, bold: true, color: C.white, fill: { color: C.primary }, align: "center", valign: "middle" }
      : { fontFace: F, fontSize: 12, color: C.dark, fill: { color: i % 2 ? C.white : C.grayLt }, valign: "middle" },
  }))), { y: 1.4, colW: [3.0, 3.5, 5.4], rowH: 0.5 });

  s.addText("💡 견적은 프로젝트 등록 시 옵션 선택만으로 자동 계산 — 메일 즉시 발송", {
    x: 0.7, y: 6.0, w: 11.9, h: 0.5, fontFace: F, fontSize: 14, bold: true, color: C.accent, align: "center",
  });
  s.addText("정확한 견적이 필요하시면 별도 견적 요청 또는 시연 미팅을 신청해 주세요.", {
    x: 0.7, y: 6.5, w: 11.9, h: 0.4, fontFace: F, fontSize: 12, italic: true, color: C.gray, align: "center",
  });
}

// ═════════════════════════════════════════════════════════════
//  Slide 27 — 도입 효과 ROI
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  addHeader(s, "ROI", "도입 효과 — 시간·인건비·정확성 모두 개선");
  const benefits = [
    { e: "⏱", t: "운영 시간",    n: "▲ 70%↓", d: "엑셀·종이 작업 제거\n실시간 자동 집계" },
    { e: "💼", t: "인건비",       n: "▲ 50%↓", d: "현장 운영 인력 감소\n자동화된 정산" },
    { e: "✅", t: "정산 정확도",  n: "▲ 99%",   d: "사용 이력 100% 추적\n수기 오류 제거" },
    { e: "📈", t: "참여율",       n: "▲ 3배",   d: "PWA 기반 즉시 참여\n경품 QR 동기부여" },
    { e: "🎯", t: "분석 인사이트", n: "▲ 100%", d: "질문별 응답 통계\n방문자 행동 분석" },
    { e: "🛡", t: "부정사용",     n: "▲ 0건",   d: "1회용 QR + 다중 인증\n중복 발급 차단" },
  ];
  benefits.forEach((b, i) => {
    const x = 0.7 + (i % 3) * 4.2;
    const y = 1.4 + Math.floor(i / 3) * 2.7;
    s.addShape("roundRect", { x, y, w: 4.0, h: 2.5, fill: { color: C.accentLt }, line: { color: C.accent, width: 1.5 }, rectRadius: 0.08 });
    s.addText(b.e, { x, y: y + 0.15, w: 4.0, h: 0.5, fontFace: F, fontSize: 24, align: "center" });
    s.addText(b.t, { x, y: y + 0.65, w: 4.0, h: 0.4, fontFace: F, fontSize: 13, color: C.gray, align: "center" });
    s.addText(b.n, { x, y: y + 1.05, w: 4.0, h: 0.5, fontFace: F, fontSize: 22, bold: true, color: C.accent, align: "center" });
    s.addText(b.d, { x: x + 0.2, y: y + 1.65, w: 3.6, h: 0.8, fontFace: F, fontSize: 11, color: C.dark, align: "center", valign: "top" });
  });
}

// ═════════════════════════════════════════════════════════════
//  Slide 28 — 마무리 / Contact
// ═════════════════════════════════════════════════════════════
{
  const s = pres.addSlide();
  s.background = { color: C.primary };
  s.addShape("rect", { x: 0, y: 0, w: 0.3, h: 7.5, fill: { color: C.accent } });
  s.addText("행사 운영의\n새로운 표준을 만나세요", {
    x: 0.8, y: 1.8, w: 11.7, h: 2.0, fontFace: F, fontSize: 40, bold: true, color: C.white,
  });
  s.addText("지금 시연 미팅을 신청하시면, 귀 기관의 행사에 맞춘\n맞춤형 데모 환경을 즉시 구성해 드립니다.", {
    x: 0.8, y: 4.0, w: 11.7, h: 1.2, fontFace: F, fontSize: 18, color: C.white,
  });
  // contact box
  s.addShape("roundRect", { x: 0.8, y: 5.5, w: 11.7, h: 1.5, fill: { color: "0A3D6E" }, line: { color: C.accent, width: 1.5 }, rectRadius: 0.08 });
  s.addText("문의 및 시연 신청", { x: 1.0, y: 5.65, w: 11.3, h: 0.4, fontFace: F, fontSize: 14, bold: true, color: C.accent });
  s.addText("(주)모노라마  ·  Email: hello@mono-rama.com  ·  Web: tracker.mono-rama.com", {
    x: 1.0, y: 6.1, w: 11.3, h: 0.5, fontFace: F, fontSize: 16, color: C.white,
  });
  s.addText(`© ${new Date().getFullYear()} Monorama Co., Ltd. — Tracker 종합 제안서`, {
    x: 0.8, y: 7.1, w: 11.7, h: 0.3, fontFace: F, fontSize: 10, color: C.white, italic: true,
  });
}

// ═════════════════════════════════════════════════════════════
//  파일 출력
// ═════════════════════════════════════════════════════════════
const outDir = path.join(process.cwd(), "docs");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "모노라마_트래커_종합제안서.pptx");

pres.writeFile({ fileName: outPath }).then(p => {
  console.log("✅ 생성 완료:", p);
  console.log("   슬라이드 수: 28");
});
