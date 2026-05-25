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
import { getSessionInfo, extendSession, sessionTimeout } from "./middleware/session-timeout";
import { touchActivity } from "./middleware/auth";

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

app.use(express.static(path.join(process.cwd(), "public")));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "admin", "index.html"));
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
// 목적지 QR 진입: /v/:serial/:seq, 설치된 PWA 홈: /v/:serial (진행현황만)
app.get("/v/:projectSerial/:locationSeq", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "visitor", "index.html"));
});
app.get("/v/:projectSerial", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "visitor", "index.html"));
});
// 가맹점이 Gift QR을 스캔하면 열리는 사용처리 페이지
app.get("/g/:token", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "gift", "index.html"));
});

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "tracker", time: new Date().toISOString() });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[server error]", err);
  if (res.headersSent) return;
  res.status(500).json({ error: "internal_server_error", message: err.message });
});

async function autoUpdateProjectStatuses(): Promise<void> {
  // 입금확인됨 + 시작일 도래/경과 → 진행중(started)
  await pool.execute(
    `UPDATE projects
     SET status = 'started', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
     WHERE deposit_confirmed_at IS NOT NULL
       AND status IN ('deposit_confirmed', 'ready_to_start')
       AND from_date <= CURDATE()`,
  );
  // 입금확인됐지만 아직 시작일 전 → 시작대기(ready_to_start)
  await pool.execute(
    `UPDATE projects
     SET status = 'ready_to_start', updated_at = NOW()
     WHERE deposit_confirmed_at IS NOT NULL
       AND status = 'deposit_confirmed'
       AND from_date > CURDATE()`,
  );
  // 진행중 + 종료일 경과 → 완료(completed)
  await pool.execute(
    `UPDATE projects
     SET status = 'completed', updated_at = NOW()
     WHERE status = 'started' AND to_date < CURDATE()`,
  );
}

autoUpdateProjectStatuses().catch(console.error);
setInterval(() => autoUpdateProjectStatuses().catch(console.error), 60 * 60 * 1000);

app.listen(port, () => {
  console.log(`Tracker server started at http://localhost:${port}`);
});
