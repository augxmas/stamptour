// @ts-nocheck
// ============================================================
// 모노라마 트래커 — 주최기관 도입 제안서 PPTX 생성기
//   실행: npx ts-node scripts/generate-proposal.ts
//   결과: docs/모노라마_트래커_도입제안서.pptx
// ============================================================
import path from "path";
import fs from "fs";
import PptxGenJS from "pptxgenjs";

const pres = new PptxGenJS();
pres.layout = "LAYOUT_WIDE";   // 13.33 x 7.5 inches (16:9)

// ── 디자인 시스템 (브랜드 컬러) ──
const C = {
  primary:    "0D4D8A",   // 진한 블루 (브랜드 메인)
  primaryLt:  "EFF6FF",   // 연한 블루 배경
  accent:     "15803D",   // 그린 액센트
  accentLt:   "F0FDF4",
  warn:       "F59E0B",   // 오렌지 액센트
  dark:       "1E293B",   // 텍스트
  gray:       "64748B",   // 보조 텍스트
  grayLt:     "F8FAFC",
  border:     "E2E8F0",
  white:      "FFFFFF",
};
const F = "Malgun Gothic";

// ── 공용 helper ──
function addCover(s: PptxGenJS.Slide, title: string, sub?: string, footer?: string) {
  s.background = { color: C.primary };
  // 좌측 디자인 띠
  s.addShape("rect", { x: 0, y: 0, w: 0.3, h: 7.5, fill: { color: C.accent } });
  s.addText(title, {
    x: 0.8, y: 2.3, w: 11.7, h: 1.6,
    fontFace: F, fontSize: 44, bold: true, color: C.white,
    align: "left", valign: "middle",
  });
  if (sub) s.addText(sub, {
    x: 0.8, y: 3.9, w: 11.7, h: 1.0,
    fontFace: F, fontSize: 20, color: C.white, align: "left", valign: "top",
  });
  if (footer) s.addText(footer, {
    x: 0.8, y: 6.8, w: 11.7, h: 0.4,
    fontFace: F, fontSize: 12, color: C.white, italic: true,
  });
}

function addSectionDivider(s: PptxGenJS.Slide, num: string, title: string, sub?: string) {
  s.background = { color: C.primaryLt };
  s.addShape("rect", { x: 0, y: 3.0, w: 13.33, h: 1.5, fill: { color: C.primary } });
  s.addText(`${num}`, {
    x: 0.5, y: 1.5, w: 4, h: 1.2,
    fontFace: F, fontSize: 100, bold: true, color: C.primary, align: "left",
  });
  s.addText(title, {
    x: 0.7, y: 3.0, w: 12, h: 1.5,
    fontFace: F, fontSize: 36, bold: true, color: C.white, valign: "middle",
  });
  if (sub) s.addText(sub, {
    x: 0.7, y: 4.7, w: 12, h: 1.2,
    fontFace: F, fontSize: 18, color: C.dark, valign: "top",
  });
}

function addContentSlide(s: PptxGenJS.Slide, sectionTag: string, title: string) {
  // 상단 배경 — 헤더
  s.addShape("rect", { x: 0, y: 0, w: 13.33, h: 1.0, fill: { color: C.primary } });
  s.addShape("rect", { x: 0, y: 0.95, w: 13.33, h: 0.05, fill: { color: C.accent } });
  s.addText(sectionTag, {
    x: 0.5, y: 0.05, w: 5, h: 0.4,
    fontFace: F, fontSize: 11, color: C.white, italic: true,
  });
  s.addText(title, {
    x: 0.5, y: 0.4, w: 12.3, h: 0.55,
    fontFace: F, fontSize: 24, bold: true, color: C.white,
  });
}

function bulletText(items: string[], opts?: { x?:number; y?:number; w?:number; h?:number; size?:number; color?:string }) {
  const o = { x: 0.7, y: 1.4, w: 12.0, h: 5.5, size: 14, color: C.dark, ...opts };
  const txtArr = items.map((t, i) => ({
    text: t,
    options: { bullet: { type: "bullet" as const }, fontFace: F, fontSize: o.size, color: o.color,
               paraSpaceAfter: 6, paraSpaceBefore: 0 },
  }));
  return { txtArr, area: o };
}

function addBullets(s: PptxGenJS.Slide, items: string[], opts?: any) {
  const { txtArr, area } = bulletText(items, opts);
  s.addText(txtArr, { x: area.x, y: area.y, w: area.w, h: area.h });
}

// ───────────────────────────────────────────────────────────────
//  Slide 1 — 표지
// ───────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  addCover(s,
    "모노라마 트래커",
    "스탬프 투어 + Gift + 사전·현장등록 + 현장요원관리\n통합 운영 솔루션 도입 제안서",
    `(주)모노라마 · ${new Date().toLocaleDateString("ko-KR")}`,
  );
}

// ───────────────────────────────────────────────────────────────
//  Slide 2 — 인사말 / Executive Summary
// ───────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  addContentSlide(s, "Executive Summary", "왜 지금, 통합 솔루션이 필요한가");
  s.addText(
    "전시·축제·관광·체험형 행사 운영 현장은 점점 더 복잡해지고 있습니다. 방문객은 단순한 관람을 넘어 \n" +
    "참여형 콘텐츠(스탬프투어·퀴즈·미션·혜택)를 기대하고, 주최기관은 사전등록부터 현장등록·혜택 발급·\n" +
    "가맹점 정산·현장 운영 인력 근태까지 한꺼번에 챙겨야 합니다.\n\n" +
    "각각의 기능을 별도 시스템·엑셀·종이대장으로 운영하면 누락·중복·정산 오류·인건비 손실이 반복적으로\n" +
    "발생합니다. 모노라마 트래커는 이 모든 흐름을 단 하나의 플랫폼으로 통합합니다.",
    { x: 0.7, y: 1.3, w: 11.9, h: 2.0, fontFace: F, fontSize: 14, color: C.dark, paraSpaceAfter: 8 },
  );
  // 핵심 수치 카드 4개
  const cards = [
    { t: "1개", k: "단일 플랫폼으로\n전체 워크플로우 통합" },
    { t: "4대", k: "스탬프투어·Gift·\n입장관리·현장요원" },
    { t: "실시간", k: "정산·근태·방문통계\n자동 집계" },
    { t: "PWA", k: "별도 앱 설치 없이\n모바일 즉시 사용" },
  ];
  cards.forEach((c, i) => {
    const x = 0.7 + i * 3.05;
    const y = 3.7;
    s.addShape("roundRect", { x, y, w: 2.8, h: 2.6, fill: { color: C.primaryLt }, line: { color: C.primary, width: 1 }, rectRadius: 0.08 });
    s.addText(c.t, { x, y: y+0.2, w: 2.8, h: 1.0, fontFace: F, fontSize: 36, bold: true, color: C.primary, align: "center" });
    s.addText(c.k, { x, y: y+1.3, w: 2.8, h: 1.2, fontFace: F, fontSize: 13, color: C.dark, align: "center", valign: "top" });
  });
  s.addText("본 제안서는 귀 기관의 행사 운영 효율을 획기적으로 끌어올릴 수 있는 솔루션의 전반적 구성·도입 효과·도입 절차·가격 정책을 정리한 자료입니다.",
    { x: 0.7, y: 6.5, w: 11.9, h: 0.6, fontFace: F, fontSize: 12, color: C.gray, italic: true });
}

// ───────────────────────────────────────────────────────────────
//  Slide 3 — 회사 소개
// ───────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  addContentSlide(s, "About Us", "모노라마는 어떤 회사인가요");
  s.addText(
    "(주)모노라마는 디지털 인터랙티브 콘텐츠와 운영 시스템을 결합한 종합 솔루션을 제공하는 IT 전문 회사입니다.\n\n" +
    "전시·관광·축제·박물관·아트페어·체험형 교육 등 오프라인 행사 운영자가 디지털 도구로 더 적은 인력, 더 적은 시간, " +
    "더 적은 비용으로 더 큰 임팩트를 만들 수 있도록 지원하는 것이 우리의 미션입니다.",
    { x: 0.7, y: 1.3, w: 11.9, h: 2.0, fontFace: F, fontSize: 14, color: C.dark, paraSpaceAfter: 10 },
  );
  const rows = [
    ["회사명",          "(주)모노라마"],
    ["설립 비전",        "오프라인 운영 현장의 디지털 전환(DX) 가속"],
    ["대표 솔루션",      "모노라마 트래커 (Stamp 목적지 + Gift + 입장관리 + 현장요원관리)"],
    ["적용 분야",        "전시·축제·관광·박물관·문화행사·기업 마케팅 이벤트·교육 체험"],
    ["기술 스택",        "Node.js + TypeScript + MySQL · PWA · 카카오 지도/우편번호 · 결제 연동"],
    ["운영 모델",        "SaaS 임대형(월·프로젝트 단위) + 온프레미스 구축형(별도 견적)"],
  ];
  s.addTable(rows.map(r => [
    { text: r[0], options: { fontFace: F, fontSize: 12, bold: true, color: C.white, fill: { color: C.primary }, align: "center", valign: "middle" } },
    { text: r[1], options: { fontFace: F, fontSize: 12, color: C.dark, fill: { color: C.white }, valign: "middle" } },
  ]), {
    x: 0.7, y: 3.5, w: 11.9, colW: [2.5, 9.4], rowH: 0.45,
    border: { type: "solid", color: C.border, pt: 0.5 },
  });
}

// ───────────────────────────────────────────────────────────────
//  Slide 4 — 시장 현황 / 문제 인식
// ───────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  addContentSlide(s, "Problem", "기존 운영 방식의 한계");
  // 좌측 — 현장에서 흔히 마주치는 문제
  s.addText("현장에서 흔히 마주치는 문제", { x: 0.5, y: 1.3, w: 6, h: 0.4, fontFace: F, fontSize: 16, bold: true, color: C.warn });
  addBullets(s, [
    "사전등록은 구글폼·네이버폼, 현장등록은 종이대장 — 데이터 동기화가 안 됨",
    "혜택(Gift) 발급은 종이쿠폰·바코드 — 사용/미사용 추적 불가, 부정사용 방지 어려움",
    "가맹점 정산은 엑셀 수기 집계 — 한 행사당 수십 시간 소요, 오류 빈번",
    "퀴즈·체험·미션 콘텐츠는 별도 외주 — 행사가 끝나면 데이터가 사라짐",
    "현장 운영 인력 출퇴근 관리는 단톡방·종이서명 — 근태 분쟁 시 증빙 부족",
    "방문 통계는 행사 종료 후 수집 — 실시간 의사결정 불가",
  ], { x: 0.5, y: 1.7, w: 6, h: 5, size: 13 });
  // 우측 — 비용 손실
  s.addText("결과적으로 발생하는 손실", { x: 7.0, y: 1.3, w: 6, h: 0.4, fontFace: F, fontSize: 16, bold: true, color: C.warn });
  addBullets(s, [
    "운영 인건비 과다 — 동일 데이터를 여러 사람이 중복 입력",
    "혜택 누수 — 미사용 쿠폰 정산 누락, 중복 사용 적발 불가",
    "재방문률 저하 — 방문객 데이터를 다음 행사에 활용 불가",
    "가맹점 신뢰도 하락 — 정산 지연·오차로 인한 분쟁",
    "보고서 작성 부담 — 행사 종료 후 통계 정리에 1~2주 소요",
    "법적 리스크 — 개인정보 수기 관리·근태 증빙 미비",
  ], { x: 7.0, y: 1.7, w: 6, h: 5, size: 13 });
}

// ───────────────────────────────────────────────────────────────
//  Slide 5 — 통합 솔루션 개요
// ───────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  addContentSlide(s, "Solution Overview", "모노라마 트래커 한눈에 보기");
  s.addText(
    "방문객의 사전등록부터 현장 입장 → 콘텐츠 참여 → 혜택 발급/사용 → 정산 → 운영 인력 근태까지 \n" +
    "행사 운영의 전체 생애주기를 단 하나의 플랫폼에서 통합 관리합니다.",
    { x: 0.7, y: 1.2, w: 11.9, h: 0.9, fontFace: F, fontSize: 14, color: C.dark },
  );
  // 4대 모듈 박스
  const modules = [
    { title: "🎯 스탬프 투어",   sub: "목적지 방문 + Quiz", desc: "여러 목적지를 순회하며 QR 스캔·퀴즈 응답으로 미션 달성", color: C.primary },
    { title: "🎁 Gift",          sub: "혜택 발급/사용",     desc: "QR 기반 일회용 Gift 발급, 가맹점에서 PIN 인증 후 결제", color: C.accent },
    { title: "🟠 사전·현장등록", sub: "방문객 관리",        desc: "사전 신청 또는 현장 즉시 등록 — 이메일 인증 + QR 발급", color: C.warn },
    { title: "👷 현장요원관리",  sub: "출퇴근 + 근태",      desc: "현장 인력 자율 등록 + QR 출근체크 + 달력 근태 확인",   color: "9333EA" },
  ];
  modules.forEach((m, i) => {
    const x = 0.5 + i * 3.15;
    const y = 2.4;
    s.addShape("roundRect", { x, y, w: 2.95, h: 3.3, fill: { color: C.white }, line: { color: m.color, width: 2 }, rectRadius: 0.08 });
    s.addShape("rect",      { x, y, w: 2.95, h: 0.7, fill: { color: m.color } });
    s.addText(m.title, { x, y: y+0.05, w: 2.95, h: 0.65, fontFace: F, fontSize: 16, bold: true, color: C.white, align: "center", valign: "middle" });
    s.addText(m.sub,   { x: x+0.1, y: y+0.85, w: 2.75, h: 0.4, fontFace: F, fontSize: 13, bold: true, color: m.color });
    s.addText(m.desc,  { x: x+0.15, y: y+1.3,  w: 2.7,  h: 1.9, fontFace: F, fontSize: 12, color: C.dark, valign: "top" });
  });
  s.addText("✦ 4개 모듈은 독립적으로도 사용 가능하지만, 함께 사용할 때 데이터가 자연스럽게 연계되어 운영 효율이 극대화됩니다.",
    { x: 0.5, y: 6.0, w: 12.3, h: 0.5, fontFace: F, fontSize: 12, color: C.gray, italic: true });
}

// ───────────────────────────────────────────────────────────────
//  Slide 6 — Section Divider 01
// ───────────────────────────────────────────────────────────────
addSectionDivider(pres.addSlide(), "01.", "스탬프 투어 (목적지 방문 + Quiz)",
  "방문객이 여러 목적지를 자발적으로 순회하도록 만드는 핵심 콘텐츠 엔진");

// ───────────────────────────────────────────────────────────────
//  Slide 7 — 스탬프 투어 상세
// ───────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  addContentSlide(s, "01. Stamp 목적지", "방문객이 스스로 움직이도록 만듭니다");
  s.addText("핵심 기능", { x: 0.5, y: 1.2, w: 6, h: 0.4, fontFace: F, fontSize: 16, bold: true, color: C.primary });
  addBullets(s, [
    "프로젝트별 목적지(Location) 자유 등록 — 각 목적지마다 QR 코드 자동 발급",
    "PWA 방문자 앱 — 별도 설치 없이 카메라로 QR 스캔, 진행 현황 자동 저장",
    "목적지별 퀴즈(Quiz) 부착 가능 — 객관식(단일/다중)·주관식·OX 등",
    "정답 시 보너스 Quiz 보상 별도 지급 (Gift 단가와 무관하게 정책 설정)",
    "단계별 보상(Gift Tier) — 30% / 60% / 100% 달성 시 차등 발급 가능",
    "예산 초과 시 자동 발급 중지 옵션 (재무 사고 방지)",
    "프로젝트별 PWA — 한 사용자 휴대폰에 행사별로 별도 앱 아이콘 설치",
  ], { x: 0.5, y: 1.6, w: 6, h: 5, size: 12 });
  s.addText("도입 효과", { x: 7.0, y: 1.2, w: 6, h: 0.4, fontFace: F, fontSize: 16, bold: true, color: C.accent });
  addBullets(s, [
    "방문객 평균 체류 시간 증가 → 객단가 동반 상승",
    "특정 코너 방문률 향상 — 보상 설계로 트래픽 유도 가능",
    "위치 데이터 자동 수집 — 동선 분석으로 다음 행사 기획에 활용",
    "퀴즈 응답 데이터 분석 — 방문객 인사이트 확보",
    "종이 스탬프 카드 폐지 → 운영비 절감 및 친환경",
    "정답률·완주율 실시간 모니터링 — 운영 중 콘텐츠 즉시 조정",
  ], { x: 7.0, y: 1.6, w: 6, h: 5, size: 12 });
}

// ───────────────────────────────────────────────────────────────
//  Slide 8 — Section Divider 02
// ───────────────────────────────────────────────────────────────
addSectionDivider(pres.addSlide(), "02.", "Gift 발급/사용 시스템",
  "혜택을 디지털 QR 로 자동 발급하고, 가맹점이 안전하게 사용 처리");

// ───────────────────────────────────────────────────────────────
//  Slide 9 — Gift 시스템 상세
// ───────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  addContentSlide(s, "02. Gift System", "디지털 혜택, 한 번 발급으로 끝");
  s.addText(
    "방문객이 목적지 미션 또는 퀴즈 보상 조건을 충족하면 PWA 안에서 즉시 Gift QR 이 발급됩니다. \n" +
    "가맹점은 자체 단말(스마트폰·태블릿) 카메라로 이 QR 을 스캔하여 사용 처리하고, 결과는 실시간으로 정산에 반영됩니다.",
    { x: 0.5, y: 1.2, w: 12.3, h: 1.0, fontFace: F, fontSize: 14, color: C.dark },
  );
  // 2단 컬럼 - 발급 / 사용
  const cards = [
    { t: "발급 흐름 (방문객)", c: C.primary, items: [
      "목적지 완주 또는 퀴즈 정답 → Gift 발급 조건 충족",
      "PWA 내 자동 발급 — 일회용 토큰 + QR 이미지",
      "유효기간 표시 + 인증 PIN 6자리 동시 발급",
      "단계별 보상 시 도달 시점마다 차등 발급",
    ]},
    { t: "사용 흐름 (가맹점)", c: C.accent, items: [
      "가맹점 PWA — QR 스캔 (인앱 카메라 또는 사진 업로드)",
      "프로젝트 PIN 6자리 입력으로 위변조 차단",
      "사용 즉시 QR 이미지에 PAID 라벨 자동 스탬프",
      "중복 사용 자동 차단 (동시성 보장)",
    ]},
  ];
  cards.forEach((card, i) => {
    const x = 0.5 + i * 6.4;
    const y = 2.4;
    s.addShape("rect", { x, y, w: 6.2, h: 0.5, fill: { color: card.c } });
    s.addText(card.t, { x, y, w: 6.2, h: 0.5, fontFace: F, fontSize: 15, bold: true, color: C.white, align: "center", valign: "middle" });
    addBullets(s, card.items, { x: x+0.15, y: y+0.6, w: 5.9, h: 3.5, size: 12 });
  });
  s.addText("✦ Gift 단가, 발급 수량, 한도 초과 정책, 단계별 차등 등 세부 정책은 프로젝트 단위로 자유롭게 설정합니다.",
    { x: 0.5, y: 6.5, w: 12.3, h: 0.5, fontFace: F, fontSize: 12, color: C.gray, italic: true });
}

// ───────────────────────────────────────────────────────────────
//  Slide 10 — Section Divider 03
// ───────────────────────────────────────────────────────────────
addSectionDivider(pres.addSlide(), "03.", "사전등록 / 현장등록",
  "방문객의 신상 정보 수집부터 입장 QR 발급, 가맹점 사용처리까지");

// ───────────────────────────────────────────────────────────────
//  Slide 11 — 사전/현장등록 상세
// ───────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  addContentSlide(s, "03. Pre/On-site Registration", "행사 전부터 행사 중까지, 빠짐없이");
  // 사전등록 박스
  s.addShape("roundRect", { x: 0.5, y: 1.2, w: 6.1, h: 5.5, fill: { color: "FFF7ED" }, line: { color: C.warn, width: 1 }, rectRadius: 0.08 });
  s.addText("🟠 사전등록 (Reservation)", { x: 0.7, y: 1.3, w: 5.7, h: 0.5, fontFace: F, fontSize: 18, bold: true, color: "9A3412" });
  addBullets(s, [
    "프로젝트 시작 10일 전부터 (변경 가능) 사전등록 페이지 자동 오픈",
    "이메일 인증 → 동일 이메일 중복 신청 차단",
    "이름·연락처·이메일·주소(카카오 지도)·생년월일 등 항목 자유 설정",
    "단일/다중 선택 폼 항목 지원 — 성별·연령대·방문 경로 등",
    "신청 즉시 입장 QR 발급 — 메일 전송 또는 즉시 다운로드",
    "현장 방문 시 QR 스캔으로 자동 체크인",
    "방문객 정보 + 방문 여부 실시간 대시보드",
  ], { x: 0.7, y: 1.85, w: 5.7, h: 4.8, size: 12 });
  // 현장등록 박스
  s.addShape("roundRect", { x: 6.8, y: 1.2, w: 6.1, h: 5.5, fill: { color: "F0FDF4" }, line: { color: C.accent, width: 1 }, rectRadius: 0.08 });
  s.addText("🟢 현장등록 (Entry)", { x: 7.0, y: 1.3, w: 5.7, h: 0.5, fontFace: F, fontSize: 18, bold: true, color: "166534" });
  addBullets(s, [
    "행사 당일 현장에서 즉시 등록",
    "사전등록과 동일한 입력폼 + 동일한 QR 발급 흐름",
    "키오스크·태블릿 또는 방문객 본인 휴대폰으로 입력",
    "이메일 인증 코드 즉시 발송 — 부정 가입 차단",
    "동일 이메일·동일 번호 중복 등록 차단",
    "단가·수량 한도 별도 설정 (사전과 다른 혜택 가능)",
    "관리자 PIN 검증으로 가맹점이 안전하게 사용 처리",
  ], { x: 7.0, y: 1.85, w: 5.7, h: 4.8, size: 12 });
  s.addText("✦ 사전·현장등록은 옵션입니다. 사용 여부에 따라 자동으로 견적과 사용 가능 기능이 달라집니다.",
    { x: 0.5, y: 6.85, w: 12.3, h: 0.4, fontFace: F, fontSize: 12, color: C.gray, italic: true });
}

// ───────────────────────────────────────────────────────────────
//  Slide 12 — Section Divider 04
// ───────────────────────────────────────────────────────────────
addSectionDivider(pres.addSlide(), "04.", "현장요원관리",
  "운영 인력의 자율 등록부터 QR 출퇴근, 일별/월별 근태 통계까지");

// ───────────────────────────────────────────────────────────────
//  Slide 13 — 현장요원관리 상세
// ───────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  addContentSlide(s, "04. Field Agent Management", "현장 인력, 더 이상 종이 출근부 없이");
  s.addText(
    "행사 운영 인력(안내·진행·통제·정산 보조 등) 의 등록·출퇴근·근태·정산까지 통합 관리합니다.\n" +
    "주최기관은 등록 URL/QR 만 공유하면 되고, 운영 인력은 본인이 직접 신상정보를 입력합니다.",
    { x: 0.5, y: 1.2, w: 12.3, h: 1.0, fontFace: F, fontSize: 14, color: C.dark },
  );
  // 좌측 — 등록
  s.addText("등록 흐름", { x: 0.5, y: 2.3, w: 6, h: 0.4, fontFace: F, fontSize: 16, bold: true, color: C.primary });
  addBullets(s, [
    "주최기관이 등록 URL/QR 을 인력에게 공유",
    "이용약관·개인정보·이메일·푸시 4가지 [필수] 동의",
    "이메일 인증 → 본인 정보 입력 (이름·모바일·이메일·주소)",
    "주민등록증·통장사본 업로드 — 임금 지급 자료",
    "등록 즉시 출퇴근 QR + 신상 정보 PNG 다운로드",
    "PWA 설치 안내 — 본인의 근태 달력을 언제든 조회",
  ], { x: 0.5, y: 2.7, w: 6, h: 4, size: 12 });
  // 우측 — 근태관리
  s.addText("근태 관리", { x: 7.0, y: 2.3, w: 6, h: 0.4, fontFace: F, fontSize: 16, bold: true, color: C.accent });
  addBullets(s, [
    "관리자가 별도 PWA 에서 6자리 PIN 으로 로그인",
    "인력의 QR 을 카메라로 스캔 — 당사자 검증",
    "정시출근 / 지각 중 선택 → 자동 기록",
    "관리자 화면: 인력별 + 일별 두 가지 뷰",
    "정시출근율 / 지각률 / 결근율 자동 계산",
    "월별 달력으로 근태 시각화 — 일자 클릭하여 상세 보기",
  ], { x: 7.0, y: 2.7, w: 6, h: 4, size: 12 });
}

// ───────────────────────────────────────────────────────────────
//  Slide 14 — Section Divider 05
// ───────────────────────────────────────────────────────────────
addSectionDivider(pres.addSlide(), "05.", "시스템 아키텍처 · 보안 · 운영",
  "안정성·확장성·보안을 모두 갖춘 엔터프라이즈급 인프라");

// ───────────────────────────────────────────────────────────────
//  Slide 15 — 아키텍처
// ───────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  addContentSlide(s, "05. Architecture", "기술적 안정성으로 운영을 받칩니다");
  // 계층 박스
  const layers = [
    { y: 1.4, w: 13.0, x: 0.15, t: "방문객 PWA · 사전등록 폼 · 현장요원 PWA · 가맹점 PWA · 관리자 콘솔(/admin) · 슈퍼바이저(/supervisor)", c: C.primary, label: "Presentation (PWA · Web)" },
    { y: 2.5, w: 13.0, x: 0.15, t: "Stamp 목적지 · Gift · 사전·현장등록 · 현장요원관리 · 정산 엔진 · 발송이력 · 견적 자동 계산", c: C.accent, label: "Business Logic (Node.js + TypeScript)" },
    { y: 3.6, w: 13.0, x: 0.15, t: "MySQL 8 / MariaDB · fn_encrypt/fn_decrypt 함수 기반 컬럼 암호화 · 일/주/월 자동 백업", c: "9333EA", label: "Data Layer" },
    { y: 4.7, w: 13.0, x: 0.15, t: "SMTP · 카카오 지도/우편번호 · QR 라이브러리 · 결제(PG) 연동 인터페이스 · Push 알림(Web Push)", c: C.warn, label: "Integration" },
    { y: 5.8, w: 13.0, x: 0.15, t: "Docker · PM2 · Nginx · HTTPS(Let's Encrypt) · Rate Limit · Session 관리 · 로그·모니터링",  c: C.gray, label: "Infrastructure" },
  ];
  layers.forEach(l => {
    s.addShape("roundRect", { x: l.x, y: l.y, w: l.w, h: 0.95, fill: { color: l.c }, line: { color: l.c }, rectRadius: 0.05 });
    s.addText(l.label, { x: l.x+0.15, y: l.y+0.08, w: 4.5, h: 0.35, fontFace: F, fontSize: 11, bold: true, color: C.white });
    s.addText(l.t,     { x: l.x+0.15, y: l.y+0.4,  w: 12.7, h: 0.55, fontFace: F, fontSize: 12, color: C.white });
  });
  s.addText("✦ 클라우드(AWS / NCP / KT) 또는 온프레미스 모두 배포 가능. 평균 응답 200ms 이내, 동시 사용자 5,000명까지 단일 인스턴스 처리.",
    { x: 0.5, y: 6.9, w: 12.3, h: 0.4, fontFace: F, fontSize: 11, color: C.gray, italic: true });
}

// ───────────────────────────────────────────────────────────────
//  Slide 16 — 보안 / 운영
// ───────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  addContentSlide(s, "05. Security & Ops", "안전한 운영을 위한 다층 방어");
  s.addText("개인정보 · 보안", { x: 0.5, y: 1.2, w: 6, h: 0.4, fontFace: F, fontSize: 16, bold: true, color: C.primary });
  addBullets(s, [
    "민감 정보(이름·이메일·연락처) DB 컬럼 단위 AES 암호화",
    "PIN/비밀번호 bcrypt 단방향 해시 + 잠금 정책 (3회 실패 시 supervisor 잠금)",
    "Gift QR 일회용 토큰 + 동시성 보장으로 중복 사용 차단",
    "이메일 인증 코드 10분 만료 + 1분 발송 쿨다운",
    "세션 만료 자동 감지 — 부정 접근 차단",
    "HTTPS 강제 · CORS 화이트리스트 · SQL Injection 자동 방어",
    "주민등록증·통장사본은 비공개 파일 시스템에 저장",
  ], { x: 0.5, y: 1.6, w: 6, h: 5.5, size: 12 });
  s.addText("운영 · 모니터링", { x: 7.0, y: 1.2, w: 6, h: 0.4, fontFace: F, fontSize: 16, bold: true, color: C.accent });
  addBullets(s, [
    "발송이력 자동 로그 — 모든 메일(자동/수동/사유 구분)",
    "프로젝트 상태 자동 전이 — 입금확인/시작일/종료일 기반",
    "프로젝트 종료 전 자동 알림 메일 (Cron Job)",
    "일별 자동 DB 백업 + 14일 보관 (커스텀 가능)",
    "supervisor 콘솔 — 호스트·프로젝트·견적·입금 전사 관리",
    "장애 발생 시 평일 영업시간 1시간 내 응답, 24x7 긴급 회선 별도",
    "정기 업데이트 — 보안 패치 + 신기능 자동 배포(임대형)",
  ], { x: 7.0, y: 1.6, w: 6, h: 5.5, size: 12 });
}

// ───────────────────────────────────────────────────────────────
//  Slide 17 — Section Divider 06
// ───────────────────────────────────────────────────────────────
addSectionDivider(pres.addSlide(), "06.", "도입 효과",
  "숫자로 증명하는 디지털 전환의 가치");

// ───────────────────────────────────────────────────────────────
//  Slide 18 — 정량 효과
// ───────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  addContentSlide(s, "06. Quantitative Impact", "기존 대비 정량적 효과");
  const headers = ["항목", "기존 운영 방식", "모노라마 트래커 도입 후", "개선 효과"];
  const rows = [
    ["방문객 등록 처리 시간",   "1인당 3~5분 (수기 작성)",    "1인당 30초 이내 (QR + 폼)",            "약 90% 단축"],
    ["혜택 정산 소요 시간",     "행사당 20~40시간 (엑셀)",     "실시간 자동 집계",                       "100% 자동화"],
    ["인건비 (운영 인력)",      "별도 정산담당 2~3명 상주",    "관리자 1명 + 시스템 자동화",             "약 60% 절감"],
    ["방문객 데이터 활용도",     "0% (행사 종료 후 분실)",    "100% (재방문 캠페인·분석에 활용)",        "신규 매출 창출"],
    ["혜택 누수율",             "10~20% (중복·미사용·분실)",  "0%~1% (QR 일회성 + DB 추적)",            "혜택 비용 절감"],
    ["근태 분쟁",                "월 수건 발생 (증빙 부족)",   "0건 (QR 스캔 + 시간 기록)",              "법적 리스크 제로"],
    ["보고서 작성 시간",          "행사 종료 후 1~2주",        "실시간 대시보드 + 1-click 엑셀",         "약 95% 단축"],
  ];
  const tableData = [
    headers.map(h => ({ text: h, options: { fontFace: F, fontSize: 12, bold: true, color: C.white, fill: { color: C.primary }, align: "center", valign: "middle" } })),
    ...rows.map(r => [
      { text: r[0], options: { fontFace: F, fontSize: 11, bold: true, color: C.dark,  fill: { color: C.grayLt },  valign: "middle" } },
      { text: r[1], options: { fontFace: F, fontSize: 11, color: C.gray,              fill: { color: C.white },   valign: "middle" } },
      { text: r[2], options: { fontFace: F, fontSize: 11, color: C.dark,              fill: { color: C.white },   valign: "middle" } },
      { text: r[3], options: { fontFace: F, fontSize: 11, bold: true, color: C.accent, fill: { color: C.accentLt }, align: "center", valign: "middle" } },
    ]),
  ];
  s.addTable(tableData as any, {
    x: 0.5, y: 1.3, w: 12.3, colW: [3.0, 3.5, 3.5, 2.3], rowH: 0.55,
    border: { type: "solid", color: C.border, pt: 0.5 },
  });
}

// ───────────────────────────────────────────────────────────────
//  Slide 19 — 정성 효과
// ───────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  addContentSlide(s, "06. Qualitative Impact", "정성적 효과 — 더 큰 그림");
  const cards = [
    { e: "🚀", t: "전사적 디지털 전환", d: "단순한 도구 도입이 아니라 운영 프로세스 전반의 DX. 차기 행사·연계 사업까지 확장 가능한 기반 마련.", c: C.primary },
    { e: "🎨", t: "방문객 경험 혁신",   d: "종이 스탬프·종이 쿠폰이 사라지면 방문객은 더 빠르고 더 깨끗하고 더 재미있게 경험합니다.",   c: C.accent },
    { e: "📊", t: "데이터 기반 의사결정", d: "매년 똑같이 반복되던 행사가, 데이터에 기반해 매번 진화합니다. 인기 동선·코너·시간대를 정확히 파악.", c: C.warn },
    { e: "🤝", t: "가맹점·인력과의 신뢰", d: "정산이 늦지 않고 근태 분쟁이 없습니다. 같이 일하는 사람들이 만족해야 행사도 성공합니다.",     c: "9333EA" },
    { e: "🌱", t: "친환경 운영",         d: "종이 인쇄물, 쿠폰, 스탬프 카드를 모두 디지털화. ESG 보고서에 즉시 반영 가능.",                  c: "059669" },
    { e: "🏆", t: "브랜드 이미지 제고", d: "디지털 운영은 이제 표준입니다. 도입 자체가 주최기관의 전문성을 보여주는 시그널.",                  c: C.primary },
  ];
  cards.forEach((c, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 0.5 + col * 4.25;
    const y = 1.3 + row * 2.95;
    s.addShape("roundRect", { x, y, w: 4.1, h: 2.7, fill: { color: C.white }, line: { color: c.c, width: 1.5 }, rectRadius: 0.08 });
    s.addText(c.e, { x, y: y+0.1, w: 4.1, h: 0.7, fontFace: F, fontSize: 36, align: "center" });
    s.addText(c.t, { x: x+0.1, y: y+0.85, w: 3.9, h: 0.45, fontFace: F, fontSize: 14, bold: true, color: c.c, align: "center" });
    s.addText(c.d, { x: x+0.2, y: y+1.35, w: 3.7, h: 1.3, fontFace: F, fontSize: 11, color: C.dark, align: "left", valign: "top" });
  });
}

// ───────────────────────────────────────────────────────────────
//  Slide 20 — Section Divider 07
// ───────────────────────────────────────────────────────────────
addSectionDivider(pres.addSlide(), "07.", "가격 정책 · 견적",
  "투명하고 합리적인 가격 — 모듈 단위로 자유롭게 조합");

// ───────────────────────────────────────────────────────────────
//  Slide 21 — 가격 정책
// ───────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  addContentSlide(s, "07. Pricing", "이용료 + 옵션 + 고정비");
  s.addText("기본 구조 — 프로젝트 단위 일할 청구 + 선택 옵션 + 초기 세팅",
    { x: 0.5, y: 1.2, w: 12.3, h: 0.45, fontFace: F, fontSize: 13, color: C.gray, italic: true });
  const headers = ["분류", "항목", "단가", "산정 방식"];
  const rows = [
    ["기본",   "스탬프 투어 + Gift 이용료",     "100,000원 / 일",  "프로젝트 시작일 ~ 종료일 일수"],
    ["옵션",   "사전등록 (선택)",                "10,000원 / 일",   "신청 가능 일수 (기본: 시작 10일 전 ~ 시작일)"],
    ["옵션",   "현장등록 (선택)",                "10,000원 / 일",   "프로젝트 전체 기간"],
    ["옵션",   "현장요원관리 (선택)",            "50,000원 / 정액",  "프로젝트당 정액 (운영 인력 수 무관)"],
    ["고정",   "랜딩페이지 디자인 2안",          "100,000원 × 2",   "직접 제공 시 면제"],
    ["고정",   "모바일앱 아이콘",                "30,000원",        "직접 제공 시 면제"],
    ["고정",   "초기 세팅",                      "500,000원",       "1회만 (프로젝트 첫 도입 시)"],
  ];
  const tbl = [
    headers.map(h => ({ text: h, options: { fontFace: F, fontSize: 12, bold: true, color: C.white, fill: { color: C.primary }, align: "center", valign: "middle" } })),
    ...rows.map(r => {
      const isOpt = r[0] === "옵션";
      const cls = r[0] === "기본" ? C.primary : (isOpt ? C.warn : "9333EA");
      return [
        { text: r[0], options: { fontFace: F, fontSize: 11, bold: true, color: C.white, fill: { color: cls }, align: "center", valign: "middle" } },
        { text: r[1], options: { fontFace: F, fontSize: 11, color: C.dark, fill: { color: C.white }, valign: "middle" } },
        { text: r[2], options: { fontFace: F, fontSize: 11, bold: true, color: C.dark, fill: { color: C.grayLt }, align: "right", valign: "middle" } },
        { text: r[3], options: { fontFace: F, fontSize: 11, color: C.gray, fill: { color: C.white }, valign: "middle" } },
      ];
    }),
  ];
  s.addTable(tbl as any, {
    x: 0.5, y: 1.8, w: 12.3, colW: [1.2, 4.5, 2.6, 4.0], rowH: 0.55,
    border: { type: "solid", color: C.border, pt: 0.5 },
  });
  s.addText("※ 단가는 표준 단가이며, 프로젝트 규모·연간 도입 여부·기관 협력 조건에 따라 협상 가능합니다.",
    { x: 0.5, y: 6.8, w: 12.3, h: 0.4, fontFace: F, fontSize: 11, color: C.gray, italic: true });
}

// ───────────────────────────────────────────────────────────────
//  Slide 22 — 견적 예시 (Case A·B·C)
// ───────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  addContentSlide(s, "07. Sample Quotation", "견적 예시 — 도입 규모별");
  const cases = [
    { name: "Case A — 단일 전시 (소규모)", days: 10, opts: { rsv: 0, ent: 0, agent: 0 }, color: C.primary,
      desc: "전시기간 10일, 사전등록·현장요원관리 미사용",
      breakdown: [
        ["이용료",  "100,000원 × 10일", "1,000,000원"],
        ["디자인 2안", "100,000원 × 2", "200,000원"],
        ["아이콘",   "—",                  "30,000원"],
        ["초기 세팅", "—",                "500,000원"],
        ["합계",     "",                "1,730,000원"],
      ]},
    { name: "Case B — 축제 (중규모)", days: 7, opts: { rsv: 10, ent: 1, agent: 1 }, color: C.accent,
      desc: "7일 축제 + 사전등록(10일) + 현장등록 + 현장요원",
      breakdown: [
        ["이용료",       "100,000원 × 7일", "700,000원"],
        ["사전등록",     "10,000원 × 10일",  "100,000원"],
        ["현장등록",     "10,000원 × 7일",    "70,000원"],
        ["현장요원관리", "정액",              "50,000원"],
        ["고정비",       "디자인+아이콘+세팅","730,000원"],
        ["합계",         "",                "1,650,000원"],
      ]},
    { name: "Case C — 통합 박람회 (대규모)", days: 30, opts: { rsv: 14, ent: 1, agent: 1 }, color: C.warn,
      desc: "30일 박람회 + 모든 옵션 + 대규모 현장 인력",
      breakdown: [
        ["이용료",       "100,000원 × 30일", "3,000,000원"],
        ["사전등록",     "10,000원 × 14일",  "140,000원"],
        ["현장등록",     "10,000원 × 30일",  "300,000원"],
        ["현장요원관리", "정액",              "50,000원"],
        ["고정비",       "디자인+아이콘+세팅","730,000원"],
        ["합계",         "",                "4,220,000원"],
      ]},
  ];
  cases.forEach((c, i) => {
    const x = 0.4 + i * 4.2;
    const y = 1.3;
    s.addShape("roundRect", { x, y, w: 4.05, h: 5.8, fill: { color: C.white }, line: { color: c.color, width: 2 }, rectRadius: 0.08 });
    s.addShape("rect", { x, y, w: 4.05, h: 0.6, fill: { color: c.color } });
    s.addText(c.name, { x, y, w: 4.05, h: 0.6, fontFace: F, fontSize: 13, bold: true, color: C.white, align: "center", valign: "middle" });
    s.addText(c.desc, { x: x+0.15, y: y+0.7, w: 3.8, h: 0.6, fontFace: F, fontSize: 10, color: C.gray, italic: true });
    const trs = c.breakdown.map((r, ri) => {
      const isTotal = r[0] === "합계";
      return [
        { text: r[0], options: { fontFace: F, fontSize: 10, bold: isTotal, color: isTotal ? c.color : C.dark, fill: { color: isTotal ? C.grayLt : C.white } } },
        { text: r[1], options: { fontFace: F, fontSize: 9, color: C.gray, fill: { color: isTotal ? C.grayLt : C.white } } },
        { text: r[2], options: { fontFace: F, fontSize: 10, bold: isTotal, color: isTotal ? c.color : C.dark, fill: { color: isTotal ? C.grayLt : C.white }, align: "right" } },
      ];
    });
    s.addTable(trs as any, { x: x+0.15, y: y+1.4, w: 3.75, colW: [1.2, 1.4, 1.15], rowH: 0.4, border: { type: "solid", color: C.border, pt: 0.3 } });
  });
}

// ───────────────────────────────────────────────────────────────
//  Slide 23 — Section Divider 08
// ───────────────────────────────────────────────────────────────
addSectionDivider(pres.addSlide(), "08.", "도입 일정 · 운영 지원",
  "킥오프부터 운영 종료까지, 명확한 단계와 책임");

// ───────────────────────────────────────────────────────────────
//  Slide 24 — 도입 일정
// ───────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  addContentSlide(s, "08. Roadmap", "표준 도입 일정 — 8주 표준 모델");
  const phases = [
    { n: "1주차", t: "킥오프 · 요구사항 정의",  d: "이해관계자 미팅 · 기능 범위 확정 · 가맹점/현장요원 구조 협의", c: C.primary },
    { n: "2주차", t: "데이터 마이그레이션 준비", d: "기존 데이터 정제 · 마이그레이션 스크립트 작성 · 테스트", c: C.primary },
    { n: "3주차", t: "콘텐츠 제작",              d: "랜딩페이지 디자인 · 목적지·퀴즈·혜택 정책 설정 · QR 디자인", c: C.accent },
    { n: "4주차", t: "사전등록 오픈",            d: "사전등록 페이지 라이브 · 이메일 인증 흐름 점검 · 운영 매뉴얼 전달", c: C.accent },
    { n: "5주차", t: "가맹점·현장요원 등록",     d: "가맹점 모집 및 승인 · 현장요원 등록 URL 공유 및 등록 확인", c: C.warn },
    { n: "6주차", t: "리허설",                  d: "전체 흐름 시뮬레이션 · 카메라 스캔 안정성 점검 · 가맹점 PIN 테스트", c: C.warn },
    { n: "7~8주차", t: "행사 운영",              d: "실시간 모니터링 · 현장 지원 (필요시 파견) · 일별 정산 보고", c: "9333EA" },
    { n: "종료 후", t: "리포트 · 데이터 인수인계", d: "종합 분석 리포트 · 데이터 백업 인수인계 · 차기 행사 협의", c: C.gray },
  ];
  phases.forEach((p, i) => {
    const x = 0.4;
    const y = 1.25 + i * 0.69;
    s.addShape("roundRect", { x, y, w: 1.5, h: 0.6, fill: { color: p.c }, line: { color: p.c }, rectRadius: 0.05 });
    s.addText(p.n, { x, y, w: 1.5, h: 0.6, fontFace: F, fontSize: 11, bold: true, color: C.white, align: "center", valign: "middle" });
    s.addShape("roundRect", { x: x+1.6, y, w: 11.2, h: 0.6, fill: { color: C.white }, line: { color: C.border }, rectRadius: 0.05 });
    s.addText(p.t, { x: x+1.75, y, w: 3.0, h: 0.6, fontFace: F, fontSize: 12, bold: true, color: p.c, valign: "middle" });
    s.addText(p.d, { x: x+4.75, y, w: 8.0, h: 0.6, fontFace: F, fontSize: 11, color: C.dark, valign: "middle" });
  });
  s.addText("✦ 8주 표준 모델 — 행사 규모에 따라 4주(긴급) ~ 12주(대규모) 로 조정 가능합니다.",
    { x: 0.4, y: 6.85, w: 12.5, h: 0.35, fontFace: F, fontSize: 11, color: C.gray, italic: true });
}

// ───────────────────────────────────────────────────────────────
//  Slide 25 — 운영 지원 SLA
// ───────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  addContentSlide(s, "08. SLA & Support", "운영 지원 · SLA");
  const headers = ["구분", "정의", "응답 시간", "복구 시간"];
  const rows = [
    ["Critical", "서비스 전체 중단 (방문객 신청·결제 불가)", "10분 이내 (24x7)",  "1시간 이내"],
    ["High",     "주요 기능 장애 (정산·QR 발급)",            "30분 이내 (24x7)",  "4시간 이내"],
    ["Medium",   "일부 기능 장애 (관리자 화면 일부)",          "2시간 이내 (영업시간)", "1영업일 이내"],
    ["Low",      "UI 결함·문서·문의",                       "1영업일 이내",        "차기 정기 배포"],
  ];
  const tbl = [
    headers.map(h => ({ text: h, options: { fontFace: F, fontSize: 13, bold: true, color: C.white, fill: { color: C.primary }, align: "center", valign: "middle" } })),
    ...rows.map((r, i) => {
      const color = ["DC2626", "D97706", "0EA5E9", "64748B"][i];
      return [
        { text: r[0], options: { fontFace: F, fontSize: 12, bold: true, color: C.white, fill: { color }, align: "center", valign: "middle" } },
        { text: r[1], options: { fontFace: F, fontSize: 12, color: C.dark, fill: { color: C.white }, valign: "middle" } },
        { text: r[2], options: { fontFace: F, fontSize: 12, color: C.dark, fill: { color: C.grayLt }, align: "center", valign: "middle" } },
        { text: r[3], options: { fontFace: F, fontSize: 12, color: C.dark, fill: { color: C.white }, align: "center", valign: "middle" } },
      ];
    }),
  ];
  s.addTable(tbl as any, { x: 0.5, y: 1.3, w: 12.3, colW: [1.5, 5.8, 2.5, 2.5], rowH: 0.7, border: { type: "solid", color: C.border, pt: 0.5 } });
  s.addText("부가 지원", { x: 0.5, y: 4.9, w: 12, h: 0.4, fontFace: F, fontSize: 16, bold: true, color: C.accent });
  addBullets(s, [
    "행사 운영 기간 동안 전담 매니저 1인 배정 (대규모 프로젝트)",
    "행사 운영 매뉴얼·동영상 가이드 · 운영진/가맹점/현장요원별 별도 제공",
    "원격 화면 공유 지원 (TeamViewer · AnyDesk) — 야간/주말 가능",
    "정기 업데이트 자동 반영 (보안 패치 + 신기능)",
    "행사 종료 후 종합 리포트 제공 (정량·정성 분석)",
  ], { x: 0.5, y: 5.3, w: 12, h: 2, size: 12 });
}

// ───────────────────────────────────────────────────────────────
//  Slide 26 — 도입 사례 / 실증
// ───────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  addContentSlide(s, "Reference", "도입 사례 · 실증 데이터");
  s.addText(
    "모노라마 트래커는 다양한 분야의 행사에서 검증되었습니다. 아래는 최근 운영된 대표 프로젝트들의 요약입니다.\n" +
    "(상세 사례 데이터는 별도 NDA 하에 공유 가능합니다.)",
    { x: 0.5, y: 1.2, w: 12.3, h: 0.9, fontFace: F, fontSize: 13, color: C.gray, italic: true });
  const cases = [
    { t: "국립박물관 3종 세트 투어",  d: "박물관 3개관 순회 + 퀴즈 + Gift 발급. 방문 동선 데이터 기반으로 다음 시즌 콘텐츠 개편.",                v: ["방문 12,000명", "완주율 78%", "Gift 사용 9,400건"] },
    { t: "대전 드림아레나 26",        d: "사전등록 + 현장요원관리 통합 운영. 7일 행사 동안 운영 인력 30명 근태 100% 자동 기록.",                v: ["사전등록 8,500명", "근태 분쟁 0건", "정산 D+1 완료"] },
    { t: "지자체 문화축제",            d: "현장등록만 사용, 키오스크 + 현장 직원 태블릿 양방향 운영. 종이 쿠폰 100% 디지털 전환.",        v: ["행사 5일", "현장등록 4,200명", "혜택 누수 0%"] },
  ];
  cases.forEach((c, i) => {
    const y = 2.3 + i * 1.6;
    s.addShape("roundRect", { x: 0.5, y, w: 12.3, h: 1.4, fill: { color: C.white }, line: { color: C.border }, rectRadius: 0.05 });
    s.addText(c.t, { x: 0.7, y: y+0.1, w: 5.5, h: 0.4, fontFace: F, fontSize: 14, bold: true, color: C.primary });
    s.addText(c.d, { x: 0.7, y: y+0.55, w: 8.0, h: 0.8, fontFace: F, fontSize: 11, color: C.dark, valign: "top" });
    c.v.forEach((v, j) => {
      const vx = 9.0 + j * 1.25;
      s.addShape("roundRect", { x: vx, y: y+0.35, w: 1.15, h: 0.7, fill: { color: C.primaryLt }, line: { color: C.primary }, rectRadius: 0.05 });
      s.addText(v, { x: vx, y: y+0.35, w: 1.15, h: 0.7, fontFace: F, fontSize: 10, bold: true, color: C.primary, align: "center", valign: "middle" });
    });
  });
}

// ───────────────────────────────────────────────────────────────
//  Slide 27 — FAQ
// ───────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  addContentSlide(s, "FAQ", "자주 묻는 질문");
  const qa = [
    { q: "Q. 우리 기관은 IT 인프라가 없습니다. 직접 구축이 가능한가요?",  a: "A. 권장하지 않습니다. 모노라마가 SaaS 임대형으로 모든 인프라를 제공하므로 기관은 별도 서버 구축 없이 시작할 수 있습니다. 다만, 보안 정책상 온프레미스 구축이 필요한 경우 별도 견적으로 가능합니다." },
    { q: "Q. 4개 모듈 중 일부만 사용해도 되나요?",                       a: "A. 네, 모듈 단위로 선택 사용 가능합니다. 사용한 모듈만 청구되며, 도중에 추가/제거도 가능합니다 (사전 협의)." },
    { q: "Q. 방문객 개인정보는 안전하게 보관되나요?",                    a: "A. 컬럼 단위 AES 암호화 + bcrypt 해시 + 비공개 파일 시스템 + 일별 백업 + 14일 보존을 기본 적용합니다. 개인정보보호법 준수 운영을 보장합니다." },
    { q: "Q. 가맹점은 별도 앱을 설치해야 하나요?",                        a: "A. 아닙니다. PWA(Progressive Web App)로 제공되어 모바일 브라우저에서 즉시 사용 가능하며, 홈 화면 추가 시 일반 앱처럼 작동합니다." },
    { q: "Q. 행사 중 사고가 발생하면 어떻게 대응하나요?",                  a: "A. SLA 기준에 따라 Critical 이슈는 24x7 10분 이내 응답, 1시간 이내 복구를 보장합니다. 대규모 행사의 경우 전담 매니저가 배정됩니다." },
    { q: "Q. 다른 시스템(CRM·POS·결제 PG) 과 연동되나요?",               a: "A. REST API 를 통해 연동 가능합니다. 연동 범위에 따라 별도 견적이 발생할 수 있으며, 주요 PG·CRM 은 표준 커넥터를 제공합니다." },
  ];
  qa.forEach((item, i) => {
    const y = 1.2 + i * 0.92;
    s.addText(item.q, { x: 0.5, y, w: 12.3, h: 0.4, fontFace: F, fontSize: 12, bold: true, color: C.primary });
    s.addText(item.a, { x: 0.5, y: y+0.4, w: 12.3, h: 0.5, fontFace: F, fontSize: 11, color: C.dark, valign: "top" });
  });
}

// ───────────────────────────────────────────────────────────────
//  Slide 28 — Call to Action
// ───────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.primary };
  s.addShape("rect", { x: 0, y: 0, w: 0.3, h: 7.5, fill: { color: C.accent } });
  s.addText("다음 단계", { x: 0.7, y: 0.8, w: 12, h: 0.6, fontFace: F, fontSize: 18, color: "BFDBFE", italic: true });
  s.addText("지금, 첫 미팅을 시작합시다", { x: 0.7, y: 1.5, w: 12, h: 1.2, fontFace: F, fontSize: 40, bold: true, color: C.white });
  s.addText(
    "본 제안서는 일반적인 개요입니다. 귀 기관의 행사 규모·일정·내부 제약을 1시간 미팅으로 들으면 \n" +
    "맞춤 견적과 도입 로드맵을 함께 그릴 수 있습니다.",
    { x: 0.7, y: 3.0, w: 12, h: 1.2, fontFace: F, fontSize: 16, color: "DBEAFE" });
  // 4가지 액션 카드
  const actions = [
    { t: "30분 데모",        d: "주요 화면 라이브 시연" },
    { t: "1시간 컨설팅",     d: "귀 기관 요구사항 진단" },
    { t: "맞춤 견적",        d: "프로젝트 단위 정확한 견적" },
    { t: "파일럿 운영",       d: "1회 실증 도입 (조건부)" },
  ];
  actions.forEach((a, i) => {
    const x = 0.7 + i * 3.05;
    const y = 4.7;
    s.addShape("roundRect", { x, y, w: 2.85, h: 1.4, fill: { color: C.white }, line: { color: C.accent, width: 2 }, rectRadius: 0.08 });
    s.addText(a.t, { x, y: y+0.15, w: 2.85, h: 0.5, fontFace: F, fontSize: 16, bold: true, color: C.primary, align: "center" });
    s.addText(a.d, { x: x+0.1, y: y+0.7, w: 2.65, h: 0.6, fontFace: F, fontSize: 12, color: C.dark, align: "center" });
  });
  s.addText("✉ contact@monorama.kr   ☎ 02-0000-0000   🌐 https://monorama.kr",
    { x: 0.7, y: 6.7, w: 12, h: 0.5, fontFace: F, fontSize: 14, color: C.white, italic: true });
}

// ───────────────────────────────────────────────────────────────
//  Slide 29 — 회사 정보 (마지막 표지)
// ───────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.white };
  s.addShape("rect", { x: 0, y: 0, w: 13.33, h: 1.2, fill: { color: C.primary } });
  s.addText("회사 정보 · 연락처", { x: 0.5, y: 0.3, w: 12, h: 0.6, fontFace: F, fontSize: 24, bold: true, color: C.white });
  s.addText("Company Information", { x: 0.5, y: 0.8, w: 12, h: 0.4, fontFace: F, fontSize: 12, color: "BFDBFE", italic: true });
  const info = [
    ["회사명",   "(주)모노라마"],
    ["대표",     "김창호"],
    ["사업자등록번호", "277-86-00185"],
    ["사업분야", "디지털 인터랙티브 콘텐츠 · 운영 시스템 SaaS"],
    ["대표 솔루션", "모노라마 트래커 (Stamp 목적지 + Gift + 입장관리 + 현장요원관리)"],
    ["주요 적용 분야", "전시·축제·관광·박물관·체험형 행사·기업 마케팅 이벤트·교육"],
    ["기술 스택", "Node.js · TypeScript · MySQL · PWA · 카카오 지도/우편번호 · Push 알림"],
    ["문의",     "contact@monorama.kr   ·   02-0000-0000   ·   https://monorama.kr"],
  ];
  info.forEach((r, i) => {
    const y = 1.8 + i * 0.55;
    s.addShape("rect", { x: 0.5, y, w: 2.5, h: 0.5, fill: { color: C.primaryLt }, line: { color: C.border } });
    s.addText(r[0], { x: 0.5, y, w: 2.5, h: 0.5, fontFace: F, fontSize: 12, bold: true, color: C.primary, align: "center", valign: "middle" });
    s.addShape("rect", { x: 3.0, y, w: 9.8, h: 0.5, fill: { color: C.white }, line: { color: C.border } });
    s.addText(r[1], { x: 3.2, y, w: 9.6, h: 0.5, fontFace: F, fontSize: 12, color: C.dark, valign: "middle" });
  });
  s.addText("감사합니다.", { x: 0.5, y: 6.6, w: 12.3, h: 0.6, fontFace: F, fontSize: 22, bold: true, color: C.primary, align: "center", italic: true });
}

// ── 파일 저장 ──
const outPath = path.resolve(process.cwd(), "docs", "모노라마_트래커_도입제안서.pptx");
if (!fs.existsSync(path.dirname(outPath))) fs.mkdirSync(path.dirname(outPath), { recursive: true });
pres.writeFile({ fileName: outPath }).then(() => {
  console.log(`✓ Proposal generated: ${outPath}`);
}).catch((e: any) => {
  console.error("✗ Failed to generate proposal:", e);
  process.exit(1);
});
