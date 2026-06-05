import path from "node:path";
import fs from "node:fs";
import { Router } from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import ExcelJS from "exceljs";
import pool from "../config/database";
import { requireHost } from "../middleware/auth";
import { sendProjectPinEmail, sendQuoteEmail, sendSupervisorQuoteNotification, sendMerchantApplicationDecisionEmail } from "../services/email.service";
import { calculateQuote } from "../services/quote.service";
import { nextLocationNumbers, nextProjectSerial, validateProjectDates, verifyPin } from "../services/project.service";
import { createQrZip, generateProjectQrs } from "../services/qr.service";
import { encKey, dec, ENC } from "../utils/encrypt";
import { verifyQuoteToken } from "../utils/quote-token";

const router = Router();

// 목적지 아이콘 이미지 업로드 (위치/전시물 공통, 선택사항)
const iconDir = path.join(process.cwd(), "uploads", "location-icons");
fs.mkdirSync(iconDir, { recursive: true });
const iconUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, iconDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/\s+/g, "_")}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// 퀴즈 이미지 업로드 (질문/답항/정답·오답 결과 이미지)
const quizImageDir = path.join(process.cwd(), "uploads", "quiz-images");
fs.mkdirSync(quizImageDir, { recursive: true });
const quizImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, quizImageDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/\s+/g, "_")}`),
  }),
  fileFilter: (_req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// 디스크 절대경로 → /uploads/... 정적 URL 변환
function toUploadUrl(p?: string | null): string | null {
  if (!p) return null;
  const norm = p.replace(/\\/g, "/");
  const idx = norm.lastIndexOf("/uploads/");
  if (idx >= 0) return norm.slice(idx);
  const rel = norm.indexOf("uploads/");
  return rel >= 0 ? `/${norm.slice(rel)}` : norm;
}

// 입금확인(deposit_confirmed) 이후에는 목적지 변경 시 QR을 보완 생성한다.
const QR_READY_STATUSES = ["deposit_confirmed", "ready_to_start", "started"];
async function regenerateQrsIfReady(projectId: number): Promise<void> {
  try {
    const [rows] = await pool.execute("SELECT project_serial, status FROM projects WHERE id = ?", [projectId]);
    const proj = (Array.isArray(rows) ? rows[0] : null) as any;
    if (proj && QR_READY_STATUSES.includes(String(proj.status))) {
      await generateProjectQrs(projectId, String(proj.project_serial));
    }
  } catch (e) {
    console.error("regenerateQrsIfReady failed:", e);
  }
}

router.get("/quote-config", requireHost, (_req, res) => {
  res.json({
    dailyFee: Number(process.env.DAILY_USAGE_FEE ?? 100000000),
    mobileCount: Number(process.env.MOBILE_DESIGN_COUNT ?? 2),
    mobileUnitFee: Number(process.env.MOBILE_DESIGN_UNIT_FEE ?? 100000),
    faviconFee: Number(process.env.FAVICON_FEE ?? 30000),
    initialSetupFee: Number(process.env.INITIAL_SETUP_FEE ?? 500000),
  });
});

router.get("/kakao/js-key", requireHost, (_req, res) => {
  const key = process.env.KAKAO_JS_KEY ?? "";
  if (!key) { res.status(500).json({ error: "KAKAO_JS_KEY not configured" }); return; }
  res.json({ key });
});

router.post("/project-pin/send", requireHost, async (req, res) => {
  const host = req.session.host!;
  const pin = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date(Date.now() + 10 * 60 * 1000);

  await pool.execute(
    "INSERT INTO host_project_pin_codes (host_id, pin_code, expires_at) VALUES (?, ?, ?)",
    [host.id, pin, expires],
  );

  await sendProjectPinEmail(host.email, host.name, pin, host.id);
  res.json({ ok: true, message: "비밀번호가 메일로 발송되었습니다." });
});

router.post("/project-pin/verify", requireHost, async (req, res) => {
  const { pin } = req.body as { pin?: string };
  if (!pin?.trim()) { res.status(400).json({ error: "비밀번호를 입력해 주세요." }); return; }
  const host = req.session.host!;
  const [rows] = await pool.execute(
    "SELECT id FROM host_project_pin_codes WHERE host_id = ? AND pin_code = ? AND used = 0 AND expires_at > NOW() ORDER BY id DESC LIMIT 1",
    [host.id, pin.trim()],
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: "비밀번호가 일치하지 않거나 만료되었습니다." });
    return;
  }
  res.json({ ok: true });
});

router.post("/projects", requireHost, async (req, res) => {
  const host = req.session.host!;
  const {
    project_name,
    description,
    from_date,
    to_date,
    gift_amount,
    gift_qty,
    prize_amount = "0",
    prize_qty = "0",
    quiz_bonus_per_correct = "0",
    stop_on_budget_exceed = "0",
    pin_input,
  } = req.body as Record<string, string>;

  if (!project_name || !description || !from_date || !to_date || !gift_amount || !gift_qty || !pin_input) {
    res.status(400).json({ error: "필수값을 입력해 주세요." });
    return;
  }

  const giftQtyNum = Math.floor(Number(gift_qty));
  if (!Number.isInteger(giftQtyNum) || giftQtyNum < 1) {
    res.status(400).json({ error: "발급수량은 1 이상의 정수여야 합니다." });
    return;
  }

  const prizeAmountNum = Math.max(0, Math.floor(Number(prize_amount) || 0));
  const prizeQtyNum = Math.max(0, Math.floor(Number(prize_qty) || 0));
  const quizBonusNum = Math.max(0, Math.floor(Number(quiz_bonus_per_correct) || 0));
  const stopOverbudget = String(stop_on_budget_exceed) === "1" ? 1 : 0;

  if (description.length > 200) {
    res.status(400).json({ error: "설명은 200자 이내여야 합니다." });
    return;
  }

  if (!/^\d{6}$/.test(pin_input)) {
    res.status(400).json({ error: "비밀번호는 숫자 6자리만 가능합니다." });
    return;
  }

  const dateCheck = validateProjectDates(from_date, to_date);
  if (!dateCheck.ok) {
    res.status(400).json({ error: dateCheck.message });
    return;
  }

  const k = encKey();
  const [hostRows] = await pool.execute(
    `SELECT project_pin_fail_count, project_locked, ${dec("host_name")}, ${dec("host_email")} FROM hosts WHERE id = ?`,
    [k, k, host.id],
  );
  const hostRow = (Array.isArray(hostRows) ? hostRows[0] : null) as any;
  if (!hostRow) {
    res.status(404).json({ error: "host_not_found" });
    return;
  }
  if (Number(hostRow.project_locked) === 1) {
    res.status(403).json({
      error: "project_locked",
      message: "프로젝트를 더 이상 등록할 수 없습니다. supervisor에게 문의하세요.",
    });
    return;
  }

  const [pinRows] = await pool.execute(
    `SELECT id, pin_code FROM host_project_pin_codes
     WHERE host_id = ? AND used = 0 AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [host.id],
  );

  const pinRow = (Array.isArray(pinRows) ? pinRows[0] : null) as any;
  if (!pinRow || String(pinRow.pin_code) !== pin_input) {
    const failCount = Number(hostRow.project_pin_fail_count) + 1;
    const locked = failCount >= 3 ? 1 : 0;
    await pool.execute(
      "UPDATE hosts SET project_pin_fail_count = ?, project_locked = ? WHERE id = ?",
      [failCount, locked, host.id],
    );
    res.status(400).json({
      error: "비밀전호가 일치하지 않습니다",
      failCount,
      locked,
      message: locked ? "3회 실패로 잠금되었습니다. supervisor에게 문의하세요." : `${failCount}번째 실패입니다.`,
    });
    return;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const serial = await nextProjectSerial(connection, new Date());
    const pinHash = await bcrypt.hash(pin_input, 10);
    const quote = calculateQuote(from_date, to_date);
    const giftAmountNum = Number(gift_amount);
    const budgetAmount = giftAmountNum * giftQtyNum;

    const [insertResult] = await connection.execute(
      `INSERT INTO projects
       (host_id, project_name, project_serial, description, from_date, to_date, gift_amount, gift_qty, prize_amount, prize_qty, quiz_bonus_per_correct, stop_on_budget_exceed, budget_amount, pin_hash, pin_enc, status, quote_days, quote_amount, quote_sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${ENC}, 'quoted', ?, ?, NOW())`,
      [host.id, project_name, serial, description, from_date, to_date, giftAmountNum, giftQtyNum, prizeAmountNum, prizeQtyNum, quizBonusNum, stopOverbudget, budgetAmount, pinHash, pin_input, encKey(), quote.days, quote.total],
    );

    const projectId = Number((insertResult as any).insertId);

    // Gift 단계별 보상 (gift_tiers) — 100% tier 는 기본으로 gift_amount 사용
    let tiersToInsert: Array<{ pct: number; amount: number }> = [];
    try {
      const raw = (req.body as any).gift_tiers;
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed)) {
        tiersToInsert = parsed
          .map((t: any) => ({ pct: Math.floor(Number(t.pct) || 0), amount: Math.max(0, Math.floor(Number(t.amount) || 0)) }))
          .filter((t) => t.pct >= 1 && t.pct <= 100 && t.amount > 0);
      }
    } catch { /* noop */ }
    // 100% tier 는 항상 Gift 단가로 강제 (사용자 입력 무시)
    tiersToInsert = tiersToInsert.filter((t) => t.pct < 100);
    tiersToInsert.push({ pct: 100, amount: giftAmountNum });
    // 중복 제거 (pct 기준 마지막 값 유지)
    const tierMap = new Map<number, number>();
    for (const t of tiersToInsert) tierMap.set(t.pct, t.amount);
    for (const [pct, amount] of tierMap) {
      await connection.execute(
        "INSERT INTO project_gift_tiers (project_id, threshold_pct, amount) VALUES (?, ?, ?)",
        [projectId, pct, amount],
      );
    }

    await connection.execute("UPDATE hosts SET project_pin_fail_count = 0 WHERE id = ?", [host.id]);
    await connection.execute("UPDATE host_project_pin_codes SET used = 1 WHERE id = ?", [pinRow.id]);

    await connection.commit();

    await sendQuoteEmail({
      hostEmail: String(hostRow.host_email),
      hostName: String(hostRow.host_name),
      projectName: project_name,
      projectSerial: serial,
      fromDate: from_date,
      toDate: to_date,
      days: quote.days,
      total: quote.total,
      usageFee: quote.usageFee,
      mobileDesignFee: quote.mobileDesignFee,
      faviconFee: quote.faviconFee,
      initialSetupFee: quote.initialSetupFee,
      projectId,
      hostId: host.id,
    });

    sendSupervisorQuoteNotification({
      hostName: String(hostRow.host_name),
      hostEmail: String(hostRow.host_email),
      projectName: project_name,
      projectSerial: serial,
      fromDate: from_date,
      toDate: to_date,
      days: quote.days,
      total: quote.total,
      projectId,
      hostId: host.id,
    }).catch(() => {});

    res.json({ ok: true, projectId, projectSerial: serial, quote });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

router.get("/projects", requireHost, async (req, res) => {
  const host = req.session.host!;
  const { project_name = "", status = "", page = "1", size = "10" } = req.query as Record<string, string>;

  const pageNo = Math.max(1, Number(page));
  const pageSize = [10, 25, 50, 100].includes(Number(size)) ? Number(size) : 10;
  const offset = (pageNo - 1) * pageSize;

  let where = "WHERE p.host_id = ?";
  const params: Array<string | number> = [host.id];

  if (project_name) {
    where += " AND p.project_name LIKE ?";
    params.push(`%${project_name}%`);
  }
  if (status) {
    where += " AND p.status = ?";
    params.push(status);
  }

  const [countRows] = await pool.execute(`SELECT COUNT(*) AS total FROM projects p ${where}`, params);
  const total = Number((countRows as any)[0].total);

  const [rows] = await pool.execute(
    `SELECT p.*,
            (SELECT COUNT(*) FROM project_gift_tiers t WHERE t.project_id = p.id AND t.threshold_pct < 100) AS extra_tier_count,
            (SELECT COUNT(*) FROM project_locations pl WHERE pl.project_id = p.id AND pl.disabled = 0) AS active_locations,
            (SELECT COUNT(DISTINCT vv.visitor_id)
               FROM visitor_visits vv
               JOIN project_locations plv ON plv.id = vv.location_id AND plv.disabled = 0
              WHERE vv.project_id = p.id) AS visitor_count,
            (SELECT COUNT(*) FROM gifts gf WHERE gf.project_id = p.id) AS issued_gifts,
            (SELECT COUNT(*) FROM gifts gf WHERE gf.project_id = p.id AND gf.status = 'used') AS used_gifts,
            (SELECT COALESCE(SUM(gf.amount), 0) FROM gifts gf WHERE gf.project_id = p.id AND gf.status = 'used') AS used_gift_amount,
            (SELECT COUNT(*) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.redemption_type = 'grant') AS grant_gifts,
            (SELECT COALESCE(SUM(gr.amount), 0) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.redemption_type = 'grant') AS grant_gift_amount,
            (SELECT COALESCE(SUM(gr.amount), 0) FROM gift_redemptions gr WHERE gr.project_id = p.id) AS gift_spent,
            (SELECT COUNT(*) FROM project_applications pa WHERE pa.project_id = p.id) AS applied_count,
            (SELECT COUNT(*) FROM project_applications pa WHERE pa.project_id = p.id AND pa.status = 'approved') AS approved_count,
            (SELECT COUNT(*) FROM project_quizzes pq WHERE pq.project_id = p.id AND pq.disabled = 0) AS quiz_count
     FROM projects p ${where}
     ORDER BY p.created_at DESC
     LIMIT ${pageSize} OFFSET ${offset}`,
    [...params],
  );

  const data = Array.isArray(rows) ? rows.map((item: any) => ({
    ...item,
    budget_consumption_rate: Number(item.budget_amount) > 0
      ? Math.round((Number(item.gift_spent) / Number(item.budget_amount)) * 10000) / 100
      : 0,
  })) : [];

  res.json({ ok: true, data, total, page: pageNo, size: pageSize });
});

// ── 내 프로젝트: 조회조건에 해당하는 전체 결과 엑셀 다운로드 ──
router.get("/projects/export", requireHost, async (req, res) => {
  const host = req.session.host!;
  const { project_name = "", status = "" } = req.query as Record<string, string>;

  let where = "WHERE p.host_id = ?";
  const params: Array<string | number> = [host.id];
  if (project_name) { where += " AND p.project_name LIKE ?"; params.push(`%${project_name}%`); }
  if (status) { where += " AND p.status = ?"; params.push(status); }

  const [rows] = await pool.execute(
    `SELECT p.*,
            (SELECT COUNT(*) FROM project_locations pl WHERE pl.project_id = p.id AND pl.disabled = 0) AS active_locations,
            (SELECT COUNT(DISTINCT vv.visitor_id) FROM visitor_visits vv
               JOIN project_locations plv ON plv.id = vv.location_id AND plv.disabled = 0
              WHERE vv.project_id = p.id) AS visitor_count,
            (SELECT COUNT(*) FROM gifts gf WHERE gf.project_id = p.id) AS issued_gifts,
            (SELECT COUNT(*) FROM gifts gf WHERE gf.project_id = p.id AND gf.status = 'used') AS used_gifts,
            (SELECT COALESCE(SUM(gf.amount), 0) FROM gifts gf WHERE gf.project_id = p.id AND gf.status = 'used') AS used_gift_amount,
            (SELECT COUNT(*) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.redemption_type = 'grant') AS grant_gifts,
            (SELECT COALESCE(SUM(gr.amount), 0) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.redemption_type = 'grant') AS grant_gift_amount,
            (SELECT COALESCE(SUM(gr.amount), 0) FROM gift_redemptions gr WHERE gr.project_id = p.id) AS gift_spent,
            (SELECT COUNT(*) FROM project_applications pa WHERE pa.project_id = p.id) AS applied_count,
            (SELECT COUNT(*) FROM project_applications pa WHERE pa.project_id = p.id AND pa.status = 'approved') AS approved_count
     FROM projects p ${where}
     ORDER BY p.created_at DESC`,
    params,
  );
  const list = Array.isArray(rows) ? (rows as any[]) : [];

  const STATUS_KO: Record<string, string> = {
    draft: "초안", quoted: "견적", deposit_wait: "입금대기", deposit_confirmed: "입금확인",
    ready_to_start: "시작대기", started: "진행중", completed: "완료", cancelled: "취소",
  };
  const num = (v: any) => Number(v || 0);
  const d10 = (v: any) => (v ? String(v).slice(0, 10) : "");

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("내 프로젝트");
  ws.columns = [
    { header: "일련번호", key: "serial", width: 16 },
    { header: "프로젝트명", key: "name", width: 24 },
    { header: "기간", key: "period", width: 24 },
    { header: "상태", key: "status", width: 10 },
    { header: "Gift 단가", key: "gift_amount", width: 12 },
    { header: "Gift 수량", key: "gift_qty", width: 10 },
    { header: "예산", key: "budget", width: 14 },
    { header: "Gift 발급수량", key: "issued", width: 12 },
    { header: "Gift 사용 개수", key: "used_cnt", width: 12 },
    { header: "Gift 증정 개수", key: "grant_cnt", width: 12 },
    { header: "Gift 사용액", key: "used_amt", width: 14 },
    { header: "Gift 증정액", key: "grant_amt", width: 14 },
    { header: "Gift 전체소진금액", key: "spent", width: 16 },
    { header: "소진율(%)", key: "rate", width: 10 },
    { header: "목적지", key: "locs", width: 8 },
    { header: "방문수", key: "visitors", width: 8 },
    { header: "지원", key: "applied", width: 8 },
    { header: "승인", key: "approved", width: 8 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };

  for (const p of list) {
    const rate = num(p.budget_amount) > 0 ? Math.round((num(p.gift_spent) / num(p.budget_amount)) * 10000) / 100 : 0;
    ws.addRow({
      serial: p.project_serial,
      name: p.project_name,
      period: `${d10(p.from_date)} ~ ${d10(p.to_date)}`,
      status: STATUS_KO[p.status] ?? p.status,
      gift_amount: num(p.gift_amount),
      gift_qty: num(p.gift_qty),
      budget: num(p.budget_amount),
      issued: num(p.issued_gifts),
      used_cnt: num(p.used_gifts),
      grant_cnt: num(p.grant_gifts),
      used_amt: num(p.used_gift_amount),
      grant_amt: num(p.grant_gift_amount),
      spent: num(p.gift_spent),
      rate,
      locs: num(p.active_locations),
      visitors: num(p.visitor_count),
      applied: num(p.applied_count),
      approved: num(p.approved_count),
    });
  }
  ["gift_amount", "budget", "used_amt", "grant_amt", "spent"].forEach((key) => {
    const col = ws.getColumn(key);
    col.numFmt = "#,##0";
    col.alignment = { horizontal: "right" };
  });

  // 파일명: 프로젝트 일련번호 (다건이면 첫(최근) 프로젝트의 일련번호)
  const fnameBase = list.length ? String(list[0].project_serial) : "projects";
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fnameBase)}.xlsx`);
  await wb.xlsx.write(res);
  res.end();
});

// 수정 가능한 상태 (진행중 이전)
const EDITABLE_STATUSES = new Set([
  "quoted",
  "deposit_wait",
  "deposit_confirmed",
  "ready_to_start",
]);
// 재견적 발송 시 세금계산서 안내문이 필요한 상태 (이미 입금 완료된 단계)
const REQUOTE_TAX_INVOICE_STATUSES = new Set(["deposit_confirmed", "ready_to_start"]);

// 프로젝트 상세 조회 — 수정 팝업에서 사용
router.get("/projects/:id", requireHost, async (req, res) => {
  const host = req.session.host!;
  const projectId = Number(req.params.id);
  if (!(await ensureHostOwnsProject(projectId, host.id))) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }
  const [rows] = await pool.execute(
    `SELECT id, project_name, project_serial, description, from_date, to_date,
            gift_amount, gift_qty, prize_amount, prize_qty, quiz_bonus_per_correct,
            stop_on_budget_exceed,
            budget_amount, status, quote_amount, quote_days,
            quote_sent_at, quote_read_at, deposit_confirmed_at, approved_at, started_at,
            created_at, updated_at
       FROM projects WHERE id = ?`,
    [projectId],
  );
  const proj = (rows as any[])[0];
  if (!proj) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }
  // Gift 단계별 보상
  const [tRows] = await pool.execute(
    "SELECT threshold_pct, amount FROM project_gift_tiers WHERE project_id = ? ORDER BY threshold_pct ASC",
    [projectId],
  );
  const gift_tiers = (tRows as any[]).map((r) => ({ pct: Number(r.threshold_pct), amount: Number(r.amount) }));
  res.json({
    ok: true,
    project: proj,
    gift_tiers,
    editable: EDITABLE_STATUSES.has(String(proj.status)),
  });
});

// 프로젝트 수정 — 진행중 이전 상태에서만 가능
router.put("/projects/:id", requireHost, async (req, res) => {
  const host = req.session.host!;
  const projectId = Number(req.params.id);
  if (!(await ensureHostOwnsProject(projectId, host.id))) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }
  const [pRows] = await pool.execute(
    `SELECT id, status, from_date, to_date, gift_amount, gift_qty, prize_amount, prize_qty,
            quiz_bonus_per_correct, quote_amount FROM projects WHERE id = ?`,
    [projectId],
  );
  const cur = (pRows as any[])[0];
  if (!cur) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }
  if (!EDITABLE_STATUSES.has(String(cur.status))) {
    res.status(403).json({ error: "이 상태에서는 프로젝트를 수정할 수 없습니다." });
    return;
  }
  const {
    project_name,
    description,
    from_date,
    to_date,
    gift_amount,
    gift_qty,
    prize_amount = "0",
    prize_qty = "0",
    quiz_bonus_per_correct = "0",
    stop_on_budget_exceed = "0",
  } = req.body as Record<string, string>;
  if (!project_name || !description || !from_date || !to_date || !gift_amount || !gift_qty) {
    res.status(400).json({ error: "필수값을 입력해 주세요." });
    return;
  }
  if (String(description).length > 200) {
    res.status(400).json({ error: "설명은 200자 이내여야 합니다." });
    return;
  }
  const dateCheck = validateProjectDates(from_date, to_date);
  if (!dateCheck.ok) {
    res.status(400).json({ error: dateCheck.message });
    return;
  }
  const giftAmountNum = Math.max(0, Math.floor(Number(gift_amount) || 0));
  const giftQtyNum = Math.max(1, Math.floor(Number(gift_qty) || 0));
  const prizeAmountNum = Math.max(0, Math.floor(Number(prize_amount) || 0));
  const prizeQtyNum = Math.max(0, Math.floor(Number(prize_qty) || 0));
  const quizBonusNum = Math.max(0, Math.floor(Number(quiz_bonus_per_correct) || 0));
  const stopOverbudget2 = String(stop_on_budget_exceed) === "1" ? 1 : 0;
  const budgetAmount = giftAmountNum * giftQtyNum;
  const newQuote = calculateQuote(from_date, to_date);

  await pool.execute(
    `UPDATE projects SET
        project_name = ?, description = ?, from_date = ?, to_date = ?,
        gift_amount = ?, gift_qty = ?, prize_amount = ?, prize_qty = ?,
        quiz_bonus_per_correct = ?, stop_on_budget_exceed = ?, budget_amount = ?, updated_at = NOW()
      WHERE id = ?`,
    [
      project_name, description, from_date, to_date,
      giftAmountNum, giftQtyNum, prizeAmountNum, prizeQtyNum,
      quizBonusNum, stopOverbudget2, budgetAmount, projectId,
    ],
  );

  // Gift 단계별 보상 — DELETE 후 재INSERT
  let tiersToSave: Array<{ pct: number; amount: number }> = [];
  try {
    const raw = (req.body as any).gift_tiers;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) {
      tiersToSave = parsed
        .map((t: any) => ({ pct: Math.floor(Number(t.pct) || 0), amount: Math.max(0, Math.floor(Number(t.amount) || 0)) }))
        .filter((t) => t.pct >= 1 && t.pct <= 100 && t.amount > 0);
    }
  } catch { /* noop */ }
  // 단계별 보상 사용 시(2단계 이상) — 단계 수 == 활성 목적지 수 (정확히 같아야 함)
  const extraTiersCount = tiersToSave.filter((t) => t.pct < 100).length;
  if (extraTiersCount > 0) {
    const totalTiersCount = extraTiersCount + 1; // 100% 포함
    const [locCntRows] = await pool.execute(
      "SELECT COUNT(*) AS n FROM project_locations WHERE project_id = ? AND disabled = 0",
      [projectId],
    );
    const activeLocs = Number((locCntRows as any[])[0]?.n || 0);
    if (activeLocs !== totalTiersCount) {
      res.status(400).json({
        error: `단계별 보상 사용 시 단계 수(${totalTiersCount})와 활성 목적지 수(${activeLocs})가 같아야 합니다.`,
      });
      return;
    }
    const bad = tiersToSave.find((t) => t.pct < 100 && t.amount >= giftAmountNum);
    if (bad) {
      res.status(400).json({ error: `${bad.pct}% 단계 보상은 Gift 단가(${giftAmountNum.toLocaleString("ko-KR")}원) 미만이어야 합니다.` });
      return;
    }
  }
  // 100% tier 는 항상 Gift 단가로 강제
  tiersToSave = tiersToSave.filter((t) => t.pct < 100);
  tiersToSave.push({ pct: 100, amount: giftAmountNum });
  const tierMap2 = new Map<number, number>();
  for (const t of tiersToSave) tierMap2.set(t.pct, t.amount);
  await pool.execute("DELETE FROM project_gift_tiers WHERE project_id = ?", [projectId]);
  for (const [pct, amount] of tierMap2) {
    await pool.execute(
      "INSERT INTO project_gift_tiers (project_id, threshold_pct, amount) VALUES (?, ?, ?)",
      [projectId, pct, amount],
    );
  }

  const oldQuote = Number(cur.quote_amount || 0);
  const quoteChanged = newQuote.total !== oldQuote;

  res.json({
    ok: true,
    quote_changed: quoteChanged,
    old_quote: oldQuote,
    new_quote: newQuote.total,
    new_quote_breakdown: newQuote,
    current_status: cur.status,
  });
});

// 재견적 발송 — 상태를 'quoted'로 되돌리고 새 견적금액으로 메일 발송
router.post("/projects/:id/re-quote", requireHost, async (req, res) => {
  const host = req.session.host!;
  const projectId = Number(req.params.id);
  if (!(await ensureHostOwnsProject(projectId, host.id))) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }
  const k = encKey();
  const [pRows] = await pool.execute(
    `SELECT id, project_name, project_serial, description, from_date, to_date, status, host_id
       FROM projects WHERE id = ?`,
    [projectId],
  );
  const proj = (pRows as any[])[0];
  if (!proj) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }
  if (!EDITABLE_STATUSES.has(String(proj.status))) {
    res.status(403).json({ error: "이 상태에서는 재견적을 발송할 수 없습니다." });
    return;
  }
  const [hostRows] = await pool.execute(
    `SELECT ${dec("host_name")}, ${dec("host_email")} FROM hosts WHERE id = ?`,
    [k, k, host.id],
  );
  const hostRow = (hostRows as any[])[0];
  if (!hostRow) {
    res.status(404).json({ error: "host_not_found" });
    return;
  }
  const newQuote = calculateQuote(proj.from_date, proj.to_date);
  const prevStatus = String(proj.status);
  // 상태를 'quoted'로 되돌리고 새 견적 정보 저장
  await pool.execute(
    `UPDATE projects SET
        status = 'quoted',
        quote_days = ?, quote_amount = ?,
        quote_sent_at = NOW(), quote_read_at = NULL, quote_read = 0,
        deposit_confirmed_at = NULL, approved_at = NULL, started_at = NULL,
        updated_at = NOW()
      WHERE id = ?`,
    [newQuote.days, newQuote.total, projectId],
  );

  // 재견적 안내문 (이전 상태에 따라)
  const needsTaxInvoice = REQUOTE_TAX_INVOICE_STATUSES.has(prevStatus);
  const requoteNote = needsTaxInvoice
    ? "프로젝트 수정으로 견적금액이 변경되어 재견적을 발송합니다. " +
      "이미 입금이 확인된 건이므로, 기존에 발행된 세금계산서는 취소 발행되고 새로운 견적금액으로 다시 발행됩니다."
    : "프로젝트 수정으로 견적금액이 변경되어 재견적을 발송합니다.";

  try {
    await sendQuoteEmail({
      hostEmail: String(hostRow.host_email),
      hostName: String(hostRow.host_name),
      projectName: String(proj.project_name),
      projectSerial: String(proj.project_serial),
      fromDate: String(proj.from_date).slice(0, 10),
      toDate: String(proj.to_date).slice(0, 10),
      days: newQuote.days,
      total: newQuote.total,
      usageFee: newQuote.usageFee,
      mobileDesignFee: newQuote.mobileDesignFee,
      faviconFee: newQuote.faviconFee,
      initialSetupFee: newQuote.initialSetupFee,
      projectId,
      hostId: host.id,
      requoteNote,
    });
  } catch (e) {
    // 메일 실패는 경고만 — 상태는 이미 변경됨
  }

  res.json({
    ok: true,
    prev_status: prevStatus,
    new_status: "quoted",
    new_quote: newQuote.total,
    tax_invoice_notice: needsTaxInvoice,
  });
});

// 프로젝트 방문 현황 통계 — 모달에서 시각화에 사용
router.get("/projects/:id/visit-stats", requireHost, async (req, res) => {
  const host = req.session.host!;
  const projectId = Number(req.params.id);
  if (!(await ensureHostOwnsProject(projectId, host.id))) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }

  // 1) 활성 목적지 + 각 목적지별 방문자 수
  const [locRows] = await pool.execute(
    `SELECT pl.id, pl.display_seq, pl.location_name,
            (SELECT COUNT(DISTINCT vv.visitor_id)
               FROM visitor_visits vv
              WHERE vv.location_id = pl.id) AS visitor_count
       FROM project_locations pl
      WHERE pl.project_id = ? AND pl.disabled = 0
      ORDER BY pl.display_seq ASC`,
    [projectId],
  );
  const locations = (Array.isArray(locRows) ? locRows : []) as any[];
  const totalActiveLocations = locations.length;

  // 2) 전체 방문자 / 완주자 + 예산/발급액/소진액 (금액 기준)
  const [sumRows] = await pool.execute(
    `SELECT
       (SELECT budget_amount FROM projects WHERE id = ?) AS total_budget,
       (SELECT COUNT(*) FROM visitors WHERE project_id = ?) AS total_visitors,
       (SELECT COUNT(*) FROM (
          SELECT v.id
            FROM visitors v
            JOIN visitor_visits vv ON vv.visitor_id = v.id
            JOIN project_locations pl ON pl.id = vv.location_id AND pl.disabled = 0
           WHERE v.project_id = ?
           GROUP BY v.id
          HAVING COUNT(DISTINCT vv.location_id) >= ?
       ) AS t) AS completed_visitors,
       (SELECT COUNT(*) FROM gifts WHERE project_id = ?) AS gift_issued,
       (SELECT COUNT(*) FROM gifts WHERE project_id = ? AND status = 'used') AS gift_used,
       (SELECT COALESCE(SUM(amount), 0) FROM gifts WHERE project_id = ?) AS gift_issued_amount,
       (SELECT COALESCE(SUM(amount), 0) FROM gifts WHERE project_id = ? AND status = 'used') AS gift_used_amount`,
    [projectId, projectId, projectId, totalActiveLocations || 0, projectId, projectId, projectId, projectId],
  );
  const s = (sumRows as any[])[0] || {};

  // 3) 일자별 방문자 (당일에 1회 이상 방문한 unique visitor)
  const [dailyRows] = await pool.execute(
    `SELECT DATE(visited_at) AS d, COUNT(DISTINCT visitor_id) AS visitors
       FROM visitor_visits
      WHERE project_id = ?
      GROUP BY DATE(visited_at)
      ORDER BY d ASC`,
    [projectId],
  );
  const dailyVisitors = (Array.isArray(dailyRows) ? dailyRows : []) as any[];

  // 4) visitor별 마지막 방문일(완주 시점) — HAVING으로 완주자만
  const [completionRows] = await pool.execute(
    `SELECT DATE(MAX(vv.visited_at)) AS d, COUNT(*) AS completed
       FROM (
         SELECT v.id AS vid, MAX(vv.visited_at) AS last_visit
           FROM visitors v
           JOIN visitor_visits vv ON vv.visitor_id = v.id
           JOIN project_locations pl ON pl.id = vv.location_id AND pl.disabled = 0
          WHERE v.project_id = ?
          GROUP BY v.id
         HAVING COUNT(DISTINCT vv.location_id) >= ?
       ) AS done
       JOIN visitor_visits vv ON vv.visitor_id = done.vid AND vv.visited_at = done.last_visit
      GROUP BY DATE(vv.visited_at)
      ORDER BY d ASC`,
    [projectId, totalActiveLocations || 0],
  );
  const dailyCompletions = (Array.isArray(completionRows) ? completionRows : []) as any[];

  // 두 일자 시리즈를 union → 모든 날짜에 0 채우기
  const dateSet = new Set<string>();
  for (const r of dailyVisitors) dateSet.add(String(r.d).slice(0, 10));
  for (const r of dailyCompletions) dateSet.add(String(r.d).slice(0, 10));
  const allDates = Array.from(dateSet).sort();
  const visMap = new Map<string, number>();
  for (const r of dailyVisitors) visMap.set(String(r.d).slice(0, 10), Number(r.visitors));
  const compMap = new Map<string, number>();
  for (const r of dailyCompletions) compMap.set(String(r.d).slice(0, 10), Number(r.completed));

  res.json({
    ok: true,
    locations: locations.map((l) => ({
      id: l.id,
      display_seq: l.display_seq,
      name: l.location_name,
      visitor_count: Number(l.visitor_count),
    })),
    total_visitors: Number(s.total_visitors || 0),
    completed_visitors: Number(s.completed_visitors || 0),
    gift_issued: Number(s.gift_issued || 0),
    gift_used: Number(s.gift_used || 0),
    total_budget: Number(s.total_budget || 0),
    gift_issued_amount: Number(s.gift_issued_amount || 0),
    gift_used_amount: Number(s.gift_used_amount || 0),
    total_locations: totalActiveLocations,
    daily: allDates.map((d) => ({
      date: d,
      visitors: visMap.get(d) || 0,
      completed: compMap.get(d) || 0,
    })),
  });
});

router.post("/projects/:id/locations", requireHost, iconUpload.single("image"), async (req, res) => {
  const host = req.session.host!;
  const projectId = Number(req.params.id);
  const destType = (req.body.dest_type === "exhibit") ? "exhibit" : "location";
  const locationName = String(req.body.location_name ?? "").trim();
  const locationDesc = String(req.body.location_desc ?? "").trim();
  const kakaoLat = req.body.kakao_lat;
  const kakaoLng = req.body.kakao_lng;
  const imagePath = req.file ? req.file.path : null;

  if (destType === "location") {
    if (!locationName || !kakaoLat || !kakaoLng) {
      res.status(400).json({ error: "장소명·좌표를 모두 입력해 주세요." });
      return;
    }
    if (locationName.length > 100) {
      res.status(400).json({ error: "장소명은 100자 이내여야 합니다." });
      return;
    }
    if (locationDesc.length > 500) {
      res.status(400).json({ error: "설명은 500자 이내여야 합니다." });
      return;
    }
  } else {
    if (!locationName) {
      res.status(400).json({ error: "제목을 입력해 주세요." });
      return;
    }
    if (locationName.length > 100) {
      res.status(400).json({ error: "제목은 100자 이내여야 합니다." });
      return;
    }
    if (locationDesc.length > 500) {
      res.status(400).json({ error: "전시물 설명은 500자 이내여야 합니다." });
      return;
    }
  }

  const [projectRows] = await pool.execute("SELECT id FROM projects WHERE id = ? AND host_id = ?", [projectId, host.id]);
  if (!Array.isArray(projectRows) || projectRows.length === 0) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }

  const [activeRows] = await pool.execute(
    "SELECT COUNT(*) AS count_active FROM project_locations WHERE project_id = ? AND disabled = 0",
    [projectId],
  );
  const activeCount = Number((activeRows as any)[0].count_active);
  if (activeCount >= 15) {
    res.status(400).json({ error: "활성 목적지는 최대 15개까지 등록 가능합니다." });
    return;
  }

  const numbers = await nextLocationNumbers(projectId);
  if (numbers.displaySeq === null) {
    res.status(400).json({ error: "등록 가능한 표시 번호가 없습니다." });
    return;
  }

  const isLocation = destType === "location";
  await pool.execute(
    `INSERT INTO project_locations
     (project_id, location_seq, display_seq, dest_type, location_name, kakao_lat, kakao_lng, location_desc, image_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      projectId,
      numbers.locationSeq,
      numbers.displaySeq,
      destType,
      locationName,
      isLocation ? Number(kakaoLat) : null,
      isLocation ? Number(kakaoLng) : null,
      isLocation ? locationDesc : null,
      imagePath,
    ],
  );

  // 입금확인 이후 추가된 목적지에도 QR이 생기도록 보완 생성
  await regenerateQrsIfReady(projectId);

  res.json({ ok: true, locationSeq: numbers.locationSeq, displaySeq: numbers.displaySeq });
});

router.put("/projects/:projectId/locations/:locationId", requireHost, iconUpload.single("image"), async (req, res) => {
  const host = req.session.host!;
  const projectId = Number(req.params.projectId);
  const locationId = Number(req.params.locationId);
  const location_name = String(req.body.location_name ?? "").trim();
  const location_desc = String(req.body.location_desc ?? "").trim();
  const kakao_lat = req.body.kakao_lat;
  const kakao_lng = req.body.kakao_lng;
  const removeImage = String(req.body.remove_image ?? "") === "1";

  const [projectRows] = await pool.execute("SELECT id FROM projects WHERE id = ? AND host_id = ?", [projectId, host.id]);
  if (!Array.isArray(projectRows) || projectRows.length === 0) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }
  const [locRows] = await pool.execute(
    "SELECT id, image_path FROM project_locations WHERE id = ? AND project_id = ?",
    [locationId, projectId],
  );
  const oldRow = (locRows as any[])[0];
  if (!oldRow) {
    res.status(404).json({ error: "location_not_found" });
    return;
  }
  if (!location_name) {
    res.status(400).json({ error: "이름을 입력해 주세요." });
    return;
  }
  if (location_name.length > 100) {
    res.status(400).json({ error: "이름은 100자 이내여야 합니다." });
    return;
  }
  if (location_desc.length > 500) {
    res.status(400).json({ error: "설명은 500자 이내여야 합니다." });
    return;
  }
  // 이미지 처리 — 새 파일 / remove_image / 유지
  let imagePath: string | null = oldRow.image_path;
  if (req.file) {
    imagePath = req.file.path;
  } else if (removeImage) {
    imagePath = null;
  }

  await pool.execute(
    `UPDATE project_locations
     SET location_name = ?, kakao_lat = ?, kakao_lng = ?, location_desc = ?, image_path = ?, updated_at = NOW()
     WHERE id = ? AND project_id = ?`,
    [location_name,
     kakao_lat !== undefined && kakao_lat !== null && kakao_lat !== "" ? Number(kakao_lat) : null,
     kakao_lng !== undefined && kakao_lng !== null && kakao_lng !== "" ? Number(kakao_lng) : null,
     location_desc, imagePath, locationId, projectId],
  );

  res.json({ ok: true });
});

router.put("/projects/:projectId/locations/:locationId/disable", requireHost, async (req, res) => {
  const host = req.session.host!;
  const projectId = Number(req.params.projectId);
  const locationId = Number(req.params.locationId);

  const [projectRows] = await pool.execute("SELECT id FROM projects WHERE id = ? AND host_id = ?", [projectId, host.id]);
  if (!Array.isArray(projectRows) || projectRows.length === 0) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }

  // display_seq를 (프로젝트 내 유일한) location_seq로 옮겨 비활성 행 간 표시번호 충돌 방지
  await pool.execute(
    "UPDATE project_locations SET disabled = 1, display_seq = location_seq, updated_at = NOW() WHERE id = ? AND project_id = ?",
    [locationId, projectId],
  );
  // 연계 퀴즈도 같이 비활성화
  await pool.execute(
    "UPDATE project_quizzes SET disabled = 1, updated_at = NOW() WHERE location_id = ? AND project_id = ?",
    [locationId, projectId],
  );
  res.json({ ok: true });
});

router.put("/projects/:projectId/locations/:locationId/enable", requireHost, async (req, res) => {
  const host = req.session.host!;
  const projectId = Number(req.params.projectId);
  const locationId = Number(req.params.locationId);

  const [projectRows] = await pool.execute("SELECT id FROM projects WHERE id = ? AND host_id = ?", [projectId, host.id]);
  if (!Array.isArray(projectRows) || projectRows.length === 0) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }

  // 활성 표시번호(1~15) 중 빈 자리를 새로 배정해 다시 활성화
  const numbers = await nextLocationNumbers(projectId);
  if (numbers.displaySeq === null) {
    res.status(400).json({ error: "활성 목적지는 최대 15개까지 가능합니다." });
    return;
  }

  await pool.execute(
    "UPDATE project_locations SET disabled = 0, display_seq = ?, updated_at = NOW() WHERE id = ? AND project_id = ? AND disabled = 1",
    [numbers.displaySeq, locationId, projectId],
  );
  // 연계 퀴즈도 같이 활성화
  await pool.execute(
    "UPDATE project_quizzes SET disabled = 0, updated_at = NOW() WHERE location_id = ? AND project_id = ?",
    [locationId, projectId],
  );
  await regenerateQrsIfReady(projectId);
  res.json({ ok: true });
});

router.post("/projects/:id/locations/submit", requireHost, async (req, res) => {
  const host = req.session.host!;
  const projectId = Number(req.params.id);

  const [projectRows] = await pool.execute("SELECT id FROM projects WHERE id = ? AND host_id = ?", [projectId, host.id]);
  if (!Array.isArray(projectRows) || projectRows.length === 0) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }

  const [activeRows] = await pool.execute(
    "SELECT COUNT(*) AS count_active FROM project_locations WHERE project_id = ? AND disabled = 0",
    [projectId],
  );
  if (Number((activeRows as any)[0].count_active) === 0) {
    res.status(400).json({ error: "제출할 활성 목적지가 없습니다." });
    return;
  }

  await pool.execute(
    `UPDATE projects
     SET locations_submitted = 1, locations_submitted_at = COALESCE(locations_submitted_at, NOW()), updated_at = NOW()
     WHERE id = ? AND host_id = ?`,
    [projectId, host.id],
  );
  res.json({ ok: true });
});

router.get("/projects/:id/locations", requireHost, async (req, res) => {
  const host = req.session.host!;
  const projectId = Number(req.params.id);
  const [projectRows] = await pool.execute(
    "SELECT status, locations_submitted FROM projects WHERE id = ? AND host_id = ?",
    [projectId, host.id],
  );
  if (!Array.isArray(projectRows) || projectRows.length === 0) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }
  const project = (projectRows as any)[0];

  const [rows] = await pool.execute(
    `SELECT pl.*, qr.qr_url, qr.qr_image_path
     FROM project_locations pl
     LEFT JOIN project_location_qr qr ON qr.location_id = pl.id
     WHERE pl.project_id = ?
     ORDER BY pl.display_seq ASC`,
    [projectId],
  );

  // QR은 입금확인(deposit_confirmed) 이후부터 host가 확인 가능
  const qrReady = QR_READY_STATUSES.includes(String(project.status));
  const data = (Array.isArray(rows) ? rows : []).map((r: any) => ({
    ...r,
    image_url: toUploadUrl(r.image_path),
    qr_image_url: qrReady ? toUploadUrl(r.qr_image_path) : null,
  }));

  // 단계별 보상 tier 개수 — 100% 포함 (단계별 보상 사용 시 N >= 2)
  const [tCntRows] = await pool.execute(
    "SELECT COUNT(*) AS n FROM project_gift_tiers WHERE project_id = ?",
    [projectId],
  );
  const tierCount = Number((tCntRows as any[])[0]?.n || 0);

  res.json({
    ok: true,
    data,
    status: project.status,
    started: project.status === "started",
    qr_ready: qrReady,
    tier_count: tierCount,
    locations_submitted: Number(project.locations_submitted) === 1,
  });
});

// ── 프로젝트 객관식 퀴즈 (single/multi) ──

async function ensureHostOwnsProject(projectId: number, hostId: number): Promise<boolean> {
  const [rows] = await pool.execute(
    "SELECT 1 FROM projects WHERE id = ? AND host_id = ?",
    [projectId, hostId],
  );
  return Array.isArray(rows) && rows.length > 0;
}

router.get("/projects/:id/quizzes", requireHost, async (req, res) => {
  const host = req.session.host!;
  const projectId = Number(req.params.id);
  if (!(await ensureHostOwnsProject(projectId, host.id))) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }
  // admin 화면용 — 비활성 퀴즈도 함께 노출 (활성/비활성 토글 위해)
  const [quizRows] = await pool.execute(
    `SELECT q.id, q.question, q.question_image_path, q.choice_type, q.location_id,
            l.location_name AS location_name, l.display_seq AS location_display_seq,
            l.disabled AS location_disabled,
            q.display_seq, q.disabled, q.created_at
     FROM project_quizzes q
     LEFT JOIN project_locations l ON l.id = q.location_id
     WHERE q.project_id = ?
     ORDER BY q.disabled ASC, q.display_seq ASC, q.id ASC`,
    [projectId],
  );
  const quizzes = (Array.isArray(quizRows) ? quizRows : []) as any[];

  let choicesByQuiz: Record<number, any[]> = {};
  if (quizzes.length) {
    const ids = quizzes.map((q) => q.id);
    const [choiceRows] = await pool.query(
      `SELECT id, quiz_id, choice_text, choice_image_path, is_correct, display_seq
       FROM project_quiz_choices
       WHERE quiz_id IN (?)
       ORDER BY quiz_id ASC, display_seq ASC, id ASC`,
      [ids],
    );
    for (const c of (Array.isArray(choiceRows) ? choiceRows : []) as any[]) {
      (choicesByQuiz[c.quiz_id] ??= []).push({
        id: c.id,
        text: c.choice_text,
        image_url: toUploadUrl(c.choice_image_path),
        is_correct: Number(c.is_correct) === 1,
        display_seq: c.display_seq,
      });
    }
  }

  res.json({
    ok: true,
    data: quizzes.map((q: any) => ({
      id: q.id,
      question: q.question,
      question_image_url: toUploadUrl(q.question_image_path),
      choice_type: q.choice_type,
      location_id: q.location_id,
      location_name: q.location_name,
      location_display_seq: q.location_display_seq,
      location_disabled: q.location_disabled === null ? null : Number(q.location_disabled),
      display_seq: q.display_seq,
      disabled: Number(q.disabled),
      created_at: q.created_at,
      choices: choicesByQuiz[q.id] ?? [],
    })),
  });
});

// 퀴즈 활성/비활성 토글 — 비연계 퀴즈만 허용 (연계 퀴즈는 목적지 상태를 따름)
router.put("/projects/:id/quizzes/:qid/toggle", requireHost, async (req, res) => {
  const host = req.session.host!;
  const projectId = Number(req.params.id);
  const quizId = Number(req.params.qid);
  if (!(await ensureHostOwnsProject(projectId, host.id))) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }
  const [rows] = await pool.execute(
    "SELECT id, location_id, disabled FROM project_quizzes WHERE id = ? AND project_id = ?",
    [quizId, projectId],
  );
  const q = (rows as any[])[0];
  if (!q) {
    res.status(404).json({ error: "quiz_not_found" });
    return;
  }
  if (q.location_id !== null) {
    res.status(400).json({ error: "연계 목적지의 활성 상태를 따릅니다. 목적지를 활성/비활성화하면 자동 적용됩니다." });
    return;
  }
  const newDisabled = Number(q.disabled) === 1 ? 0 : 1;
  await pool.execute(
    "UPDATE project_quizzes SET disabled = ?, updated_at = NOW() WHERE id = ? AND project_id = ?",
    [newDisabled, quizId, projectId],
  );
  res.json({ ok: true, disabled: newDisabled });
});

router.post(
  "/projects/:id/quizzes",
  requireHost,
  quizImageUpload.any(),
  async (req, res) => {
    const host = req.session.host!;
    const projectId = Number(req.params.id);
    const question = String(req.body.question ?? "").trim();
    const locationIdRaw = req.body.location_id;
    const locationId =
      locationIdRaw === undefined || locationIdRaw === null || locationIdRaw === "" || locationIdRaw === "null"
        ? null
        : Number(locationIdRaw);
    const files = (req.files as Express.Multer.File[]) || [];
    const questionFile = files.find((f) => f.fieldname === "question_image");
    let choices: Array<{ text: string; is_correct: boolean }> = [];
    try {
      choices = JSON.parse(String(req.body.choices ?? "[]"));
    } catch {
      res.status(400).json({ error: "보기 데이터 형식이 올바르지 않습니다." });
      return;
    }

    if (!(await ensureHostOwnsProject(projectId, host.id))) {
      res.status(404).json({ error: "project_not_found" });
      return;
    }
    if (!question) {
      res.status(400).json({ error: "질문을 입력해 주세요." });
      return;
    }
    if (question.length > 500) {
      res.status(400).json({ error: "질문은 500자 이내여야 합니다." });
      return;
    }
    if (!Array.isArray(choices) || choices.length < 2) {
      res.status(400).json({ error: "보기는 최소 2개 이상 입력해 주세요." });
      return;
    }
    const cleanChoices = choices
      .map((c) => ({ text: String(c?.text ?? "").trim(), is_correct: !!c?.is_correct }))
      .filter((c) => c.text.length > 0);
    if (cleanChoices.length < 2) {
      res.status(400).json({ error: "내용이 있는 보기를 2개 이상 입력해 주세요." });
      return;
    }
    if (cleanChoices.some((c) => c.text.length > 500)) {
      res.status(400).json({ error: "보기는 각 500자 이내여야 합니다." });
      return;
    }
    const correctCount = cleanChoices.filter((c) => c.is_correct).length;
    if (correctCount < 1) {
      res.status(400).json({ error: "정답을 1개 이상 선택해 주세요." });
      return;
    }
    // 정답 개수에 따라 단일/다중 자동 결정
    const choice_type: "single" | "multi" = correctCount === 1 ? "single" : "multi";

    if (locationId !== null) {
      if (!Number.isFinite(locationId) || locationId <= 0) {
        res.status(400).json({ error: "연계 목적지가 올바르지 않습니다." });
        return;
      }
      const [locRows] = await pool.execute(
        "SELECT id FROM project_locations WHERE id = ? AND project_id = ? AND disabled = 0",
        [locationId, projectId],
      );
      if (!(locRows as any[]).length) {
        res.status(400).json({ error: "선택한 목적지가 이 프로젝트에 존재하지 않습니다." });
        return;
      }
    }

    const questionImagePath = questionFile ? path.join("uploads", "quiz-images", questionFile.filename) : null;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [seqRows] = await connection.execute(
        "SELECT COALESCE(MAX(display_seq), 0) + 1 AS next_seq FROM project_quizzes WHERE project_id = ?",
        [projectId],
      );
      const nextSeq = Number((seqRows as any)[0].next_seq);

      const [insertResult] = await connection.execute(
        `INSERT INTO project_quizzes
           (project_id, location_id, question, question_image_path, choice_type, display_seq)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [projectId, locationId, question, questionImagePath, choice_type, nextSeq],
      );
      const quizId = Number((insertResult as any).insertId);

      for (let i = 0; i < cleanChoices.length; i++) {
        const c = cleanChoices[i];
        const choiceFile = files.find((f) => f.fieldname === `choice_image_${i}`);
        const choiceImagePath = choiceFile
          ? path.join("uploads", "quiz-images", choiceFile.filename)
          : null;
        await connection.execute(
          `INSERT INTO project_quiz_choices (quiz_id, choice_text, choice_image_path, is_correct, display_seq)
           VALUES (?, ?, ?, ?, ?)`,
          [quizId, c.text, choiceImagePath, c.is_correct ? 1 : 0, i + 1],
        );
      }

      await connection.commit();
      res.json({ ok: true, id: quizId, choice_type });
    } catch (e) {
      await connection.rollback();
      res.status(500).json({ error: "퀴즈 등록에 실패했습니다." });
    } finally {
      connection.release();
    }
  },
);

router.put(
  "/projects/:id/quizzes/:qid",
  requireHost,
  quizImageUpload.any(),
  async (req, res) => {
    const host = req.session.host!;
    const projectId = Number(req.params.id);
    const quizId = Number(req.params.qid);
    const question = String(req.body.question ?? "").trim();
    const locationIdRaw = req.body.location_id;
    const locationId =
      locationIdRaw === undefined || locationIdRaw === null || locationIdRaw === "" || locationIdRaw === "null"
        ? null
        : Number(locationIdRaw);
    const removeImage = String(req.body.remove_image ?? "") === "1";
    const files = (req.files as Express.Multer.File[]) || [];
    const questionFile = files.find((f) => f.fieldname === "question_image");
    // choices 페이로드: [{id?:number, text, is_correct, remove_image?:bool}]
    let choices: Array<{
      id?: number | null;
      text: string;
      is_correct: boolean;
      remove_image?: boolean;
    }> = [];
    try {
      choices = JSON.parse(String(req.body.choices ?? "[]"));
    } catch {
      res.status(400).json({ error: "보기 데이터 형식이 올바르지 않습니다." });
      return;
    }

    if (!(await ensureHostOwnsProject(projectId, host.id))) {
      res.status(404).json({ error: "project_not_found" });
      return;
    }
    const [qRows] = await pool.execute(
      "SELECT id, question_image_path FROM project_quizzes WHERE id = ? AND project_id = ? AND disabled = 0",
      [quizId, projectId],
    );
    if (!(qRows as any[]).length) {
      res.status(404).json({ error: "quiz_not_found" });
      return;
    }
    const oldImagePath = (qRows as any[])[0].question_image_path as string | null;

    if (!question) {
      res.status(400).json({ error: "질문을 입력해 주세요." });
      return;
    }
    if (question.length > 500) {
      res.status(400).json({ error: "질문은 500자 이내여야 합니다." });
      return;
    }
    if (!Array.isArray(choices) || choices.length < 2) {
      res.status(400).json({ error: "보기는 최소 2개 이상 입력해 주세요." });
      return;
    }
    const cleanChoices = choices
      .map((c) => ({
        id: c?.id != null ? Number(c.id) : null,
        text: String(c?.text ?? "").trim(),
        is_correct: !!c?.is_correct,
        remove_image: !!c?.remove_image,
      }))
      .filter((c) => c.text.length > 0);
    if (cleanChoices.length < 2) {
      res.status(400).json({ error: "내용이 있는 보기를 2개 이상 입력해 주세요." });
      return;
    }
    if (cleanChoices.some((c) => c.text.length > 500)) {
      res.status(400).json({ error: "보기는 각 500자 이내여야 합니다." });
      return;
    }
    const correctCount = cleanChoices.filter((c) => c.is_correct).length;
    if (correctCount < 1) {
      res.status(400).json({ error: "정답을 1개 이상 선택해 주세요." });
      return;
    }
    const choice_type: "single" | "multi" = correctCount === 1 ? "single" : "multi";

    if (locationId !== null) {
      if (!Number.isFinite(locationId) || locationId <= 0) {
        res.status(400).json({ error: "연계 목적지가 올바르지 않습니다." });
        return;
      }
      const [locRows] = await pool.execute(
        "SELECT id FROM project_locations WHERE id = ? AND project_id = ? AND disabled = 0",
        [locationId, projectId],
      );
      if (!(locRows as any[]).length) {
        res.status(400).json({ error: "선택한 목적지가 이 프로젝트에 존재하지 않습니다." });
        return;
      }
    }

    // 질문 이미지: 새 파일 / remove_image / 유지
    let newImagePath: string | null = oldImagePath;
    if (questionFile) {
      newImagePath = path.join("uploads", "quiz-images", questionFile.filename);
    } else if (removeImage) {
      newImagePath = null;
    }

    // 옛 choices의 image_path를 id로 lookup
    const [oldChoiceRows] = await pool.execute(
      "SELECT id, choice_image_path FROM project_quiz_choices WHERE quiz_id = ?",
      [quizId],
    );
    const oldChoiceImageMap = new Map<number, string | null>();
    (oldChoiceRows as any[]).forEach((r) => oldChoiceImageMap.set(Number(r.id), r.choice_image_path));

    // 각 새 choice의 최종 image_path 결정
    const choicesWithImage = cleanChoices.map((c, i) => {
      const newFile = files.find((f) => f.fieldname === `choice_image_${i}`);
      let imagePath: string | null = null;
      if (newFile) {
        imagePath = path.join("uploads", "quiz-images", newFile.filename);
      } else if (c.id != null && !c.remove_image) {
        imagePath = oldChoiceImageMap.get(c.id) ?? null;
      }
      return { ...c, imagePath };
    });

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `UPDATE project_quizzes
            SET location_id = ?, question = ?, question_image_path = ?, choice_type = ?, updated_at = NOW()
          WHERE id = ? AND project_id = ?`,
        [locationId, question, newImagePath, choice_type, quizId, projectId],
      );
      await connection.execute("DELETE FROM project_quiz_choices WHERE quiz_id = ?", [quizId]);
      for (let i = 0; i < choicesWithImage.length; i++) {
        const c = choicesWithImage[i];
        await connection.execute(
          `INSERT INTO project_quiz_choices (quiz_id, choice_text, choice_image_path, is_correct, display_seq)
           VALUES (?, ?, ?, ?, ?)`,
          [quizId, c.text, c.imagePath, c.is_correct ? 1 : 0, i + 1],
        );
      }
      await connection.commit();

      // 질문 이미지 cleanup
      if (oldImagePath && newImagePath !== oldImagePath) {
        try { fs.unlinkSync(path.join(process.cwd(), oldImagePath)); } catch {}
      }
      // 답항 이미지 cleanup — 더 이상 사용되지 않는 옛 image_path 삭제
      const stillUsed = new Set(choicesWithImage.map((c) => c.imagePath).filter(Boolean));
      for (const [, oldPath] of oldChoiceImageMap) {
        if (oldPath && !stillUsed.has(oldPath)) {
          try { fs.unlinkSync(path.join(process.cwd(), oldPath)); } catch {}
        }
      }

      res.json({ ok: true, id: quizId, choice_type });
    } catch (e) {
      await connection.rollback();
      res.status(500).json({ error: "퀴즈 수정에 실패했습니다." });
    } finally {
      connection.release();
    }
  },
);

router.delete("/projects/:id/quizzes/:qid", requireHost, async (req, res) => {
  const host = req.session.host!;
  const projectId = Number(req.params.id);
  const quizId = Number(req.params.qid);
  if (!(await ensureHostOwnsProject(projectId, host.id))) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }
  // 소프트 삭제 (disabled = 1) — 외부에 노출되지 않게
  const [r] = await pool.execute(
    "UPDATE project_quizzes SET disabled = 1, updated_at = NOW() WHERE id = ? AND project_id = ?",
    [quizId, projectId],
  );
  if ((r as any).affectedRows === 0) {
    res.status(404).json({ error: "quiz_not_found" });
    return;
  }
  res.json({ ok: true });
});

router.get("/projects/:id/visitors", requireHost, async (req, res) => {
  const host = req.session.host!;
  const projectId = Number(req.params.id);

  const [projectRows] = await pool.execute("SELECT id FROM projects WHERE id = ? AND host_id = ?", [projectId, host.id]);
  if (!Array.isArray(projectRows) || projectRows.length === 0) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }

  const [totRows] = await pool.execute(
    "SELECT COUNT(*) AS total FROM project_locations WHERE project_id = ? AND disabled = 0",
    [projectId],
  );
  const totalLocations = Number((totRows as any)[0].total);

  // 활성 목적지를 1곳 이상 방문한 방문자 목록 (휴대폰번호 = 식별값) + Gift 사용 정보
  const [rows] = await pool.execute(
    `SELECT v.phone, v.consent_at,
            COUNT(DISTINCT vv.location_id) AS visited_count,
            MAX(vv.visited_at) AS last_visited_at,
            (SELECT COUNT(*) FROM gift_redemptions g WHERE g.visitor_id = v.id) AS gift_count,
            (SELECT g.redemption_type FROM gift_redemptions g WHERE g.visitor_id = v.id
              ORDER BY g.redeemed_at DESC, g.id DESC LIMIT 1) AS gift_type,
            (SELECT g.redeemed_at FROM gift_redemptions g WHERE g.visitor_id = v.id
              ORDER BY g.redeemed_at DESC, g.id DESC LIMIT 1) AS gift_used_at
     FROM visitors v
     JOIN visitor_visits vv ON vv.visitor_id = v.id
     JOIN project_locations pl ON pl.id = vv.location_id AND pl.disabled = 0
     WHERE v.project_id = ?
     GROUP BY v.id, v.phone, v.consent_at
     ORDER BY visited_count DESC, last_visited_at DESC`,
    [projectId],
  );

  const data = (Array.isArray(rows) ? rows : []).map((r: any) => ({
    phone: r.phone,
    consent_at: r.consent_at,
    visited_count: Number(r.visited_count),
    last_visited_at: r.last_visited_at,
    completed: totalLocations > 0 && Number(r.visited_count) >= totalLocations,
    gift_issued: totalLocations > 0 && Number(r.visited_count) >= totalLocations, // 미션완료 = 발급 대상
    gift_used: Number(r.gift_count) > 0,
    gift_type: r.gift_type || null,   // 'normal'(지급) | 'grant'(증정) | null
    gift_used_at: r.gift_used_at,
  }));

  res.json({ ok: true, totalLocations, data });
});

// ── 방문자 현황: (팝업 필터 동일 적용) 엑셀 다운로드 ──
router.get("/projects/:id/visitors/export", requireHost, async (req, res) => {
  const host = req.session.host!;
  const projectId = Number(req.params.id);

  const [projectRows] = await pool.execute(
    "SELECT id, project_serial, project_name FROM projects WHERE id = ? AND host_id = ?",
    [projectId, host.id],
  );
  const project = (Array.isArray(projectRows) ? projectRows[0] : null) as any;
  if (!project) { res.status(404).json({ error: "project_not_found" }); return; }

  const [totRows] = await pool.execute(
    "SELECT COUNT(*) AS total FROM project_locations WHERE project_id = ? AND disabled = 0",
    [projectId],
  );
  const totalLocations = Number((totRows as any)[0].total);

  const [rows] = await pool.execute(
    `SELECT v.phone,
            COUNT(DISTINCT vv.location_id) AS visited_count,
            MAX(vv.visited_at) AS last_visited_at,
            (SELECT COUNT(*) FROM gift_redemptions g WHERE g.visitor_id = v.id) AS gift_count,
            (SELECT g.redemption_type FROM gift_redemptions g WHERE g.visitor_id = v.id
              ORDER BY g.redeemed_at DESC, g.id DESC LIMIT 1) AS gift_type,
            (SELECT g.redeemed_at FROM gift_redemptions g WHERE g.visitor_id = v.id
              ORDER BY g.redeemed_at DESC, g.id DESC LIMIT 1) AS gift_used_at
     FROM visitors v
     JOIN visitor_visits vv ON vv.visitor_id = v.id
     JOIN project_locations pl ON pl.id = vv.location_id AND pl.disabled = 0
     WHERE v.project_id = ?
     GROUP BY v.id, v.phone, v.consent_at
     ORDER BY visited_count DESC, last_visited_at DESC`,
    [projectId],
  );

  let data = (Array.isArray(rows) ? rows : []).map((r: any) => ({
    phone: r.phone,
    visited_count: Number(r.visited_count),
    last_visited_at: r.last_visited_at,
    completed: totalLocations > 0 && Number(r.visited_count) >= totalLocations,
    gift_issued: totalLocations > 0 && Number(r.visited_count) >= totalLocations,
    gift_used: Number(r.gift_count) > 0,
    gift_type: r.gift_type || null,
    gift_used_at: r.gift_used_at,
  }));

  // 팝업과 동일한 필터 적용
  const { phone = "", mission = "", issued = "", used = "", type = "" } = req.query as Record<string, string>;
  const pq = phone.replace(/[^0-9]/g, "");
  data = data.filter((v) => {
    if (pq && !String(v.phone || "").includes(pq)) return false;
    if (mission && (v.completed !== (mission === "done"))) return false;
    if (issued && (v.gift_issued !== (issued === "y"))) return false;
    if (used && (v.gift_used !== (used === "y"))) return false;
    if (type) { if (type === "none") { if (v.gift_type) return false; } else if (v.gift_type !== type) return false; }
    return true;
  });

  const fmtDT = (s: any) => {
    if (!s) return "";
    const d = new Date(s); if (isNaN(d.getTime())) return "";
    const z = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`;
  };
  const fmtPhone = (p: any) => {
    const s = String(p || "").replace(/[^0-9]/g, "");
    if (s.length === 11) return `${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7)}`;
    if (s.length === 10) return `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}`;
    return s;
  };
  const giftType = (t: any) => (t === "normal" ? "지급" : t === "grant" ? "증정" : "-");

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("방문객");
  ws.columns = [
    { header: "휴대폰번호", key: "phone", width: 18 },
    { header: "방문", key: "visited", width: 12 },
    { header: "미션", key: "mission", width: 10 },
    { header: "Gift 발급여부", key: "issued", width: 13 },
    { header: "Gift 사용여부", key: "used", width: 13 },
    { header: "Gift 사용타입", key: "type", width: 12 },
    { header: "Gift 사용일자", key: "giftDate", width: 20 },
    { header: "최근 방문", key: "lastVisit", width: 20 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };

  for (const v of data) {
    ws.addRow({
      phone: fmtPhone(v.phone),
      visited: `${v.visited_count} / ${totalLocations}`,
      mission: v.completed ? "완료" : "진행중",
      issued: v.gift_issued ? "발급" : "미발급",
      used: v.gift_used ? "사용" : "미사용",
      type: giftType(v.gift_type),
      giftDate: fmtDT(v.gift_used_at),
      lastVisit: fmtDT(v.last_visited_at),
    });
  }

  const fnameBase = `${project.project_serial}_방문객`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fnameBase)}.xlsx`);
  await wb.xlsx.write(res);
  res.end();
});

router.get("/projects/:id/qr-zip", requireHost, async (req, res) => {
  const host = req.session.host!;
  const projectId = Number(req.params.id);
  const [rows] = await pool.execute("SELECT id, project_serial, status FROM projects WHERE id = ? AND host_id = ?", [projectId, host.id]);
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }
  const project = (rows as any)[0];
  if (!QR_READY_STATUSES.includes(String(project.status))) {
    res.status(400).json({ error: "QR 코드가 아직 생성되지 않았습니다. (입금확인 후 생성됩니다)" });
    return;
  }

  const zipPath = await createQrZip(projectId);
  res.download(zipPath, `${project.project_serial}_qr.zip`);
});

router.post("/projects/:id/qr-regenerate", requireHost, async (req, res) => {
  const host = req.session.host!;
  const projectId = Number(req.params.id);
  const { reason = "" } = (req.body ?? {}) as Record<string, string>;
  const startedAt = new Date();

  const [rows] = await pool.execute("SELECT id, project_serial, status FROM projects WHERE id = ? AND host_id = ?", [projectId, host.id]);
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }
  const project = (rows as any)[0];
  if (!QR_READY_STATUSES.includes(String(project.status))) {
    res.status(400).json({ error: "QR 코드가 아직 생성되지 않은 상태입니다. (입금확인 후 생성됩니다)" });
    return;
  }
  if (!reason.trim()) {
    res.status(400).json({ error: "재생성 사유를 입력해 주세요." });
    return;
  }

  let errMsg: string | null = null;
  try {
    await generateProjectQrs(projectId, String(project.project_serial));
  } catch (e) {
    errMsg = e instanceof Error ? e.message : String(e);
  }

  try {
    await pool.execute(
      `INSERT INTO batch_logs (job_key, source, status, result_summary, started_at, finished_at, error_msg, details)
       VALUES (?, ?, ?, ?, ?, NOW(), ?, ?)`,
      [
        "qr_regenerate",
        "host",
        errMsg ? "error" : "ok",
        `project:${project.project_serial}`,
        startedAt,
        errMsg,
        JSON.stringify({ project_id: projectId, project_serial: project.project_serial, host_id: host.id, reason: reason.trim() }),
      ],
    );
  } catch (e) {
    console.error("[qr-regenerate] batch_logs insert failed:", e);
  }

  if (errMsg) {
    res.status(500).json({ error: "QR 코드 재생성에 실패했습니다." });
    return;
  }

  res.json({ ok: true, ts: Date.now() });
});

router.get("/projects/:id/confirm-quote", async (req, res) => {
  const projectId = Number(req.params.id);
  const { token, host_id } = req.query as Record<string, string>;
  const hostId = Number(host_id);

  if (!token || !host_id || isNaN(projectId) || isNaN(hostId)) {
    res.status(400).send("잘못된 요청입니다.");
    return;
  }

  if (!verifyQuoteToken(projectId, hostId, token)) {
    res.status(400).send("유효하지 않은 링크입니다.");
    return;
  }

  await pool.execute(
    `UPDATE projects
     SET quote_read = 1,
         quote_read_at = COALESCE(quote_read_at, NOW()),
         status = CASE WHEN status = 'quoted' THEN 'deposit_wait' ELSE status END,
         updated_at = NOW()
     WHERE id = ? AND host_id = ? AND quote_read = 0`,
    [projectId, hostId],
  );

  // 상대 경로로 리다이렉트 — 요청이 들어온 origin(예: https://tracker.ngrok.dev)을
  // 브라우저가 그대로 사용한다. BASE_URL/DOMAIN 환경변수 분기 불필요.
  res.redirect("/admin");
});

// ── 가맹점 지원현황 (이 프로젝트에 지원한 가맹점 목록) ──
router.get("/projects/:id/applications", requireHost, async (req, res) => {
  const host = req.session.host!;
  const projectId = Number(req.params.id);

  const [projectRows] = await pool.execute("SELECT id FROM projects WHERE id = ? AND host_id = ?", [projectId, host.id]);
  if (!Array.isArray(projectRows) || projectRows.length === 0) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }

  const k = encKey();
  const [rows] = await pool.execute(
    `SELECT pa.id, pa.status, pa.applied_at, pa.decided_at, pa.decided_reason,
            m.id AS merchant_id, m.biz_no, m.status AS merchant_status,
            ${dec("m.merchant_name", "merchant_name")},
            ${dec("m.contact_name", "contact_name")},
            ${dec("m.contact_phone", "contact_phone")},
            ${dec("m.contact_mobile", "contact_mobile")},
            ${dec("m.email", "email")}
     FROM project_applications pa
     JOIN merchants m ON m.id = pa.merchant_id
     WHERE pa.project_id = ?
     ORDER BY (pa.status = 'pending') DESC, pa.applied_at DESC`,
    [k, k, k, k, k, projectId],
  );

  res.json({ ok: true, data: Array.isArray(rows) ? rows : [] });
});

// ── 가맹점 지원 승인/거절 (결과 메일 발송, 승인 시 PIN 동봉) ──
router.put("/projects/:id/applications/:appId/decision", requireHost, async (req, res) => {
  const host = req.session.host!;
  const projectId = Number(req.params.id);
  const appId = Number(req.params.appId);
  const decision = String(req.body?.decision ?? "");
  const reason = String(req.body?.reason ?? "").trim();

  if (decision !== "approved" && decision !== "rejected") {
    res.status(400).json({ error: "승인 또는 거절만 가능합니다." });
    return;
  }

  const k = encKey();
  const [projectRows] = await pool.execute(
    `SELECT id, project_name, project_serial, ${dec("pin_enc", "pin")} FROM projects WHERE id = ? AND host_id = ?`,
    [k, projectId, host.id],
  );
  const project = (Array.isArray(projectRows) ? projectRows[0] : null) as any;
  if (!project) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }

  const [appRows] = await pool.execute(
    `SELECT pa.id,
            ${dec("m.merchant_name", "merchant_name")},
            ${dec("m.email", "email")}
     FROM project_applications pa
     JOIN merchants m ON m.id = pa.merchant_id
     WHERE pa.id = ? AND pa.project_id = ?`,
    [k, k, appId, projectId],
  );
  const app = (Array.isArray(appRows) ? appRows[0] : null) as any;
  if (!app) {
    res.status(404).json({ error: "application_not_found" });
    return;
  }

  await pool.execute(
    "UPDATE project_applications SET status = ?, decided_at = NOW(), decided_reason = ?, updated_at = NOW() WHERE id = ? AND project_id = ?",
    [decision, reason || null, appId, projectId],
  );

  try {
    await sendMerchantApplicationDecisionEmail({
      email: String(app.email),
      merchantName: String(app.merchant_name),
      projectName: String(project.project_name),
      projectSerial: String(project.project_serial),
      decision: decision as "approved" | "rejected",
      reason: reason || undefined,
      pin: decision === "approved" ? (project.pin ? String(project.pin) : null) : null,
    });
  } catch (e) {
    console.error("sendMerchantApplicationDecisionEmail failed:", e);
  }

  res.json({ ok: true });
});

// ── 정산: 내 프로젝트별 Gift 사용/증정 집계 (가맹점 정산과 동일 구성) ──
router.get("/settlement", requireHost, async (req, res) => {
  const hostId = req.session.host!.id;
  const { project_name = "", status = "" } = req.query as Record<string, string>;

  let where = "WHERE p.host_id = ? AND p.status IN ('ready_to_start','started','completed')";
  const params: Array<string | number> = [hostId];
  if (project_name.trim()) { where += " AND p.project_name LIKE ?"; params.push(`%${project_name.trim()}%`); }
  if (["ready_to_start", "started", "completed"].includes(status)) { where += " AND p.status = ?"; params.push(status); }

  const [rows] = await pool.execute(
    `SELECT p.id, p.project_name, p.project_serial, p.status, p.gift_amount, p.prize_amount, p.budget_amount,
            (SELECT COUNT(*) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.redemption_type = 'normal') AS used_count,
            (SELECT COALESCE(SUM(gr.amount),0) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.redemption_type = 'normal') AS used_amount,
            (SELECT COUNT(*) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.redemption_type = 'grant') AS grant_count,
            (SELECT COALESCE(SUM(gr.amount),0) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.redemption_type = 'grant') AS grant_amount,
            (SELECT COUNT(DISTINCT gr.visitor_id) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.redemption_type = 'normal') AS used_users,
            (SELECT COUNT(DISTINCT gr.visitor_id) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.redemption_type = 'grant') AS grant_users
     FROM projects p
     ${where}
     ORDER BY FIELD(p.status, 'started', 'ready_to_start', 'completed'), p.from_date DESC, p.id DESC`,
    params,
  );

  res.json({ ok: true, data: Array.isArray(rows) ? rows : [] });
});

// ── 정산(가맹점별): 프로젝트 × 가맹점 그룹 집계 ──
router.get("/settlement/by-merchant", requireHost, async (req, res) => {
  const hostId = req.session.host!.id;
  const { project_name = "", status = "" } = req.query as Record<string, string>;
  const k = encKey();

  let where = "WHERE p.host_id = ? AND p.status IN ('ready_to_start','started','completed')";
  const params: Array<string | number> = [k, hostId];
  if (project_name.trim()) { where += " AND p.project_name LIKE ?"; params.push(`%${project_name.trim()}%`); }
  if (["ready_to_start", "started", "completed"].includes(status)) { where += " AND p.status = ?"; params.push(status); }

  const [rows] = await pool.execute(
    `SELECT p.id AS project_id, p.project_name, p.project_serial, p.status,
            p.gift_amount, p.prize_amount, p.budget_amount,
            gr.merchant_id,
            COALESCE(fn_decrypt(m.merchant_name, ?), '(미기록)') AS merchant_name,
            SUM(CASE WHEN gr.redemption_type='normal' THEN 1 ELSE 0 END) AS used_count,
            SUM(CASE WHEN gr.redemption_type='normal' THEN gr.amount ELSE 0 END) AS used_amount,
            SUM(CASE WHEN gr.redemption_type='grant' THEN 1 ELSE 0 END) AS grant_count,
            SUM(CASE WHEN gr.redemption_type='grant' THEN gr.amount ELSE 0 END) AS grant_amount,
            COUNT(DISTINCT CASE WHEN gr.redemption_type='normal' THEN gr.visitor_id END) AS used_users,
            COUNT(DISTINCT CASE WHEN gr.redemption_type='grant' THEN gr.visitor_id END) AS grant_users
     FROM projects p
     JOIN gift_redemptions gr ON gr.project_id = p.id
     LEFT JOIN merchants m ON m.id = gr.merchant_id
     ${where}
     GROUP BY p.id, gr.merchant_id
     ORDER BY FIELD(p.status, 'started', 'ready_to_start', 'completed'), p.from_date DESC, p.id DESC, merchant_name ASC`,
    params,
  );

  res.json({ ok: true, data: Array.isArray(rows) ? rows : [] });
});

// ── 정산(일별): 프로젝트 × 일자 × 가맹점 그룹 집계 ──
router.get("/settlement/by-day", requireHost, async (req, res) => {
  const hostId = req.session.host!.id;
  const { project_name = "", status = "" } = req.query as Record<string, string>;
  const k = encKey();

  let where = "WHERE p.host_id = ? AND p.status IN ('ready_to_start','started','completed')";
  const params: Array<string | number> = [k, hostId];
  if (project_name.trim()) { where += " AND p.project_name LIKE ?"; params.push(`%${project_name.trim()}%`); }
  if (["ready_to_start", "started", "completed"].includes(status)) { where += " AND p.status = ?"; params.push(status); }

  const [rows] = await pool.execute(
    `SELECT p.id AS project_id, p.project_name, p.project_serial, p.status,
            p.gift_amount, p.prize_amount, p.budget_amount,
            DATE(gr.redeemed_at) AS day,
            gr.merchant_id,
            COALESCE(fn_decrypt(m.merchant_name, ?), '(미기록)') AS merchant_name,
            SUM(CASE WHEN gr.redemption_type='normal' THEN 1 ELSE 0 END) AS used_count,
            SUM(CASE WHEN gr.redemption_type='normal' THEN gr.amount ELSE 0 END) AS used_amount,
            SUM(CASE WHEN gr.redemption_type='grant' THEN 1 ELSE 0 END) AS grant_count,
            SUM(CASE WHEN gr.redemption_type='grant' THEN gr.amount ELSE 0 END) AS grant_amount,
            COUNT(DISTINCT CASE WHEN gr.redemption_type='normal' THEN gr.visitor_id END) AS used_users,
            COUNT(DISTINCT CASE WHEN gr.redemption_type='grant' THEN gr.visitor_id END) AS grant_users
     FROM projects p
     JOIN gift_redemptions gr ON gr.project_id = p.id
     LEFT JOIN merchants m ON m.id = gr.merchant_id
     ${where}
     GROUP BY p.id, day, gr.merchant_id
     ORDER BY day DESC, p.project_name ASC, merchant_name ASC`,
    params,
  );

  res.json({ ok: true, data: Array.isArray(rows) ? rows : [] });
});

// ───── 정산 엑셀 다운로드 (3개: 프로젝트별 / 가맹점별 / 일별) ─────
const STT_STATUS_KO: Record<string, string> = { ready_to_start: "시작대기", started: "진행중", completed: "완료" };

function settleMetrics(r: any) {
  const giftAmt = Number(r.gift_amount || 0);
  const prizeAmt = Number(r.prize_amount || 0);
  const budget = Number(r.budget_amount || 0);
  const usedCnt = Number(r.used_count || 0);
  const grantCnt = Number(r.grant_count || 0);
  const usedTotal = Number(r.used_amount || 0);
  const grantTot = Number(r.grant_amount || 0);
  const giftUsed = giftAmt * usedCnt;
  const prizeUsed = Math.max(0, usedTotal - giftUsed);
  const prizeCnt = prizeAmt > 0 ? Math.round(prizeUsed / prizeAmt) : 0;
  const giftSum = giftUsed + grantTot;
  const totalReward = giftUsed + prizeUsed;
  return { giftAmt, prizeAmt, budget, usedCnt, grantCnt, giftUsed, grantTot, prizeUsed, prizeCnt, giftSum, totalReward };
}

function applyMoneyFmt(ws: ExcelJS.Worksheet, keys: string[]) {
  keys.forEach((key) => {
    const col = ws.getColumn(key);
    if (col) { col.numFmt = "#,##0"; col.alignment = { horizontal: "right" }; }
  });
}

async function sendXlsx(res: any, wb: ExcelJS.Workbook, baseName: string) {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(baseName)}.xlsx`);
  await wb.xlsx.write(res);
  res.end();
}

// 프로젝트별 (host)
router.get("/settlement/export", requireHost, async (req, res) => {
  const hostId = req.session.host!.id;
  const { project_name = "", status = "" } = req.query as Record<string, string>;
  let where = "WHERE p.host_id = ? AND p.status IN ('ready_to_start','started','completed')";
  const params: Array<string | number> = [hostId];
  if (project_name.trim()) { where += " AND p.project_name LIKE ?"; params.push(`%${project_name.trim()}%`); }
  if (["ready_to_start", "started", "completed"].includes(status)) { where += " AND p.status = ?"; params.push(status); }

  const [rows] = await pool.execute(
    `SELECT p.id, p.project_name, p.project_serial, p.status, p.gift_amount, p.prize_amount, p.budget_amount,
            (SELECT COUNT(*) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.redemption_type = 'normal') AS used_count,
            (SELECT COALESCE(SUM(gr.amount),0) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.redemption_type = 'normal') AS used_amount,
            (SELECT COUNT(*) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.redemption_type = 'grant') AS grant_count,
            (SELECT COALESCE(SUM(gr.amount),0) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.redemption_type = 'grant') AS grant_amount,
            (SELECT COUNT(DISTINCT gr.visitor_id) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.redemption_type = 'normal') AS used_users,
            (SELECT COUNT(DISTINCT gr.visitor_id) FROM gift_redemptions gr WHERE gr.project_id = p.id AND gr.redemption_type = 'grant') AS grant_users
     FROM projects p ${where}
     ORDER BY FIELD(p.status, 'started', 'ready_to_start', 'completed'), p.from_date DESC, p.id DESC`,
    params,
  );
  const list = Array.isArray(rows) ? (rows as any[]) : [];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("정산-프로젝트별");
  ws.columns = [
    { header: "프로젝트명", key: "name", width: 26 },
    { header: "일련번호", key: "serial", width: 16 },
    { header: "상태", key: "status", width: 10 },
    { header: "Gift 단가(X)", key: "giftAmt", width: 14 },
    { header: "Gift 사용개수(Y)", key: "usedCnt", width: 14 },
    { header: "Gift 증정개수(Z)", key: "grantCnt", width: 14 },
    { header: "Gift 사용금액(a=X×Y)", key: "giftUsed", width: 18 },
    { header: "Gift 증정금액(b=X×Z)", key: "grantTot", width: 18 },
    { header: "Gift 합계(c=a+b)", key: "giftSum", width: 16 },
    { header: "Quiz 단가(a)", key: "prizeAmt", width: 14 },
    { header: "Quiz 지급개수(b)", key: "prizeCnt", width: 14 },
    { header: "Quiz 사용금액(c=a×b)", key: "prizeUsed", width: 18 },
    { header: "총 Reward 금액", key: "totalReward", width: 16 },
    { header: "예산", key: "budget", width: 14 },
    { header: "사용자(사용/증정)", key: "users", width: 16 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  for (const p of list) {
    const m = settleMetrics(p);
    ws.addRow({
      name: p.project_name,
      serial: p.project_serial,
      status: STT_STATUS_KO[p.status as string] ?? p.status,
      giftAmt: m.giftAmt, usedCnt: m.usedCnt, grantCnt: m.grantCnt,
      giftUsed: m.giftUsed, grantTot: m.grantTot, giftSum: m.giftSum,
      prizeAmt: m.prizeAmt, prizeCnt: m.prizeCnt, prizeUsed: m.prizeUsed,
      totalReward: m.totalReward, budget: m.budget,
      users: `${Number(p.used_users || 0)} / ${Number(p.grant_users || 0)}`,
    });
  }
  applyMoneyFmt(ws, ["giftAmt", "giftUsed", "grantTot", "giftSum", "prizeAmt", "prizeUsed", "totalReward", "budget"]);
  await sendXlsx(res, wb, "정산-프로젝트별");
});

// 가맹점별 (host)
router.get("/settlement/by-merchant/export", requireHost, async (req, res) => {
  const hostId = req.session.host!.id;
  const { project_name = "", status = "" } = req.query as Record<string, string>;
  const k = encKey();
  let where = "WHERE p.host_id = ? AND p.status IN ('ready_to_start','started','completed')";
  const params: Array<string | number> = [k, hostId];
  if (project_name.trim()) { where += " AND p.project_name LIKE ?"; params.push(`%${project_name.trim()}%`); }
  if (["ready_to_start", "started", "completed"].includes(status)) { where += " AND p.status = ?"; params.push(status); }

  const [rows] = await pool.execute(
    `SELECT p.id AS project_id, p.project_name, p.project_serial, p.status,
            p.gift_amount, p.prize_amount, p.budget_amount,
            gr.merchant_id,
            COALESCE(fn_decrypt(m.merchant_name, ?), '(미기록)') AS merchant_name,
            SUM(CASE WHEN gr.redemption_type='normal' THEN 1 ELSE 0 END) AS used_count,
            SUM(CASE WHEN gr.redemption_type='normal' THEN gr.amount ELSE 0 END) AS used_amount,
            SUM(CASE WHEN gr.redemption_type='grant' THEN 1 ELSE 0 END) AS grant_count,
            SUM(CASE WHEN gr.redemption_type='grant' THEN gr.amount ELSE 0 END) AS grant_amount,
            COUNT(DISTINCT CASE WHEN gr.redemption_type='normal' THEN gr.visitor_id END) AS used_users,
            COUNT(DISTINCT CASE WHEN gr.redemption_type='grant' THEN gr.visitor_id END) AS grant_users
     FROM projects p
     JOIN gift_redemptions gr ON gr.project_id = p.id
     LEFT JOIN merchants m ON m.id = gr.merchant_id
     ${where}
     GROUP BY p.id, gr.merchant_id
     ORDER BY FIELD(p.status, 'started', 'ready_to_start', 'completed'), p.from_date DESC, p.id DESC, merchant_name ASC`,
    params,
  );
  const list = Array.isArray(rows) ? (rows as any[]) : [];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("정산-가맹점별");
  ws.columns = [
    { header: "프로젝트명", key: "name", width: 26 },
    { header: "일련번호", key: "serial", width: 16 },
    { header: "상태", key: "status", width: 10 },
    { header: "가맹점명", key: "merchant", width: 22 },
    { header: "Gift 단가(X)", key: "giftAmt", width: 14 },
    { header: "Gift 사용(Y)", key: "usedCnt", width: 12 },
    { header: "Gift 증정(Z)", key: "grantCnt", width: 12 },
    { header: "Gift 사용금액(a=X×Y)", key: "giftUsed", width: 18 },
    { header: "Gift 증정금액(b=X×Z)", key: "grantTot", width: 18 },
    { header: "Gift 합계(c=a+b)", key: "giftSum", width: 16 },
    { header: "Quiz 단가(a)", key: "prizeAmt", width: 14 },
    { header: "Quiz 지급(b)", key: "prizeCnt", width: 12 },
    { header: "Quiz 사용금액(c=a×b)", key: "prizeUsed", width: 18 },
    { header: "총 Reward 금액", key: "totalReward", width: 16 },
    { header: "사용자(사용/증정)", key: "users", width: 16 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  for (const p of list) {
    const m = settleMetrics(p);
    ws.addRow({
      name: p.project_name, serial: p.project_serial,
      status: STT_STATUS_KO[p.status as string] ?? p.status,
      merchant: p.merchant_name || "(미기록)",
      giftAmt: m.giftAmt, usedCnt: m.usedCnt, grantCnt: m.grantCnt,
      giftUsed: m.giftUsed, grantTot: m.grantTot, giftSum: m.giftSum,
      prizeAmt: m.prizeAmt, prizeCnt: m.prizeCnt, prizeUsed: m.prizeUsed,
      totalReward: m.totalReward,
      users: `${Number(p.used_users || 0)} / ${Number(p.grant_users || 0)}`,
    });
  }
  applyMoneyFmt(ws, ["giftAmt", "giftUsed", "grantTot", "giftSum", "prizeAmt", "prizeUsed", "totalReward"]);
  await sendXlsx(res, wb, "정산-가맹점별");
});

// 일별 (host) — 프로젝트 × 일자 × 가맹점
router.get("/settlement/by-day/export", requireHost, async (req, res) => {
  const hostId = req.session.host!.id;
  const { project_name = "", status = "" } = req.query as Record<string, string>;
  const k = encKey();
  let where = "WHERE p.host_id = ? AND p.status IN ('ready_to_start','started','completed')";
  const params: Array<string | number> = [k, hostId];
  if (project_name.trim()) { where += " AND p.project_name LIKE ?"; params.push(`%${project_name.trim()}%`); }
  if (["ready_to_start", "started", "completed"].includes(status)) { where += " AND p.status = ?"; params.push(status); }

  const [rows] = await pool.execute(
    `SELECT p.id AS project_id, p.project_name, p.project_serial, p.status,
            p.gift_amount, p.prize_amount, p.budget_amount,
            DATE(gr.redeemed_at) AS day,
            gr.merchant_id,
            COALESCE(fn_decrypt(m.merchant_name, ?), '(미기록)') AS merchant_name,
            SUM(CASE WHEN gr.redemption_type='normal' THEN 1 ELSE 0 END) AS used_count,
            SUM(CASE WHEN gr.redemption_type='normal' THEN gr.amount ELSE 0 END) AS used_amount,
            SUM(CASE WHEN gr.redemption_type='grant' THEN 1 ELSE 0 END) AS grant_count,
            SUM(CASE WHEN gr.redemption_type='grant' THEN gr.amount ELSE 0 END) AS grant_amount,
            COUNT(DISTINCT CASE WHEN gr.redemption_type='normal' THEN gr.visitor_id END) AS used_users,
            COUNT(DISTINCT CASE WHEN gr.redemption_type='grant' THEN gr.visitor_id END) AS grant_users
     FROM projects p
     JOIN gift_redemptions gr ON gr.project_id = p.id
     LEFT JOIN merchants m ON m.id = gr.merchant_id
     ${where}
     GROUP BY p.id, day, gr.merchant_id
     ORDER BY day DESC, p.project_name ASC, merchant_name ASC`,
    params,
  );
  const list = Array.isArray(rows) ? (rows as any[]) : [];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("정산-일별");
  ws.columns = [
    { header: "일자", key: "day", width: 12 },
    { header: "프로젝트명", key: "name", width: 26 },
    { header: "일련번호", key: "serial", width: 16 },
    { header: "가맹점명", key: "merchant", width: 22 },
    { header: "상태", key: "status", width: 10 },
    { header: "Gift 단가(X)", key: "giftAmt", width: 14 },
    { header: "Gift 사용(Y)", key: "usedCnt", width: 12 },
    { header: "Gift 증정(Z)", key: "grantCnt", width: 12 },
    { header: "Gift 사용금액(a=X×Y)", key: "giftUsed", width: 18 },
    { header: "Gift 증정금액(b=X×Z)", key: "grantTot", width: 18 },
    { header: "Gift 합계(c=a+b)", key: "giftSum", width: 16 },
    { header: "Quiz 단가(a)", key: "prizeAmt", width: 14 },
    { header: "Quiz 지급(b)", key: "prizeCnt", width: 12 },
    { header: "Quiz 사용금액(c=a×b)", key: "prizeUsed", width: 18 },
    { header: "총 Reward 금액", key: "totalReward", width: 16 },
    { header: "사용자(사용/증정)", key: "users", width: 16 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  for (const p of list) {
    const m = settleMetrics(p);
    ws.addRow({
      day: p.day ? String(p.day).slice(0, 10) : "",
      merchant: p.merchant_name || "(미기록)",
      name: p.project_name, serial: p.project_serial,
      status: STT_STATUS_KO[p.status as string] ?? p.status,
      giftAmt: m.giftAmt, usedCnt: m.usedCnt, grantCnt: m.grantCnt,
      giftUsed: m.giftUsed, grantTot: m.grantTot, giftSum: m.giftSum,
      prizeAmt: m.prizeAmt, prizeCnt: m.prizeCnt, prizeUsed: m.prizeUsed,
      totalReward: m.totalReward,
      users: `${Number(p.used_users || 0)} / ${Number(p.grant_users || 0)}`,
    });
  }
  applyMoneyFmt(ws, ["giftAmt", "giftUsed", "grantTot", "giftSum", "prizeAmt", "prizeUsed", "totalReward"]);
  await sendXlsx(res, wb, "정산-일별");
});

// ── 정산: 특정 프로젝트의 일별 정산 내역 (상세보기 팝업) ──
router.get("/settlement/:projectId/daily", requireHost, async (req, res) => {
  const hostId = req.session.host!.id;
  const projectId = Number(req.params.projectId);

  const [projRows] = await pool.execute(
    `SELECT id, project_name, project_serial, gift_amount, prize_amount, budget_amount, status
       FROM projects WHERE id = ? AND host_id = ?`,
    [projectId, hostId],
  );
  if (!Array.isArray(projRows) || projRows.length === 0) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }
  const proj = (projRows as any)[0];

  const [dailyRows] = await pool.execute(
    `SELECT DATE(redeemed_at) AS d,
            SUM(CASE WHEN redemption_type='normal' THEN 1 ELSE 0 END) AS used_count,
            SUM(CASE WHEN redemption_type='normal' THEN amount ELSE 0 END) AS used_amount,
            SUM(CASE WHEN redemption_type='grant' THEN 1 ELSE 0 END) AS grant_count,
            SUM(CASE WHEN redemption_type='grant' THEN amount ELSE 0 END) AS grant_amount
       FROM gift_redemptions
      WHERE project_id = ?
      GROUP BY DATE(redeemed_at)
      ORDER BY d ASC`,
    [projectId],
  );

  res.json({
    ok: true,
    project: {
      id: proj.id,
      name: proj.project_name,
      serial: proj.project_serial,
      gift_amount: Number(proj.gift_amount || 0),
      prize_amount: Number(proj.prize_amount || 0),
      budget_amount: Number(proj.budget_amount || 0),
      status: proj.status,
    },
    daily: (Array.isArray(dailyRows) ? dailyRows : []).map((r: any) => ({
      date: r.d,
      used_count: Number(r.used_count || 0),
      used_amount: Number(r.used_amount || 0),
      grant_count: Number(r.grant_count || 0),
      grant_amount: Number(r.grant_amount || 0),
    })),
  });
});

// ── 정산: 특정 프로젝트의 Gift 사용/증정 상세내역 ──
router.get("/settlement/:projectId/usage", requireHost, async (req, res) => {
  const hostId = req.session.host!.id;
  const projectId = Number(req.params.projectId);

  const [visRows] = await pool.execute(
    "SELECT id, project_name, project_serial FROM projects WHERE id = ? AND host_id = ?",
    [projectId, hostId],
  );
  const project = (Array.isArray(visRows) ? visRows[0] : null) as any;
  if (!project) { res.status(404).json({ error: "project_not_found" }); return; }

  const [rows] = await pool.execute(
    `SELECT v.phone, gr.redemption_type, gr.amount, gr.redeemed_at
     FROM gift_redemptions gr
     JOIN visitors v ON v.id = gr.visitor_id
     WHERE gr.project_id = ?
     ORDER BY gr.redeemed_at DESC, gr.id DESC`,
    [projectId],
  );

  res.json({
    ok: true,
    project_name: project.project_name,
    project_serial: project.project_serial,
    data: Array.isArray(rows) ? rows : [],
  });
});

export default router;
