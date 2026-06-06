// ============================================================
//  외부 연동 API — /api/integration/...
//
//  목적: 외부 시스템이 프로젝트의 사전등록 폼 구성을 조회/설정.
//  인증: 프로젝트의 PIN (사전 발급된 4자리 비밀번호) 을
//        HTTP 헤더 `X-Project-PIN` 으로 전달.
//
//  공통 응답: { ok: true, ... } | { ok: false, error: "<code>", message?: string }
//
//  ── 사용 예 (curl) ──
//
//  1) 사전등록 폼 구성 조회 (POST)
//     curl -X POST "https://<host>/api/integration/projects/<serial>/reservation-config" \
//          -H "Content-Type: application/json" \
//          -H "X-Project-PIN: 1234"
//     응답:
//     {
//       "ok": true,
//       "project": {"serial":"20260604_0001","name":"...","status":"ready_to_start"},
//       "reservation": {"enabled":true,"amount":5000,"label":"음료 1잔","max_count":100,"stop_on_limit":true},
//       "entry":       {"enabled":true,"amount":2000,"label":"기념품","max_count":0,"stop_on_limit":false},
//       "fields": [
//         {"field_key":"name","label":"이름","input_type":"text","required":true,"sort_order":0},
//         {"field_key":"mobile","label":"모바일 전화","input_type":"phone","required":true,"sort_order":10},
//         ...
//       ]
//     }
//
//  2) 폼 구성 설정 (POST — 덮어쓰기)
//     curl -X POST "https://<host>/api/integration/projects/<serial>/reservation-config/set" \
//          -H "Content-Type: application/json" \
//          -H "X-Project-PIN: 1234" \
//          -d '{
//                "reservation": {"enabled":true,"benefit_amount":5000,"benefit_label":"음료","benefit_max_count":100,"stop_on_limit":true},
//                "entry":       {"enabled":true,"benefit_amount":2000,"benefit_label":"기념품","benefit_max_count":0,"stop_on_limit":false},
//                "fields": [
//                  {"field_key":"name",   "is_required":true},
//                  {"field_key":"mobile", "is_required":true},
//                  {"field_key":"referral_source", "is_required":false}
//                ]
//              }'
//     응답: { "ok": true, "saved_fields": 3 }
//
//  3) 사용 가능한 항목 카탈로그 조회 (인증 불필요)
//     curl "https://<host>/api/integration/field-definitions"
//     응답: { "ok": true, "data": [{"field_key":"name","label":"이름","input_type":"text",...}, ...] }
// ============================================================

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import pool from "../config/database";
import { publicBaseUrl } from "../services/qr.service";
import { sendEmailVerifyCode } from "../services/email.service";

const router = Router();
const reservationQrDir = path.join(process.cwd(), "uploads", "reservation-qr");
fs.mkdirSync(reservationQrDir, { recursive: true });

function toUrl(p?: string | null): string | null {
  if (!p) return null;
  const norm = p.replace(/\\/g, "/");
  const idx = norm.lastIndexOf("/uploads/");
  return idx >= 0 ? norm.slice(idx) : `/${norm.replace(/^\.\//, "")}`;
}

// (공개) 사전등록/현장등록 폼 렌더용 — visitor 페이지에서 호출
//   인증 불요. 호스트 비밀이 포함되지 않은 정보만 반환(폼 항목 + 혜택 표시 정보)
router.get("/projects/:serial/reservation-config", async (req, res) => {
  const serial = String(req.params.serial || "");
  const [rows] = await pool.execute(
    `SELECT id, project_name, project_serial, status, from_date, to_date,
            reservation_enabled, reservation_benefit_amount,
            reservation_benefit_label, reservation_benefit_max_count, reservation_benefit_image_path,
            reservation_start_at,
            entry_benefit_enabled, entry_benefit_amount,
            entry_benefit_label, entry_benefit_max_count, entry_benefit_image_path
     FROM projects WHERE project_serial = ?`,
    [serial],
  );
  const proj = (Array.isArray(rows) ? rows[0] : null) as any;
  if (!proj) { res.status(404).json({ ok: false, error: "project_not_found" }); return; }

  const [fieldRows] = await pool.execute(
    `SELECT prf.is_required, prf.sort_order, prf.choice_type_override,
            fd.field_key, fd.label_ko, fd.input_type, fd.options_json, fd.placeholder,
            fd.choice_type
     FROM project_reservation_fields prf
     JOIN field_definitions fd ON fd.id = prf.field_id
     WHERE prf.project_id = ?
     ORDER BY prf.sort_order ASC, prf.field_id ASC`,
    [proj.id],
  );

  function toUploadUrl(p?: string | null): string | null {
    if (!p) return null;
    const norm = p.replace(/\\/g, "/");
    const idx = norm.lastIndexOf("/uploads/");
    if (idx >= 0) return norm.slice(idx);
    const rel = norm.indexOf("uploads/");
    return rel >= 0 ? `/${norm.slice(rel)}` : norm;
  }

  // 등록 윈도우 계산
  const now = new Date();
  const fromDate = proj.from_date ? new Date(proj.from_date) : null;
  const toDate = proj.to_date ? new Date(proj.to_date) : null;
  const rStartAt = proj.reservation_start_at ? new Date(proj.reservation_start_at) : null;
  // 사전등록: start_at <= now < from_date
  const reservationOpen = !!(rStartAt && fromDate && now.getTime() >= rStartAt.getTime() && now.getTime() < fromDate.getTime());
  // 현장등록: from_date <= now <= to_date+1일
  const toDateEnd = toDate ? new Date(toDate.getTime() + 24 * 60 * 60 * 1000) : null;
  const entryOpen = !!(fromDate && toDateEnd && now.getTime() >= fromDate.getTime() && now.getTime() < toDateEnd.getTime());

  res.json({
    ok: true,
    project: {
      serial: proj.project_serial, name: proj.project_name,
      status: proj.status, from_date: proj.from_date, to_date: proj.to_date,
    },
    reservation: {
      enabled: Number(proj.reservation_enabled) === 1,
      amount: Number(proj.reservation_benefit_amount || 0),
      label: proj.reservation_benefit_label || "",
      max_count: Number(proj.reservation_benefit_max_count || 0),
      image_url: toUploadUrl(proj.reservation_benefit_image_path),
      start_at: proj.reservation_start_at,
      window_open: reservationOpen,
    },
    entry: {
      enabled: Number(proj.entry_benefit_enabled) === 1,
      amount: Number(proj.entry_benefit_amount || 0),
      label: proj.entry_benefit_label || "",
      max_count: Number(proj.entry_benefit_max_count || 0),
      image_url: toUploadUrl(proj.entry_benefit_image_path),
      window_open: entryOpen,
    },
    fields: (Array.isArray(fieldRows) ? fieldRows : []).map((r: any) => ({
      field_key: r.field_key, label: r.label_ko, input_type: r.input_type,
      placeholder: r.placeholder,
      options: r.options_json ? (() => { try { return JSON.parse(r.options_json); } catch { return null; } })() : null,
      required: Number(r.is_required) === 1,
      sort_order: Number(r.sort_order),
      choice_type: r.choice_type_override || r.choice_type || 'single',
    })),
  });
});

// (공개) Kakao Maps SDK 용 JS 키 제공 (visitor reserve 페이지 주소 입력용)
router.get("/kakao/js-key", (_req, res) => {
  const key = process.env.KAKAO_JS_KEY ?? "";
  if (!key) { res.status(500).json({ ok: false, error: "kakao_js_key_not_configured" }); return; }
  res.json({ ok: true, key });
});

// (공개) 사전등록/현장등록 폼의 이메일 인증 코드 발송
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
router.post("/email-verify/send", async (req, res) => {
  const email = String((req.body || {}).email || "").trim();
  const serial = String((req.body || {}).project_serial || "").trim();
  if (!email || !EMAIL_RE.test(email)) {
    res.status(400).json({ ok: false, error: "invalid_email" }); return;
  }
  // 이미 등록된 이메일 힌트 (정확한 데이터는 인증 후 lookup 으로 노출)
  let alreadyRegistered = false;
  if (serial) {
    const [hit] = await pool.execute(
      `SELECT r.id FROM reservations r
       JOIN projects p ON p.id = r.project_id
       WHERE p.project_serial = ? AND r.email_lower = ? LIMIT 1`,
      [serial, email.toLowerCase()],
    );
    alreadyRegistered = Array.isArray(hit) && hit.length > 0;
  }
  // 1분 rate-limit
  const [recent] = await pool.execute(
    `SELECT id FROM host_email_verify_codes
     WHERE email = ? AND used = 0 AND expires_at > NOW() AND created_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE)`,
    [email],
  );
  if (Array.isArray(recent) && recent.length > 0) {
    res.status(429).json({ ok: false, error: "rate_limited", already_registered: alreadyRegistered }); return;
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date(Date.now() + 10 * 60 * 1000);
  await pool.execute(
    `INSERT INTO host_email_verify_codes (email, code, expires_at) VALUES (?, ?, ?)`,
    [email, code, expires],
  );
  try {
    await sendEmailVerifyCode(email, code);
  } catch (e) {
    res.json({ ok: true, already_registered: alreadyRegistered, devCode: code, message: "인증코드가 발송되었습니다." });
    return;
  }
  res.json({ ok: true, already_registered: alreadyRegistered, message: "인증코드가 발송되었습니다." });
});

// (공개) 인증코드 검증 — 성공 시 코드는 살려둠 (submit 시점에서 최종 사용)
router.post("/email-verify/check", async (req, res) => {
  const email = String((req.body || {}).email || "").trim();
  const code  = String((req.body || {}).code || "").trim();
  if (!email || !code) { res.status(400).json({ ok: false, error: "missing" }); return; }
  const [rows] = await pool.execute(
    `SELECT id FROM host_email_verify_codes
     WHERE email = ? AND code = ? AND used = 0 AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [email, code],
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ ok: false, error: "invalid_or_expired" }); return;
  }
  res.json({ ok: true });
});

// (공개) 인증된 이메일로 기존 신청 내역 조회
//   body: { email, code }
//   응답: { ok, found, reservation? }
router.post("/projects/:serial/reservations/lookup", async (req, res) => {
  const serial = String(req.params.serial || "");
  const email = String((req.body || {}).email || "").trim().toLowerCase();
  const code  = String((req.body || {}).code || "").trim();
  if (!email || !code) { res.status(400).json({ ok: false, error: "missing" }); return; }
  // 코드 검증 (used=0, 미만료) — 마킹하지 않고 그대로 둠 (submit 시 사용)
  const [codeRows] = await pool.execute(
    `SELECT id FROM host_email_verify_codes
     WHERE email = ? AND code = ? AND used = 0 AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [email, code],
  );
  if (!Array.isArray(codeRows) || codeRows.length === 0) {
    res.status(400).json({ ok: false, error: "invalid_or_expired" }); return;
  }
  // 프로젝트 + 기존 신청 조회
  const [pr] = await pool.execute(
    `SELECT id, project_name, project_serial FROM projects WHERE project_serial = ?`, [serial],
  );
  const proj = (Array.isArray(pr) ? pr[0] : null) as any;
  if (!proj) { res.status(404).json({ ok: false, error: "project_not_found" }); return; }
  const [rows] = await pool.execute(
    `SELECT mode, status, token, qr_image_path, fields_json, amount, created_at, activated_at, used_at
     FROM reservations WHERE project_id = ? AND email_lower = ?`,
    [proj.id, email],
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    res.json({ ok: true, found: false }); return;
  }
  const r = rows[0] as any;
  let fields: any = {};
  try { fields = r.fields_json ? JSON.parse(r.fields_json) : {}; } catch {}
  const base = publicBaseUrl();
  res.json({
    ok: true, found: true,
    reservation: {
      mode: r.mode, status: r.status, fields,
      amount: Number(r.amount || 0),
      qr_image_url: toUrl(r.qr_image_path),
      visitor_url: `${base}/v/${serial}?resv=${r.token}`,
      created_at: r.created_at,
      activated_at: r.activated_at,
      used_at: r.used_at,
      project_name: proj.project_name,
    },
  });
});

// (공개) visitor 사전등록/현장등록 제출
//   body: { mode, fields: {name, email, mobile, ...}, email_verified, code }
//   응답: { ok, token, qr_image_url, visitor_url }
router.post("/projects/:serial/reservations/submit", async (req, res) => {
  const serial = String(req.params.serial || "");
  const body = req.body || {};
  const mode = body.mode === "entry" ? "entry" : "reservation";
  const fields = (body.fields && typeof body.fields === "object") ? body.fields : {};
  const emailVerified = !!body.email_verified;

  // 프로젝트 조회 + 윈도우 검증
  const [pr] = await pool.execute(
    `SELECT id, project_name, project_serial, status, from_date, to_date,
            reservation_enabled, reservation_benefit_amount, reservation_benefit_message,
            reservation_benefit_max_count, reservation_stop_on_limit,
            reservation_start_at,
            entry_benefit_enabled, entry_benefit_amount, entry_benefit_message,
            entry_benefit_max_count, entry_stop_on_limit
     FROM projects WHERE project_serial = ?`,
    [serial],
  );
  const proj = (Array.isArray(pr) ? pr[0] : null) as any;
  if (!proj) { res.status(404).json({ ok: false, error: "project_not_found" }); return; }

  const now = Date.now();
  const fromDate = proj.from_date ? new Date(proj.from_date) : null;
  const toDate = proj.to_date ? new Date(proj.to_date) : null;
  const rStartAt = proj.reservation_start_at ? new Date(proj.reservation_start_at) : null;
  const reservationOpen = !!(rStartAt && fromDate && now >= rStartAt.getTime() && now < fromDate.getTime());
  const toDateEnd = toDate ? new Date(toDate.getTime() + 24 * 60 * 60 * 1000) : null;
  const entryOpen = !!(fromDate && toDateEnd && now >= fromDate.getTime() && now < toDateEnd.getTime());

  if (mode === "reservation") {
    if (!Number(proj.reservation_enabled)) { res.status(400).json({ ok: false, error: "reservation_disabled" }); return; }
    if (!reservationOpen) { res.status(400).json({ ok: false, error: "reservation_window_closed" }); return; }
  } else {
    if (!Number(proj.entry_benefit_enabled)) { res.status(400).json({ ok: false, error: "entry_disabled" }); return; }
    if (!entryOpen) { res.status(400).json({ ok: false, error: "entry_window_closed" }); return; }
  }

  // 필수 필드 + 이메일 인증 검증
  const email = String(fields.email || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ ok: false, error: "invalid_email" }); return;
  }
  if (!String(fields.name || "").trim()) { res.status(400).json({ ok: false, error: "missing_name" }); return; }
  // 서버측 인증코드 검증 — code 가 함께 와야 진짜 인증된 것으로 인정
  const code = String(body.code || "").trim();
  if (!emailVerified || !code) { res.status(400).json({ ok: false, error: "email_not_verified" }); return; }
  const [codeRows] = await pool.execute(
    `SELECT id FROM host_email_verify_codes
     WHERE email = ? AND code = ? AND used = 0 AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [email, code],
  );
  if (!Array.isArray(codeRows) || codeRows.length === 0) {
    res.status(400).json({ ok: false, error: "email_not_verified" }); return;
  }
  await pool.execute(`UPDATE host_email_verify_codes SET used = 1 WHERE id = ?`, [(codeRows as any)[0].id]);

  // 한도 초과 검증 (stop_on_limit + max_count > 0)
  const maxCount = Number(mode === "reservation" ? proj.reservation_benefit_max_count : proj.entry_benefit_max_count) || 0;
  const stopOnLimit = Number(mode === "reservation" ? proj.reservation_stop_on_limit : proj.entry_stop_on_limit) === 1;
  if (maxCount > 0) {
    const [cnt] = await pool.execute(
      `SELECT COUNT(*) AS n FROM reservations WHERE project_id = ? AND mode = ?`,
      [proj.id, mode],
    );
    const issued = Number((cnt as any)[0]?.n || 0);
    if (issued >= maxCount && stopOnLimit) {
      res.status(400).json({ ok: false, error: "limit_exceeded" }); return;
    }
  }

  // 혜택 금액 + 메시지 스냅샷
  const amount = Number(mode === "reservation" ? proj.reservation_benefit_amount : proj.entry_benefit_amount) || 0;
  const benefitMessage = String(mode === "reservation"
    ? (proj.reservation_benefit_message || "")
    : (proj.entry_benefit_message || ""));
  const token = crypto.randomBytes(20).toString("hex");

  // INSERT — UNIQUE(project_id, email_lower) 위반 처리
  try {
    await pool.execute(
      `INSERT INTO reservations (project_id, mode, email_lower, token, fields_json, amount, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [proj.id, mode, email, token, JSON.stringify(fields), amount],
    );
  } catch (e: any) {
    if (e && (e.code === "ER_DUP_ENTRY" || e.errno === 1062)) {
      res.status(409).json({ ok: false, error: "already_registered",
        message: "이미 이 프로젝트에 동일 이메일로 등록되어 있습니다." });
      return;
    }
    throw e;
  }

  // QR 생성 (가맹점이 스캔하면 사용처리, visitor 가 스캔하면 PWA 로 자동 이동)
  const base = publicBaseUrl();
  const visitorUrl  = `${base}/v/${proj.project_serial}?resv=${token}`;
  const redeemUrl   = `${base}/r/${proj.project_serial}/${token}`;
  const qrFile = path.join(reservationQrDir, `${token}.png`);
  await QRCode.toFile(qrFile, redeemUrl, { margin: 2, width: 480 });
  await pool.execute(`UPDATE reservations SET qr_image_path = ? WHERE token = ?`, [qrFile, token]);

  res.json({
    ok: true,
    token,
    mode,
    amount,
    benefit_message: benefitMessage,
    qr_image_url: toUrl(qrFile),
    visitor_url: visitorUrl,
    redeem_url: redeemUrl,
    project: { serial: proj.project_serial, name: proj.project_name },
  });
});

// 항목 카탈로그 (인증 없이 공개 조회 가능)
router.get("/field-definitions", async (_req, res) => {
  const [rows] = await pool.execute(
    `SELECT field_key, label_ko AS label, input_type, options_json, placeholder, sort_order
     FROM field_definitions WHERE disabled = 0
     ORDER BY sort_order ASC, id ASC`,
  );
  const data = (Array.isArray(rows) ? rows : []).map((r: any) => ({
    field_key: r.field_key,
    label: r.label,
    input_type: r.input_type,
    placeholder: r.placeholder,
    options: r.options_json ? (() => { try { return JSON.parse(r.options_json); } catch { return null; } })() : null,
    sort_order: Number(r.sort_order),
  }));
  res.json({ ok: true, data });
});

// 프로젝트 PIN 검증 헬퍼: 프로젝트 row 반환 또는 null
async function verifyProjectPin(serial: string, pin: string): Promise<any | null> {
  if (!serial || !pin) return null;
  const [rows] = await pool.execute(
    `SELECT id, project_name, project_serial, status, from_date, pin_hash,
            reservation_enabled, reservation_benefit_amount,
            reservation_benefit_label, reservation_benefit_max_count, reservation_stop_on_limit,
            entry_benefit_enabled, entry_benefit_amount,
            entry_benefit_label, entry_benefit_max_count, entry_stop_on_limit
     FROM projects WHERE project_serial = ?`,
    [serial],
  );
  const proj = (Array.isArray(rows) ? rows[0] : null) as any;
  if (!proj) return null;
  const ok = await bcrypt.compare(pin, String(proj.pin_hash));
  if (!ok) return null;
  return proj;
}

// 1) 사전등록 폼 구성 조회 (POST)
router.post("/projects/:serial/reservation-config", async (req, res) => {
  const pin = String(req.header("X-Project-PIN") || (req.body && req.body.pin) || "");
  const proj = await verifyProjectPin(req.params.serial, pin);
  if (!proj) { res.status(401).json({ ok: false, error: "invalid_serial_or_pin" }); return; }

  const [fieldRows] = await pool.execute(
    `SELECT prf.is_required, prf.sort_order, prf.choice_type_override,
            fd.field_key, fd.label_ko, fd.input_type, fd.options_json, fd.placeholder,
            fd.choice_type
     FROM project_reservation_fields prf
     JOIN field_definitions fd ON fd.id = prf.field_id
     WHERE prf.project_id = ?
     ORDER BY prf.sort_order ASC, prf.field_id ASC`,
    [proj.id],
  );

  res.json({
    ok: true,
    project: {
      serial: proj.project_serial,
      name: proj.project_name,
      status: proj.status,
      from_date: proj.from_date,
    },
    reservation: {
      enabled: Number(proj.reservation_enabled) === 1,
      amount: Number(proj.reservation_benefit_amount || 0),
      label: proj.reservation_benefit_label || "",
      max_count: Number(proj.reservation_benefit_max_count || 0),
      stop_on_limit: Number(proj.reservation_stop_on_limit) === 1,
    },
    entry: {
      enabled: Number(proj.entry_benefit_enabled) === 1,
      amount: Number(proj.entry_benefit_amount || 0),
      label: proj.entry_benefit_label || "",
      max_count: Number(proj.entry_benefit_max_count || 0),
      stop_on_limit: Number(proj.entry_stop_on_limit) === 1,
    },
    fields: (Array.isArray(fieldRows) ? fieldRows : []).map((r: any) => ({
      field_key: r.field_key,
      label: r.label_ko,
      input_type: r.input_type,
      placeholder: r.placeholder,
      options: r.options_json ? (() => { try { return JSON.parse(r.options_json); } catch { return null; } })() : null,
      required: Number(r.is_required) === 1,
      sort_order: Number(r.sort_order),
    })),
  });
});

// 2) 사전등록 폼 구성 설정 (덮어쓰기)
router.post("/projects/:serial/reservation-config/set", async (req, res) => {
  const pin = String(req.header("X-Project-PIN") || (req.body && req.body.pin) || "");
  const proj = await verifyProjectPin(req.params.serial, pin);
  if (!proj) { res.status(401).json({ ok: false, error: "invalid_serial_or_pin" }); return; }

  const body = req.body || {};
  const r = body.reservation || {};
  const e = body.entry || {};
  const rEnabled  = r.enabled ? 1 : 0;
  const rAmount   = Math.max(0, Math.floor(Number(r.benefit_amount || 0)));
  const rLabel    = String(r.benefit_label || "").slice(0, 120) || null;
  const rMaxCount = Math.max(0, Math.floor(Number(r.benefit_max_count || 0)));
  const rStop     = r.stop_on_limit ? 1 : 0;
  const eEnabled  = e.enabled ? 1 : 0;
  const eAmount   = Math.max(0, Math.floor(Number(e.benefit_amount || 0)));
  const eLabel    = String(e.benefit_label || "").slice(0, 120) || null;
  const eMaxCount = Math.max(0, Math.floor(Number(e.benefit_max_count || 0)));
  const eStop     = e.stop_on_limit ? 1 : 0;
  const incoming  = Array.isArray(body.fields) ? body.fields : [];

  const [allDefs] = await pool.execute(`SELECT id, field_key FROM field_definitions WHERE disabled = 0`);
  const defMap = new Map<string, number>();
  for (const r of (Array.isArray(allDefs) ? allDefs : []) as any[]) {
    defMap.set(String(r.field_key), Number(r.id));
  }

  const normalized: Array<{ field_id: number; is_required: number; sort_order: number }> = [];
  let order = 0;
  for (const f of incoming) {
    const fid = defMap.get(String(f?.field_key || "")) || Number(f?.field_id) || 0;
    if (!fid) continue;
    normalized.push({
      field_id: fid,
      is_required: f?.is_required ? 1 : 0,
      sort_order: Number.isFinite(Number(f?.sort_order)) ? Number(f?.sort_order) : (order * 10),
    });
    order++;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `UPDATE projects SET
         reservation_enabled = ?, reservation_benefit_amount = ?,
         reservation_benefit_label = ?, reservation_benefit_max_count = ?, reservation_stop_on_limit = ?,
         entry_benefit_enabled = ?, entry_benefit_amount = ?,
         entry_benefit_label = ?, entry_benefit_max_count = ?, entry_stop_on_limit = ?,
         updated_at = NOW()
       WHERE id = ?`,
      [rEnabled, rAmount, rLabel, rMaxCount, rStop,
       eEnabled, eAmount, eLabel, eMaxCount, eStop, proj.id],
    );
    await conn.execute(`DELETE FROM project_reservation_fields WHERE project_id = ?`, [proj.id]);
    if (normalized.length) {
      const values = normalized.map(() => "(?, ?, ?, ?)").join(", ");
      const params: Array<number> = [];
      normalized.forEach((n) => { params.push(proj.id, n.field_id, n.is_required, n.sort_order); });
      await conn.execute(
        `INSERT INTO project_reservation_fields (project_id, field_id, is_required, sort_order) VALUES ${values}`,
        params,
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ ok: false, error: "internal_error" });
    return;
  } finally {
    conn.release();
  }

  res.json({ ok: true, saved_fields: normalized.length });
});

export default router;
