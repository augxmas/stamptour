import path from "node:path";
import express from "express";
import cors from "cors";
import session from "express-session";
import cookieParser from "cookie-parser";
import MySQLStoreFactory from "express-mysql-session";
import dotenv from "dotenv";
import pool from "./config/database";
import hostAuthRouter from "./routes/host-auth";
import hostProjectRouter from "./routes/host-project";
import supervisorRouter from "./routes/supervisor";
import visitorRouter from "./routes/visitor";
import giftRouter from "./routes/gift";
import merchantRouter from "./routes/merchant";
import integrationRouter from "./routes/integration";
import fieldAgentRouter from "./routes/field-agent";
import surveyRouter from "./routes/survey";
import partnerRouter from "./routes/partner";
import { getSessionInfo, extendSession, sessionTimeout } from "./middleware/session-timeout";
import { touchActivity } from "./middleware/auth";
import { scheduleProjectEndingNotifications } from "./jobs/project-ending.job";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 3000);

const MySQLStore = MySQLStoreFactory(session as any);
const sessionStore = new MySQLStore(
  {
    clearExpired: true,
    checkExpirationInterval: 60 * 1000,
    expiration: 4 * 60 * 1000,
    createDatabaseTable: true,
    schema: {
      tableName: "sessions",
      columnNames: {
        session_id: "session_id",
        expires: "expires",
        data: "data",
      },
    },
  } as any,
  pool as any,
);

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  session({
    secret: process.env.SESSION_SECRET ?? "tracker_secret",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: false,
      maxAge: 4 * 60 * 1000,
    },
  }),
);

// 세션 상태 조회/연장은 유휴 타이머를 리셋하지 않도록 reset 미들웨어보다 먼저 등록한다
app.get("/api/session-info", getSessionInfo);
app.post("/api/session-extend", extendSession);

app.use(sessionTimeout);
app.use(touchActivity);

app.use("/api/host", hostAuthRouter);
app.use("/api/host", hostProjectRouter);
app.use("/api/supervisor", supervisorRouter);
app.use("/api/visitor", visitorRouter);
app.use("/api/gift", giftRouter);
app.use("/api/merchant", merchantRouter);
app.use("/api/integration", integrationRouter);
app.use("/api/field-agent", fieldAgentRouter);   // 공개 등록 + 근태 PWA + admin (sess.host 검사 내부)
app.use("/api/survey", surveyRouter);             // host 설문 설정 + 공개 응답
app.use("/api/partner", partnerRouter);           // 참여기관 폼 설정 + 신청/관리

// 참가기관 로그인 — 정적 미들웨어보다 먼저 처리 (public/partner/index.html 자동 서빙 차단)
app.get(["/partner", "/partner/"], (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "partner", "auth.html"));
});
// public 정적 파일 — 단, partner 디렉토리의 자동 index.html 서빙은 막음
app.use(express.static(path.join(process.cwd(), "public"), { index: false }));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "admin", "index.html"));
});
// 모바일 관리자 PWA (현장요원 근태, 경품수령, 사전·현장등록 확인 통합)
app.get("/admin/m", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "admin-m", "index.html"));
});
app.get("/admin-m", (_req, res) => res.redirect("/admin/m"));
app.get("/admin/m/manifest.json", (_req, res) => {
  res.type("application/manifest+json").send(JSON.stringify({
    id: "/admin/m",
    name: "모노라마 관리자",
    short_name: "관리자",
    start_url: "/admin/m",
    scope: "/admin/m/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#1d4ed8",
    icons: [
      { src: "/favicon-blue.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/favicon-blue.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" },
    ],
  }));
});
app.get("/admin/m/sw.js", (_req, res) => {
  res.setHeader("Service-Worker-Allowed", "/admin/m/");
  res.type("application/javascript");
  res.sendFile(path.join(process.cwd(), "public", "admin-m", "service-worker.js"));
});
app.get("/supervisor", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "supervisor", "index.html"));
});
app.get("/merchant", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "merchant", "index.html"));
});
// 서비스워커는 /v/ 스코프를 제어해야 하므로 /v/ 경로에서 제공한다 (param 라우트보다 먼저 등록)
app.get("/v/sw.js", (_req, res) => {
  res.setHeader("Service-Worker-Allowed", "/v/");
  res.type("application/javascript");
  res.sendFile(path.join(process.cwd(), "public", "visitor", "service-worker.js"));
});
// 프로젝트별 SW — 스코프를 /v/{serial}/ 로 분리하여 프로젝트별 독립 PWA 가능
app.get("/v/:projectSerial/sw.js", (_req, res) => {
  res.setHeader("Service-Worker-Allowed", "/v/");
  res.type("application/javascript");
  res.sendFile(path.join(process.cwd(), "public", "visitor", "service-worker.js"));
});
// Tour QR 진입: /v/:serial/:seq, 설치된 PWA 홈: /v/:serial (진행현황만)
app.get("/v/:projectSerial/:locationSeq", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "visitor", "index.html"));
});
app.get("/v/:projectSerial", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "visitor", "index.html"));
});
// 사전등록 / 현장등록 랜딩 페이지 (입장 희망객 view)
app.get("/reserve/:serial", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "reserve", "index.html"));
});
app.get("/entry/:serial", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "reserve", "index.html"));
});

// 사전/현장등록 통합 진입 — 프로젝트 상태에 따라 자동 분기
//   - 프로젝트 시작 전 (status: ready_to_start, 또는 from_date 이전) → /reserve/{serial}
//   - 프로젝트 시작 후 (status: started, 또는 from_date 이후) → /entry/{serial}
app.get("/register/:serial", async (req, res) => {
  const serial = String(req.params.serial || "");
  try {
    const [rows] = await pool.execute(
      "SELECT status, from_date, reservation_use, entry_use FROM projects WHERE project_serial = ?",
      [serial],
    );
    const p = (Array.isArray(rows) ? rows[0] : null) as any;
    if (!p) { res.status(404).send("프로젝트를 찾을 수 없습니다."); return; }
    const now = new Date();
    const fromDate = p.from_date ? new Date(p.from_date) : null;
    // 시작 여부: status='started' 이거나 from_date 가 오늘 이전
    const started = p.status === "started"
      || p.status === "completed"
      || (fromDate && fromDate <= now);
    // 분기 — 사용 옵션 함께 체크
    if (started) {
      if (Number(p.entry_use) === 1) { res.redirect(`/entry/${serial}`); return; }
      if (Number(p.reservation_use) === 1) { res.redirect(`/reserve/${serial}`); return; }
    } else {
      if (Number(p.reservation_use) === 1) { res.redirect(`/reserve/${serial}`); return; }
      if (Number(p.entry_use) === 1) { res.redirect(`/entry/${serial}`); return; }
    }
    // 둘 다 사용 안 함 → visitor 메뉴로
    res.redirect(`/v/${serial}`);
  } catch (e) {
    res.status(500).send("서버 오류");
  }
});
// 현장요원 PWA — 서비스워커 (스코프 /agent-register/{serial}/)
app.get("/agent-register/sw.js", (_req, res) => {
  res.setHeader("Service-Worker-Allowed", "/agent-register/");
  res.type("application/javascript");
  res.sendFile(path.join(process.cwd(), "public", "agent-register", "service-worker.js"));
});
app.get("/agent-register/:serial/sw.js", (_req, res) => {
  res.setHeader("Service-Worker-Allowed", "/agent-register/");
  res.type("application/javascript");
  res.sendFile(path.join(process.cwd(), "public", "agent-register", "service-worker.js"));
});
// 동적 manifest — 프로젝트 이름이 들어감
app.get("/agent-register/:serial/manifest.json", async (req, res) => {
  const serial = String(req.params.serial || "");
  let projectName = "";
  try {
    const [rows] = await pool.execute(
      `SELECT project_name FROM projects WHERE project_serial = ?`, [serial],
    );
    const p = (Array.isArray(rows) ? rows[0] : null) as any;
    if (p?.project_name) projectName = String(p.project_name);
  } catch {/* fallback */}
  // 앱 이름: "현장요원-프로젝트명" / 짧은 이름: "현장요원-(앞 8자)"
  const appName = projectName ? `현장요원-${projectName}` : "현장요원";
  const shortName = projectName
    ? `현장요원-${projectName.length > 8 ? projectName.slice(0, 8) + "…" : projectName}`
    : "현장요원";
  res.type("application/manifest+json").json({
    name: appName,
    short_name: shortName,
    start_url: `/agent-register/${serial}`,
    scope: `/agent-register/${serial}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#f0fdf4",
    theme_color: "#15803d",
    icons: [
      { src: "/favicon-green.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/favicon-green.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" },
    ],
  });
});
// 현장요원 등록 폼
app.get("/agent-register/:serial", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "agent-register", "index.html"));
});
// 현장요원 근태관리 PWA
app.get("/agent-att/:serial", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "agent-att", "index.html"));
});
// 가맹점이 Gift QR을 스캔하면 열리는 사용처리 페이지
app.get("/g/:token", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "gift", "index.html"));
});

// 도입 제안서 PPTX 다운로드 (영업자료 — 인증 없음)
app.get("/proposal/download", (_req, res) => {
  const filePath = path.join(process.cwd(), "docs", "모노라마_트래커_도입제안서.pptx");
  res.download(filePath, "모노라마_트래커_도입제안서.pptx");
});
// 사전등록/현장등록 QR — 스마트 디스패처 (가맹점이면 사용처리, 아니면 visitor PWA 로 리디렉트)
app.get("/r/:serial/:token", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "redeem", "index.html"));
});
// 설문조사 응답 페이지 (공개)
// 참가기관 로그인/대시보드 — serial 없이 접속 시 로그인
//   /partner, /partner/ 둘 다 로그인 페이지로 (trailing slash 호환)
app.get(["/partner", "/partner/"], (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "partner", "auth.html"));
});
app.get("/partner/:serial", (_req, res) => {
  // serial 이 빈 문자열이면 (즉 /partner/ 접속 시) 로그인으로 fallback
  const serial = String(_req.params.serial || "").trim();
  if (!serial) {
    res.sendFile(path.join(process.cwd(), "public", "partner", "auth.html"));
    return;
  }
  res.sendFile(path.join(process.cwd(), "public", "partner", "index.html"));
});
app.get("/survey/:serial", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "survey", "index.html"));
});

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "tracker", time: new Date().toISOString() });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[server error]", err);
  if (res.headersSent) return;
  res.status(500).json({ error: "internal_server_error", message: err.message });
});

// 프로젝트 상태 일일 자동 전이.
// 본 로직은 sql/scheduler.sql 의 sp_update_project_statuses() 에 정의되어 있고
// DB EVENT ev_daily_project_status_update 로 매일 00:05 자동 실행됨.
// Node 측에서는 (1) 서버 부팅 시 즉시 1회, (2) event_scheduler 가 OFF 인 환경 대비
// 매시간 동일 SP 를 호출해 안전망 역할.
async function autoUpdateProjectStatuses(): Promise<void> {
  await pool.query("CALL sp_update_project_statuses('node')");
}

autoUpdateProjectStatuses().catch(console.error);
setInterval(() => autoUpdateProjectStatuses().catch(console.error), 60 * 60 * 1000);

// 프로젝트 종료일 3일 전 ~ 종료일까지 매일 1회 담당자 + 참여 가맹점에게 알림
scheduleProjectEndingNotifications();

app.listen(port, () => {
  console.log(`Tracker server started at http://localhost:${port}`);
});
