// ============================================================
//  설문조사 (Survey) — host 설정 + 공개 응답
// ============================================================
import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import multer from "multer";
import QRCode from "qrcode";
import pool from "../config/database";

const router = Router();

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads", "survey-images");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const REWARD_IMG_DIR = path.resolve(process.cwd(), "uploads", "survey-reward-images");
if (!fs.existsSync(REWARD_IMG_DIR)) fs.mkdirSync(REWARD_IMG_DIR, { recursive: true });
const QR_DIR = path.resolve(process.cwd(), "uploads", "survey-qr");
if (!fs.existsSync(QR_DIR)) fs.mkdirSync(QR_DIR, { recursive: true });

function makeUploader(dir: string) {
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, dir),
      filename: (_req, file, cb) => {
        const id = crypto.randomBytes(8).toString("hex");
        const ext = (path.extname(file.originalname) || ".png").toLowerCase();
        cb(null, `${Date.now()}_${id}${ext}`);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (/^image\//.test(file.mimetype)) cb(null, true);
      else cb(new Error("invalid_file_type"));
    },
  });
}
const upload = makeUploader(UPLOAD_DIR);
const rewardUpload = makeUploader(REWARD_IMG_DIR);

function toUploadUrl(p?: string | null): string | null {
  if (!p) return null;
  const base = path.resolve(process.cwd(), "uploads");
  const rel = path.relative(base, p).replace(/\\/g, "/");
  return `/uploads/${rel}`;
}

function requireHost(req: any, res: any, next: any) {
  if (!req.session?.host) { res.status(401).json({ ok: false, error: "unauthorized" }); return; }
  next();
}

async function ensureHostOwnsProject(projectId: number, hostId: number): Promise<boolean> {
  const [rows] = await pool.execute(
    `SELECT id FROM projects WHERE id = ? AND host_id = ?`, [projectId, hostId],
  );
  return Array.isArray(rows) && rows.length > 0;
}

// ============================================================
// (Host) 설문 카탈로그 (질문 정의 + 응답자 필드 정의)
// ============================================================
router.get("/question-definitions", requireHost, async (_req, res) => {
  const [rows] = await pool.execute(
    `SELECT id, question_key, label_ko, input_type, choice_type, options_json, category, sort_order
     FROM survey_question_definitions WHERE disabled = 0
     ORDER BY sort_order ASC, id ASC`,
  );
  const data = (Array.isArray(rows) ? rows : []).map((r: any) => ({
    ...r,
    options: r.options_json ? safeJSON(r.options_json, []) : [],
  }));
  res.json({ ok: true, data });
});

function safeJSON<T>(s: string, fallback: T): T {
  try { return JSON.parse(s); } catch { return fallback; }
}

// ============================================================
// (Host) 프로젝트 설문 설정 조회
// ============================================================
router.get("/projects/:id/survey-config", requireHost, async (req, res) => {
  const host = (req.session as any).host;
  const projectId = Number(req.params.id);
  if (!(await ensureHostOwnsProject(projectId, host.id))) {
    res.status(404).json({ ok: false, error: "project_not_found" }); return;
  }
  const [pRows] = await pool.execute(
    `SELECT id, project_name, project_serial, status, from_date, to_date, survey_use FROM projects WHERE id = ?`,
    [projectId],
  );
  const proj = (Array.isArray(pRows) ? pRows[0] : null) as any;
  if (!proj) { res.status(404).json({ ok: false }); return; }

  const [sRows] = await pool.execute(
    `SELECT id, title, description, image_path, status, allow_anonymous,
            require_pre_registration, thank_you_message,
            reward_label, reward_amount, reward_qty, reward_message, reward_image_path
     FROM project_surveys WHERE project_id = ?`, [projectId],
  );
  const survey = (Array.isArray(sRows) ? sRows[0] : null) as any;

  const [qRows] = await pool.execute(
    `SELECT q.id, q.question_def_id, q.custom_label, q.custom_input_type, q.custom_choice_type,
            q.custom_options_json, q.is_required, q.sort_order,
            d.label_ko AS def_label, d.input_type AS def_input_type,
            d.choice_type AS def_choice_type, d.options_json AS def_options_json
     FROM project_survey_questions q
     LEFT JOIN survey_question_definitions d ON d.id = q.question_def_id
     WHERE q.project_id = ?
     ORDER BY q.sort_order ASC, q.id ASC`, [projectId],
  );
  const questions = (Array.isArray(qRows) ? qRows : []).map((r: any) => ({
    id: r.id,
    question_def_id: r.question_def_id,
    label:        r.question_def_id ? r.def_label       : r.custom_label,
    input_type:   r.question_def_id ? r.def_input_type  : r.custom_input_type,
    choice_type:  r.question_def_id ? r.def_choice_type : r.custom_choice_type,
    options:      safeJSON(r.question_def_id ? r.def_options_json : r.custom_options_json, []),
    is_required:  Number(r.is_required) === 1,
    sort_order:   Number(r.sort_order),
  }));

  const [fRows] = await pool.execute(
    `SELECT rf.field_id, rf.is_required, rf.sort_order,
            fd.field_key, fd.label_ko, fd.input_type, fd.options_json, fd.placeholder
     FROM project_survey_respondent_fields rf
     JOIN field_definitions fd ON fd.id = rf.field_id
     WHERE rf.project_id = ?
     ORDER BY rf.sort_order ASC, rf.field_id ASC`, [projectId],
  );
  const respondent_fields = (Array.isArray(fRows) ? fRows : []).map((r: any) => ({
    field_id: r.field_id, field_key: r.field_key, label_ko: r.label_ko,
    input_type: r.input_type, placeholder: r.placeholder,
    options: r.options_json ? safeJSON(r.options_json, []) : [],
    is_required: Number(r.is_required) === 1,
    sort_order: Number(r.sort_order),
  }));

  res.json({
    ok: true,
    project: { id: proj.id, name: proj.project_name, serial: proj.project_serial,
               status: proj.status, from_date: proj.from_date, to_date: proj.to_date,
               survey_use: Number(proj.survey_use) === 1 },
    survey: survey ? {
      ...survey,
      image_url: toUploadUrl(survey.image_path),
      reward_image_url: toUploadUrl(survey.reward_image_path),
      reward_amount: Number(survey.reward_amount || 0),
      reward_qty: Number(survey.reward_qty || 0),
      allow_anonymous: Number(survey.allow_anonymous) === 1,
      require_pre_registration: Number(survey.require_pre_registration) === 1,
    } : null,
    questions,
    respondent_fields,
  });
});

// ============================================================
// (Host) 프로젝트 설문 설정 저장 (overwrite)
// ============================================================
router.put("/projects/:id/survey-config", requireHost, async (req, res) => {
  const host = (req.session as any).host;
  const projectId = Number(req.params.id);
  if (!(await ensureHostOwnsProject(projectId, host.id))) {
    res.status(404).json({ ok: false, error: "project_not_found" }); return;
  }
  const body = req.body || {};
  const title = String(body.title || "").trim().slice(0, 200);
  if (!title) { res.status(400).json({ ok: false, error: "title_required" }); return; }
  const description = String(body.description || "").trim().slice(0, 2000) || null;
  const status = ["draft", "published", "closed"].includes(String(body.status)) ? String(body.status) : "draft";
  const allowAnon = body.allow_anonymous === false ? 0 : 1;
  const reqPre    = body.require_pre_registration ? 1 : 0;
  const thankYou  = String(body.thank_you_message || "").trim().slice(0, 500) || null;
  const imagePath = body.image_path ? String(body.image_path) : undefined; // keep existing if undefined
  // 경품 (보상) 정보
  const rewardLabel   = String(body.reward_label || "").trim().slice(0, 120) || null;
  const rewardAmount  = Math.max(0, Math.floor(Number(body.reward_amount || 0)));
  const rewardQty     = Math.max(0, Math.floor(Number(body.reward_qty || 0)));
  const rewardMessage = String(body.reward_message || "").trim().slice(0, 200) || null;

  // upsert project_surveys
  const [exist] = await pool.execute(`SELECT id, image_path FROM project_surveys WHERE project_id = ?`, [projectId]);
  const existing = (Array.isArray(exist) ? exist[0] : null) as any;
  if (existing) {
    await pool.execute(
      `UPDATE project_surveys SET title=?, description=?, image_path=COALESCE(?, image_path),
        status=?, allow_anonymous=?, require_pre_registration=?, thank_you_message=?,
        reward_label=?, reward_amount=?, reward_qty=?, reward_message=?,
        updated_at=NOW()
       WHERE project_id = ?`,
      [title, description, imagePath ?? null, status, allowAnon, reqPre, thankYou,
       rewardLabel, rewardAmount, rewardQty, rewardMessage, projectId],
    );
  } else {
    await pool.execute(
      `INSERT INTO project_surveys (project_id, title, description, image_path, status, allow_anonymous, require_pre_registration, thank_you_message, reward_label, reward_amount, reward_qty, reward_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [projectId, title, description, imagePath ?? null, status, allowAnon, reqPre, thankYou,
       rewardLabel, rewardAmount, rewardQty, rewardMessage],
    );
  }

  // questions overwrite
  const incomingQ = Array.isArray(body.questions) ? body.questions : [];
  await pool.execute(`DELETE FROM project_survey_questions WHERE project_id = ?`, [projectId]);
  let order = 0;
  for (const q of incomingQ) {
    const defId = q.question_def_id ? Number(q.question_def_id) : null;
    if (defId) {
      await pool.execute(
        `INSERT INTO project_survey_questions (project_id, question_def_id, is_required, sort_order) VALUES (?, ?, ?, ?)`,
        [projectId, defId, q.is_required ? 1 : 0, order * 10],
      );
    } else {
      // 커스텀
      const label = String(q.custom_label || q.label || "").trim().slice(0, 200);
      if (!label) { order++; continue; }
      const itype = ["text","textarea","choice","rating","yesno"].includes(String(q.custom_input_type || q.input_type))
        ? String(q.custom_input_type || q.input_type) : "text";
      const ctype = ["single","multi"].includes(String(q.custom_choice_type || q.choice_type))
        ? String(q.custom_choice_type || q.choice_type) : null;
      const opts = Array.isArray(q.options) ? q.options : (Array.isArray(q.custom_options) ? q.custom_options : []);
      await pool.execute(
        `INSERT INTO project_survey_questions (project_id, custom_label, custom_input_type, custom_choice_type, custom_options_json, is_required, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [projectId, label, itype, ctype, opts.length ? JSON.stringify(opts) : null, q.is_required ? 1 : 0, order * 10],
      );
    }
    order++;
  }

  // respondent_fields overwrite
  const incomingRF = Array.isArray(body.respondent_fields) ? body.respondent_fields : [];
  await pool.execute(`DELETE FROM project_survey_respondent_fields WHERE project_id = ?`, [projectId]);
  let rfOrder = 0;
  for (const f of incomingRF) {
    const fid = Number(f.field_id);
    if (!fid) continue;
    await pool.execute(
      `INSERT IGNORE INTO project_survey_respondent_fields (project_id, field_id, is_required, sort_order)
       VALUES (?, ?, ?, ?)`,
      [projectId, fid, f.is_required ? 1 : 0, rfOrder * 10],
    );
    rfOrder++;
  }

  res.json({ ok: true, saved_questions: order, saved_respondent_fields: rfOrder });
});

// ============================================================
// (Host) 설문 이미지 업로드
// ============================================================
router.post("/projects/:id/survey-image", requireHost, upload.single("image"), async (req, res) => {
  const host = (req.session as any).host;
  const projectId = Number(req.params.id);
  if (!(await ensureHostOwnsProject(projectId, host.id))) {
    res.status(404).json({ ok: false, error: "project_not_found" }); return;
  }
  const file = (req as any).file;
  if (!file) { res.status(400).json({ ok: false, error: "no_file" }); return; }
  await pool.execute(
    `INSERT INTO project_surveys (project_id, title, image_path) VALUES (?, '', ?)
     ON DUPLICATE KEY UPDATE image_path=VALUES(image_path), updated_at=NOW()`,
    [projectId, file.path],
  );
  res.json({ ok: true, image_path: file.path, image_url: toUploadUrl(file.path) });
});

router.delete("/projects/:id/survey-image", requireHost, async (req, res) => {
  const host = (req.session as any).host;
  const projectId = Number(req.params.id);
  if (!(await ensureHostOwnsProject(projectId, host.id))) {
    res.status(404).json({ ok: false, error: "project_not_found" }); return;
  }
  const [rows] = await pool.execute(`SELECT image_path FROM project_surveys WHERE project_id = ?`, [projectId]);
  const row = (Array.isArray(rows) ? rows[0] : null) as any;
  if (row?.image_path) { try { fs.unlinkSync(row.image_path); } catch (_) {} }
  await pool.execute(`UPDATE project_surveys SET image_path=NULL, updated_at=NOW() WHERE project_id = ?`, [projectId]);
  res.json({ ok: true });
});

// ============================================================
// (Host) 경품 이미지 업로드 / 삭제
// ============================================================
router.post("/projects/:id/survey-reward-image", requireHost, rewardUpload.single("image"), async (req, res) => {
  const host = (req.session as any).host;
  const projectId = Number(req.params.id);
  if (!(await ensureHostOwnsProject(projectId, host.id))) {
    res.status(404).json({ ok: false, error: "project_not_found" }); return;
  }
  const file = (req as any).file;
  if (!file) { res.status(400).json({ ok: false, error: "no_file" }); return; }
  // 기존 이미지 삭제
  const [old] = await pool.execute(`SELECT reward_image_path FROM project_surveys WHERE project_id = ?`, [projectId]);
  const oldRow = (Array.isArray(old) ? old[0] : null) as any;
  if (oldRow?.reward_image_path) { try { fs.unlinkSync(oldRow.reward_image_path); } catch (_) {} }
  await pool.execute(
    `INSERT INTO project_surveys (project_id, title, reward_image_path) VALUES (?, '', ?)
     ON DUPLICATE KEY UPDATE reward_image_path=VALUES(reward_image_path), updated_at=NOW()`,
    [projectId, file.path],
  );
  res.json({ ok: true, image_path: file.path, image_url: toUploadUrl(file.path) });
});

router.delete("/projects/:id/survey-reward-image", requireHost, async (req, res) => {
  const host = (req.session as any).host;
  const projectId = Number(req.params.id);
  if (!(await ensureHostOwnsProject(projectId, host.id))) {
    res.status(404).json({ ok: false, error: "project_not_found" }); return;
  }
  const [rows] = await pool.execute(`SELECT reward_image_path FROM project_surveys WHERE project_id = ?`, [projectId]);
  const row = (Array.isArray(rows) ? rows[0] : null) as any;
  if (row?.reward_image_path) { try { fs.unlinkSync(row.reward_image_path); } catch (_) {} }
  await pool.execute(`UPDATE project_surveys SET reward_image_path=NULL, updated_at=NOW() WHERE project_id = ?`, [projectId]);
  res.json({ ok: true });
});

// ============================================================
// (Host) 설문 응답 목록
// ============================================================
router.get("/projects/:id/survey-responses", requireHost, async (req, res) => {
  const host = (req.session as any).host;
  const projectId = Number(req.params.id);
  if (!(await ensureHostOwnsProject(projectId, host.id))) {
    res.status(404).json({ ok: false, error: "project_not_found" }); return;
  }
  const [rows] = await pool.execute(
    `SELECT r.id, r.reservation_id, r.respondent_email, r.respondent_fields_json,
            r.answers_json, r.submitted_at,
            r.qr_token, r.qr_image_path, r.reward_used_at,
            rv.email_lower AS resv_email, rv.fields_json AS resv_fields, rv.mode AS resv_mode
     FROM survey_responses r
     LEFT JOIN reservations rv ON rv.id = r.reservation_id
     WHERE r.project_id = ?
     ORDER BY r.submitted_at DESC`, [projectId],
  );
  const data = (Array.isArray(rows) ? rows : []).map((r: any) => ({
    id: r.id,
    reservation_id: r.reservation_id,
    is_registered: !!r.reservation_id,
    respondent_email: r.respondent_email || r.resv_email,
    respondent_fields: r.respondent_fields_json ? safeJSON(r.respondent_fields_json, {}) : {},
    reservation_fields: r.resv_fields ? safeJSON(r.resv_fields, {}) : null,
    reservation_mode: r.resv_mode,
    answers: r.answers_json ? safeJSON(r.answers_json, {}) : {},
    submitted_at: r.submitted_at,
    qr_token: r.qr_token,
    qr_image_url: r.qr_image_path ? `/uploads/survey-qr/${path.basename(String(r.qr_image_path))}` : null,
    reward_used_at: r.reward_used_at,
  }));
  res.json({ ok: true, data, count: data.length });
});

// ============================================================
// (Public) 설문 공개 조회 — visitor 접속 시
// ============================================================
router.get("/public/projects/:serial/survey", async (req, res) => {
  const serial = String(req.params.serial || "");
  const resvToken = String(req.query.resv || "");
  const [pRows] = await pool.execute(
    `SELECT id, project_name, project_serial, status, survey_use FROM projects WHERE project_serial = ?`, [serial],
  );
  const proj = (Array.isArray(pRows) ? pRows[0] : null) as any;
  if (!proj) { res.status(404).json({ ok: false, error: "project_not_found" }); return; }
  if (Number(proj.survey_use) !== 1) {
    res.status(403).json({ ok: false, error: "survey_disabled", message: "이 프로젝트는 설문조사를 사용하지 않습니다." });
    return;
  }
  const [sRows] = await pool.execute(
    `SELECT title, description, image_path, status, allow_anonymous, require_pre_registration, thank_you_message,
            reward_label, reward_amount, reward_qty, reward_message, reward_image_path
     FROM project_surveys WHERE project_id = ?`, [proj.id],
  );
  const survey = (Array.isArray(sRows) ? sRows[0] : null) as any;
  if (!survey || survey.status !== "published") {
    res.status(403).json({ ok: false, error: "survey_not_published", message: "현재 응답 가능한 설문이 없습니다." });
    return;
  }

  // reservation 매칭 — resv 토큰이 있으면 등록자로 인식
  let reservation: any = null;
  if (resvToken) {
    const [rRows] = await pool.execute(
      `SELECT id, mode, fields_json FROM reservations WHERE project_id = ? AND token = ?`, [proj.id, resvToken],
    );
    reservation = Array.isArray(rRows) ? rRows[0] : null;
  }

  // 등록자 강제 옵션인데 reservation 없으면 차단
  if (!reservation && Number(survey.require_pre_registration) === 1) {
    res.status(403).json({ ok: false, error: "require_pre_registration",
      message: "이 설문은 사전·현장등록 완료한 분만 응답할 수 있습니다." });
    return;
  }
  if (!reservation && Number(survey.allow_anonymous) !== 1) {
    res.status(403).json({ ok: false, error: "anonymous_disabled" });
    return;
  }

  const [qRows] = await pool.execute(
    `SELECT q.id, q.question_def_id, q.custom_label, q.custom_input_type, q.custom_choice_type,
            q.custom_options_json, q.is_required, q.sort_order,
            d.label_ko AS def_label, d.input_type AS def_input_type,
            d.choice_type AS def_choice_type, d.options_json AS def_options_json
     FROM project_survey_questions q
     LEFT JOIN survey_question_definitions d ON d.id = q.question_def_id
     WHERE q.project_id = ?
     ORDER BY q.sort_order ASC, q.id ASC`, [proj.id],
  );
  const questions = (Array.isArray(qRows) ? qRows : []).map((r: any) => ({
    id: r.id,
    label:       r.question_def_id ? r.def_label       : r.custom_label,
    input_type:  r.question_def_id ? r.def_input_type  : r.custom_input_type,
    choice_type: r.question_def_id ? r.def_choice_type : r.custom_choice_type,
    options:     safeJSON(r.question_def_id ? r.def_options_json : r.custom_options_json, []),
    is_required: Number(r.is_required) === 1,
  }));

  // 익명일 때만 요청할 개인정보 필드 노출
  const respondent_fields = reservation ? [] : await loadRespondentFields(proj.id);

  res.json({
    ok: true,
    project: { name: proj.project_name, serial: proj.project_serial },
    survey: {
      title: survey.title, description: survey.description,
      image_url: toUploadUrl(survey.image_path),
      thank_you_message: survey.thank_you_message,
    },
    reservation: reservation ? {
      id: reservation.id, mode: reservation.mode,
      fields: safeJSON(reservation.fields_json, {}),
    } : null,
    questions,
    respondent_fields,
  });
});

async function loadRespondentFields(projectId: number) {
  const [rows] = await pool.execute(
    `SELECT rf.field_id, rf.is_required, fd.field_key, fd.label_ko, fd.input_type, fd.options_json, fd.placeholder
     FROM project_survey_respondent_fields rf
     JOIN field_definitions fd ON fd.id = rf.field_id
     WHERE rf.project_id = ?
     ORDER BY rf.sort_order ASC, rf.field_id ASC`, [projectId],
  );
  return (Array.isArray(rows) ? rows : []).map((r: any) => ({
    field_id: r.field_id, field_key: r.field_key, label: r.label_ko,
    input_type: r.input_type, placeholder: r.placeholder,
    options: r.options_json ? safeJSON(r.options_json, []) : [],
    required: Number(r.is_required) === 1,
  }));
}

// ============================================================
// (Public) 설문 응답 제출
// ============================================================
router.post("/public/projects/:serial/survey/submit", async (req, res) => {
  const serial = String(req.params.serial || "");
  const body = req.body || {};
  const resvToken = String(body.resv || "");
  const [pRows] = await pool.execute(
    `SELECT id, project_name, survey_use FROM projects WHERE project_serial = ?`, [serial],
  );
  const proj = (Array.isArray(pRows) ? pRows[0] : null) as any;
  if (!proj || Number(proj.survey_use) !== 1) { res.status(404).json({ ok: false }); return; }

  let reservationId: number | null = null;
  let respondentEmail: string | null = null;
  if (resvToken) {
    const [rRows] = await pool.execute(
      `SELECT id, email_lower FROM reservations WHERE project_id = ? AND token = ?`, [proj.id, resvToken],
    );
    const r = (Array.isArray(rRows) ? rRows[0] : null) as any;
    if (r) { reservationId = r.id; respondentEmail = r.email_lower; }
  }
  const answers = body.answers && typeof body.answers === "object" ? body.answers : {};
  const respondentFields = body.respondent_fields && typeof body.respondent_fields === "object" ? body.respondent_fields : null;
  if (!respondentEmail && respondentFields?.email) respondentEmail = String(respondentFields.email).toLowerCase();

  // 경품 발급 한도 확인 — 설문 메타 + 발급된 응답 수
  const [smRows] = await pool.execute(
    `SELECT reward_label, reward_amount, reward_qty, reward_message, reward_image_path, thank_you_message
     FROM project_surveys WHERE project_id = ?`, [proj.id],
  );
  const surveyMeta = (Array.isArray(smRows) ? smRows[0] : null) as any;
  const rewardQtyLimit = Number(surveyMeta?.reward_qty || 0);
  let rewardIssued = false;
  if (rewardQtyLimit > 0) {
    // 이미 발급된 QR 수 확인
    const [cntRows] = await pool.execute(
      `SELECT COUNT(*) AS issued_count FROM survey_responses WHERE project_id = ? AND qr_token IS NOT NULL`,
      [proj.id],
    );
    const issuedCount = Number((cntRows as any[])[0]?.issued_count || 0);
    rewardIssued = issuedCount < rewardQtyLimit;
  } else if (rewardQtyLimit === 0 && (surveyMeta?.reward_label || surveyMeta?.reward_amount > 0)) {
    // 0 = 무제한 (단 경품 설정이 있을 때만)
    rewardIssued = true;
  }

  // 경품 발급 시에만 QR 생성, 아니면 NULL 저장
  let qrToken: string | null = null;
  let qrFullPath: string | null = null;
  let qrFilename: string | null = null;
  if (rewardIssued) {
    qrToken = crypto.randomBytes(16).toString("hex");
    // QR 가 가리킬 URL — 호스트가 경품 지급 확인 시 사용 (간단한 검증 페이지)
    const baseUrl = process.env.DOMAIN ? `https://${process.env.DOMAIN}` : (process.env.BASE_URL || "");
    const qrPayload = `${baseUrl}/api/survey/public/reward/${qrToken}`;
    qrFilename = `${Date.now()}_${qrToken}.png`;
    qrFullPath = path.join(QR_DIR, qrFilename);
    try {
      await QRCode.toFile(qrFullPath, qrPayload, { width: 480, margin: 2 });
    } catch (e) {
      res.status(500).json({ ok: false, error: "qr_generation_failed" });
      return;
    }
  }

  await pool.execute(
    `INSERT INTO survey_responses (project_id, reservation_id, respondent_email, respondent_fields_json, answers_json, qr_token, qr_image_path)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [proj.id, reservationId, respondentEmail,
     respondentFields ? JSON.stringify(respondentFields) : null,
     JSON.stringify(answers), qrToken, qrFullPath],
  );

  res.json({
    ok: true,
    message: "응답이 정상적으로 제출되었습니다.",
    thank_you_message: surveyMeta?.thank_you_message || null,
    qr_token: qrToken,
    qr_image_url: qrFilename ? `/uploads/survey-qr/${qrFilename}` : null,
    reward_issued: rewardIssued,
    reward_qty_limit: rewardQtyLimit,
    reward: rewardIssued ? {
      label:    surveyMeta?.reward_label || null,
      amount:   Number(surveyMeta?.reward_amount || 0),
      qty:      rewardQtyLimit,
      message:  surveyMeta?.reward_message || null,
      image_url: toUploadUrl(surveyMeta?.reward_image_path),
    } : null,
    // 경품 한도 초과 시 안내
    reward_unavailable_reason: !rewardIssued && rewardQtyLimit > 0 ? "한도 소진" : null,
  });
});

// ============================================================
// (Host) 경품 수령 — 토큰으로 응답 + 경품 정보 조회 (수령 처리 X)
// ============================================================
router.get("/host/reward/lookup/:token", requireHost, async (req, res) => {
  const host = (req.session as any).host;
  const token = String(req.params.token || "").trim();
  if (!token) { res.status(400).json({ ok: false, error: "token_required" }); return; }
  const [rows] = await pool.execute(
    `SELECT r.id, r.project_id, r.respondent_email, r.respondent_fields_json,
            r.reservation_id, r.submitted_at, r.reward_used_at,
            p.project_name, p.project_serial, p.host_id,
            s.reward_label, s.reward_amount, s.reward_qty, s.reward_message, s.reward_image_path,
            rv.fields_json AS resv_fields
     FROM survey_responses r
     JOIN projects p ON p.id = r.project_id
     LEFT JOIN project_surveys s ON s.project_id = r.project_id
     LEFT JOIN reservations rv ON rv.id = r.reservation_id
     WHERE r.qr_token = ?`, [token],
  );
  const row = (Array.isArray(rows) ? rows[0] : null) as any;
  if (!row) { res.status(404).json({ ok: false, error: "not_found", message: "유효하지 않거나 발급되지 않은 QR 입니다." }); return; }
  if (Number(row.host_id) !== Number(host.id)) {
    res.status(403).json({ ok: false, error: "forbidden", message: "본인 프로젝트의 경품만 처리할 수 있습니다." });
    return;
  }
  let respondent: any = {};
  try { respondent = JSON.parse(row.respondent_fields_json || "{}"); } catch {}
  let reservation: any = {};
  try { reservation = JSON.parse(row.resv_fields || "{}"); } catch {}
  res.json({
    ok: true,
    response_id: row.id,
    project_name: row.project_name,
    project_serial: row.project_serial,
    submitted_at: row.submitted_at,
    reward_used_at: row.reward_used_at,
    already_used: !!row.reward_used_at,
    is_registered: !!row.reservation_id,
    respondent: {
      email: row.respondent_email,
      name:  respondent?.name || reservation?.name || null,
      mobile: respondent?.mobile || reservation?.mobile || respondent?.phone || reservation?.phone || null,
    },
    reward: {
      label:   row.reward_label || null,
      amount:  Number(row.reward_amount || 0),
      qty:     Number(row.reward_qty || 0),
      message: row.reward_message || null,
      image_url: toUploadUrl(row.reward_image_path),
    },
  });
});

// (Host) 경품 수령 — 실제 처리 (reward_used_at = NOW)
router.post("/host/reward/redeem", requireHost, async (req, res) => {
  const host = (req.session as any).host;
  const token = String((req.body || {}).token || "").trim();
  if (!token) { res.status(400).json({ ok: false, error: "token_required" }); return; }
  const [rows] = await pool.execute(
    `SELECT r.id, r.project_id, r.reward_used_at, p.host_id
     FROM survey_responses r
     JOIN projects p ON p.id = r.project_id
     WHERE r.qr_token = ?`, [token],
  );
  const row = (Array.isArray(rows) ? rows[0] : null) as any;
  if (!row) { res.status(404).json({ ok: false, error: "not_found" }); return; }
  if (Number(row.host_id) !== Number(host.id)) {
    res.status(403).json({ ok: false, error: "forbidden" }); return;
  }
  let alreadyUsed = false;
  if (row.reward_used_at) {
    alreadyUsed = true;
  } else {
    await pool.execute(`UPDATE survey_responses SET reward_used_at = NOW() WHERE id = ?`, [row.id]);
  }
  const [r2] = await pool.execute(`SELECT reward_used_at FROM survey_responses WHERE id = ?`, [row.id]);
  const used = (Array.isArray(r2) ? r2[0] : null) as any;
  res.json({ ok: true, already_used: alreadyUsed, reward_used_at: used?.reward_used_at || null });
});

// (Public) 경품 수령 QR 검증 — 호스트가 현장에서 QR 스캔 시 정보 표시
router.get("/public/reward/:token", async (req, res) => {
  const token = String(req.params.token || "");
  if (!token) { res.status(400).json({ ok: false, error: "token_required" }); return; }
  const [rows] = await pool.execute(
    `SELECT r.id, r.project_id, r.respondent_email, r.respondent_fields_json,
            r.submitted_at, r.reward_used_at,
            p.project_name, p.project_serial,
            s.reward_label, s.reward_amount, s.reward_message, s.reward_image_path
     FROM survey_responses r
     JOIN projects p ON p.id = r.project_id
     LEFT JOIN project_surveys s ON s.project_id = r.project_id
     WHERE r.qr_token = ?`, [token],
  );
  const row = (Array.isArray(rows) ? rows[0] : null) as any;
  if (!row) { res.status(404).json({ ok: false, error: "not_found" }); return; }
  let respondent: any = null;
  try { respondent = JSON.parse(row.respondent_fields_json || "{}"); } catch { respondent = {}; }
  res.json({
    ok: true,
    response_id: row.id,
    project_name: row.project_name,
    project_serial: row.project_serial,
    submitted_at: row.submitted_at,
    reward_used_at: row.reward_used_at,
    respondent: {
      email: row.respondent_email,
      name:  respondent?.name || null,
    },
    reward: {
      label:   row.reward_label || null,
      amount:  Number(row.reward_amount || 0),
      message: row.reward_message || null,
      image_url: toUploadUrl(row.reward_image_path),
    },
  });
});

export default router;
