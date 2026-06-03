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
       (host_id, project_name, project_serial, description, from_date, to_date, gift_amount, gift_qty, prize_amount, prize_qty, budget_amount, pin_hash, pin_enc, status, quote_days, quote_amount, quote_sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${ENC}, 'quoted', ?, ?, NOW())`,
      [host.id, project_name, serial, description, from_date, to_date, giftAmountNum, giftQtyNum, prizeAmountNum, prizeQtyNum, budgetAmount, pinHash, pin_input, encKey(), quote.days, quote.total],
    );

    const projectId = Number((insertResult as any).insertId);

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
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
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
    if (!locationName || !kakaoLat || !kakaoLng || !locationDesc) {
      res.status(400).json({ error: "장소·좌표·설명을 모두 입력해 주세요." });
      return;
    }
    if (locationDesc.length > 50) {
      res.status(400).json({ error: "위치설명은 50자 이내여야 합니다." });
      return;
    }
  } else {
    if (!locationName) {
      res.status(400).json({ error: "전시물 설명을 입력해 주세요." });
      return;
    }
    if (locationName.length > 100) {
      res.status(400).json({ error: "전시물 설명은 100자 이내여야 합니다." });
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

router.put("/projects/:projectId/locations/:locationId", requireHost, async (req, res) => {
  const host = req.session.host!;
  const projectId = Number(req.params.projectId);
  const locationId = Number(req.params.locationId);
  const { location_name, kakao_lat, kakao_lng, location_desc, pin_input } = req.body as Record<string, string>;

  const [projectRows] = await pool.execute("SELECT pin_hash FROM projects WHERE id = ? AND host_id = ?", [projectId, host.id]);
  if (!Array.isArray(projectRows) || projectRows.length === 0) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }

  const pinHash = String((projectRows as any)[0].pin_hash);
  const pinOk = await verifyPin(pin_input ?? "", pinHash);
  if (!pinOk) {
    res.status(400).json({ error: "비밀전호가 일치하지 않습니다" });
    return;
  }

  await pool.execute(
    `UPDATE project_locations
     SET location_name = ?, kakao_lat = ?, kakao_lng = ?, location_desc = ?, updated_at = NOW()
     WHERE id = ? AND project_id = ?`,
    [location_name, Number(kakao_lat), Number(kakao_lng), location_desc, locationId, projectId],
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

  res.json({
    ok: true,
    data,
    status: project.status,
    started: project.status === "started",
    qr_ready: qrReady,
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
  const [quizRows] = await pool.execute(
    `SELECT id, question, choice_type, display_seq, disabled, created_at
     FROM project_quizzes
     WHERE project_id = ? AND disabled = 0
     ORDER BY display_seq ASC, id ASC`,
    [projectId],
  );
  const quizzes = (Array.isArray(quizRows) ? quizRows : []) as any[];

  let choicesByQuiz: Record<number, any[]> = {};
  if (quizzes.length) {
    const ids = quizzes.map((q) => q.id);
    const [choiceRows] = await pool.query(
      `SELECT id, quiz_id, choice_text, is_correct, display_seq
       FROM project_quiz_choices
       WHERE quiz_id IN (?)
       ORDER BY quiz_id ASC, display_seq ASC, id ASC`,
      [ids],
    );
    for (const c of (Array.isArray(choiceRows) ? choiceRows : []) as any[]) {
      (choicesByQuiz[c.quiz_id] ??= []).push({
        id: c.id,
        text: c.choice_text,
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
      choice_type: q.choice_type,
      display_seq: q.display_seq,
      created_at: q.created_at,
      choices: choicesByQuiz[q.id] ?? [],
    })),
  });
});

router.post("/projects/:id/quizzes", requireHost, async (req, res) => {
  const host = req.session.host!;
  const projectId = Number(req.params.id);
  const { question, choice_type, choices } = req.body as {
    question?: string;
    choice_type?: "single" | "multi";
    choices?: Array<{ text: string; is_correct: boolean }>;
  };

  if (!(await ensureHostOwnsProject(projectId, host.id))) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }
  if (!question || !question.trim()) {
    res.status(400).json({ error: "질문을 입력해 주세요." });
    return;
  }
  if (question.length > 500) {
    res.status(400).json({ error: "질문은 500자 이내여야 합니다." });
    return;
  }
  if (choice_type !== "single" && choice_type !== "multi") {
    res.status(400).json({ error: "선택 유형은 single 또는 multi 여야 합니다." });
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
  if (choice_type === "single" && correctCount !== 1) {
    res.status(400).json({ error: "단일 선택은 정답이 정확히 1개여야 합니다." });
    return;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [seqRows] = await connection.execute(
      "SELECT COALESCE(MAX(display_seq), 0) + 1 AS next_seq FROM project_quizzes WHERE project_id = ?",
      [projectId],
    );
    const nextSeq = Number((seqRows as any)[0].next_seq);

    const [insertResult] = await connection.execute(
      `INSERT INTO project_quizzes (project_id, question, choice_type, display_seq)
       VALUES (?, ?, ?, ?)`,
      [projectId, question.trim(), choice_type, nextSeq],
    );
    const quizId = Number((insertResult as any).insertId);

    for (let i = 0; i < cleanChoices.length; i++) {
      const c = cleanChoices[i];
      await connection.execute(
        `INSERT INTO project_quiz_choices (quiz_id, choice_text, is_correct, display_seq)
         VALUES (?, ?, ?, ?)`,
        [quizId, c.text, c.is_correct ? 1 : 0, i + 1],
      );
    }

    await connection.commit();
    res.json({ ok: true, id: quizId });
  } catch (e) {
    await connection.rollback();
    res.status(500).json({ error: "퀴즈 등록에 실패했습니다." });
  } finally {
    connection.release();
  }
});

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
    `SELECT p.id, p.project_name, p.project_serial, p.status, p.gift_amount,
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
