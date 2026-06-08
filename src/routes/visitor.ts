import { Router } from "express";
import QRCode from "qrcode";
import pool from "../config/database";
import { normalizePhone, verifyPin } from "../services/project.service";
import { ensureGiftIfEligible, ensureAllTierGifts, getVisitorGift, recomputeIssuedGiftAmount } from "../services/gift.service";
import { vapidPublicKey, saveVisitorSubscription } from "../services/push.service";

const router = Router();

function extractVisitorPhone(req: any, projectId: number): string | null {
  const key = `tracker_phone_${projectId}`;
  const fromCookie = req.cookies?.[key];
  return typeof fromCookie === "string" && fromCookie.length > 0 ? fromCookie : null;
}

function toUploadUrl(p?: string | null): string | null {
  if (!p) return null;
  const norm = String(p).replace(/\\/g, "/");
  const idx = norm.lastIndexOf("/uploads/");
  if (idx >= 0) return norm.slice(idx);
  const rel = norm.indexOf("uploads/");
  return rel >= 0 ? `/${norm.slice(rel)}` : norm;
}

// 활성 Tour 목록 + 해당 방문자의 Tour별 방문 여부
async function getVisitorLocations(projectId: number, visitorId: number) {
  const [rows] = await pool.execute(
    `SELECT pl.location_seq, pl.display_seq, pl.dest_type, pl.location_name, pl.location_desc, pl.image_path,
            (vv.id IS NOT NULL) AS visited
     FROM project_locations pl
     LEFT JOIN visitor_visits vv ON vv.location_id = pl.id AND vv.visitor_id = ?
     WHERE pl.project_id = ? AND pl.disabled = 0
     ORDER BY pl.display_seq ASC`,
    [visitorId, projectId],
  );
  return (Array.isArray(rows) ? rows : []).map((r: any) => ({
    location_seq: r.location_seq,
    display_seq: r.display_seq,
    dest_type: r.dest_type,
    location_name: r.location_name,
    location_desc: r.location_desc,
    image_url: toUploadUrl(r.image_path),
    visited: !!Number(r.visited),
  }));
}

// reservation token → 연결된 phone/name 조회 (visitor PWA 자동 등록용)
router.get("/reservation-lookup", async (req, res) => {
  const token = String(req.query.token || "");
  if (!token) { res.status(400).json({ error: "token_required" }); return; }
  const [rows] = await pool.execute(
    `SELECT r.id, r.mode, r.status, r.fields_json, p.project_serial, p.project_name
     FROM reservations r JOIN projects p ON p.id = r.project_id
     WHERE r.token = ?`,
    [token],
  );
  const row = (Array.isArray(rows) ? rows[0] : null) as any;
  if (!row) { res.status(404).json({ error: "reservation_not_found" }); return; }
  let fields: any = {};
  try { fields = row.fields_json ? JSON.parse(row.fields_json) : {}; } catch {}
  res.json({
    ok: true,
    project_serial: row.project_serial,
    project_name: row.project_name,
    mode: row.mode,
    status: row.status,
    phone: fields.mobile || "",
    name: fields.name || "",
    email: fields.email || "",
  });
});

router.post("/identify", async (req, res) => {
  const { project_serial, phone, consented } = req.body as Record<string, any>;
  if (!project_serial || !phone) {
    res.status(400).json({ error: "project_serial, phone are required" });
    return;
  }

  const norm = normalizePhone(String(phone));
  if (!/^01[0-9]{8,9}$/.test(norm)) {
    res.status(400).json({ error: "휴대폰 번호 형식이 올바르지 않습니다. (예: 01012345678)" });
    return;
  }
  if (!consented) {
    res.status(400).json({ error: "이용약관 및 개인정보 수집·이용 동의가 필요합니다." });
    return;
  }

  const [projectRows] = await pool.execute("SELECT id FROM projects WHERE project_serial = ?", [project_serial]);
  if (!Array.isArray(projectRows) || projectRows.length === 0) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }
  const projectId = Number((projectRows as any)[0].id);

  // 휴대폰 번호 = 방문자 식별값. 최초 동의 시각을 기록(이후 유지)한다.
  await pool.execute(
    `INSERT INTO visitors (project_id, phone, consent_at)
     VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE consent_at = COALESCE(consent_at, NOW())`,
    [projectId, norm],
  );

  res.cookie(`tracker_phone_${projectId}`, norm, { maxAge: 1000 * 60 * 60 * 24 * 30, httpOnly: true, sameSite: "lax" });
  res.json({ ok: true });
});

router.post("/visit", async (req, res) => {
  const { project_serial, location_seq } = req.body as Record<string, string>;

  const [projectRows] = await pool.execute(
    "SELECT id, status, project_name, description FROM projects WHERE project_serial = ?",
    [project_serial],
  );
  if (!Array.isArray(projectRows) || projectRows.length === 0) {
    res.status(404).json({ error: "project_not_found", message: "프로젝트를 찾을 수 없습니다." });
    return;
  }
  const proj = (projectRows as any)[0];
  if (proj.status !== "started") {
    const message = proj.status === "completed"
      ? "종료된 프로젝트입니다."
      : "아직 시작되지 않은 프로젝트입니다. 행사 시작 후 다시 시도해 주세요.";
    res.status(400).json({ error: "not_started", status: proj.status, message });
    return;
  }

  const projectId = Number(proj.id);
  const phone = extractVisitorPhone(req, projectId);
  if (!phone) {
    res.status(400).json({ error: "phone_required" });
    return;
  }

  const [visitorRows] = await pool.execute("SELECT id FROM visitors WHERE project_id = ? AND phone = ?", [projectId, phone]);
  if (!Array.isArray(visitorRows) || visitorRows.length === 0) {
    res.status(400).json({ error: "visitor_not_identified" });
    return;
  }
  const visitorId = Number((visitorRows as any)[0].id);

  const [locationRows] = await pool.execute(
    "SELECT id FROM project_locations WHERE project_id = ? AND location_seq = ? AND disabled = 0",
    [projectId, Number(location_seq)],
  );
  if (!Array.isArray(locationRows) || locationRows.length === 0) {
    res.status(404).json({ error: "location_not_found" });
    return;
  }
  const locationId = Number((locationRows as any)[0].id);

  // 이미 방문한 Tour인지 확인 (재촬영 시 안내용)
  const [dupRows] = await pool.execute(
    "SELECT id FROM visitor_visits WHERE visitor_id = ? AND location_id = ?",
    [visitorId, locationId],
  );
  const alreadyVisited = Array.isArray(dupRows) && dupRows.length > 0;

  if (!alreadyVisited) {
    await pool.execute(
      `INSERT INTO visitor_visits (project_id, visitor_id, location_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE visited_at = visited_at`,
      [projectId, visitorId, locationId],
    );
  }

  const [countRows] = await pool.execute(
    `SELECT
       (SELECT COUNT(*) FROM project_locations WHERE project_id = ? AND disabled = 0) AS total_locations,
       (SELECT COUNT(*)
        FROM visitor_visits vv
        JOIN project_locations pl ON pl.id = vv.location_id
        WHERE vv.project_id = ? AND vv.visitor_id = ? AND pl.disabled = 0) AS visited_locations`,
    [projectId, projectId, visitorId],
  );

  const totals = (countRows as any)[0];
  const totalLocations = Number(totals.total_locations);
  const visitedLocations = Number(totals.visited_locations);
  const completed = totalLocations > 0 && visitedLocations >= totalLocations;

  // 진행률 기준 모든 도달 tier 의 Gift 발급 (이미 발급된 것은 skip)
  let newlyIssued: any[] = [];
  try {
    newlyIssued = await ensureAllTierGifts(projectId, visitorId);
  } catch (e) { console.error("ensureAllTierGifts failed:", e); }

  const locations = await getVisitorLocations(projectId, visitorId);
  const quizzes = await getVisitorQuizzes(projectId, visitorId, locations);
  const giftData = await getVisitorGift(projectId, visitorId);

  res.json({
    ok: true,
    project_name: proj.project_name,
    description: proj.description,
    totalLocations,
    visitedLocations,
    completed,
    alreadyVisited,
    progressRate: totalLocations > 0 ? Math.round((visitedLocations / totalLocations) * 100) : 0,
    locations,
    quizzes,
    gift: giftData.eligible ? { status: giftData.status, amount: giftData.amount, qr_url: giftData.qr_url, used_at: giftData.used_at } : null,
    gifts: giftData.gifts || [],
    tiers: await getProjectTierStatus(projectId, visitorId, totalLocations, visitedLocations),
    newly_issued_tiers: newlyIssued.map((g: any) => Number(g.threshold_pct)),
  });
});

router.get("/progress/:projectSerial", async (req, res) => {
  const projectSerial = req.params.projectSerial;
  const [projectRows] = await pool.execute(
    "SELECT id, project_name, description, status, from_date, to_date FROM projects WHERE project_serial = ?",
    [projectSerial],
  );
  if (!Array.isArray(projectRows) || projectRows.length === 0) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }
  const projectRow = (projectRows as any)[0];
  const projectId = Number(projectRow.id);
  const projectName = projectRow.project_name as string;
  const projectDesc = projectRow.description as string;
  const projectStatus = String(projectRow.status || "");
  const projectFromDate = projectRow.from_date;
  const projectToDate   = projectRow.to_date;
  const phone = extractVisitorPhone(req, projectId);
  if (!phone) {
    res.status(400).json({ error: "phone_required" });
    return;
  }

  const [visitorRows] = await pool.execute("SELECT id FROM visitors WHERE project_id = ? AND phone = ?", [projectId, phone]);
  if (!Array.isArray(visitorRows) || visitorRows.length === 0) {
    res.status(404).json({ error: "visitor_not_found" });
    return;
  }
  const visitorId = Number((visitorRows as any)[0].id);

  const [countRows] = await pool.execute(
    `SELECT
       (SELECT COUNT(*) FROM project_locations WHERE project_id = ? AND disabled = 0) AS total_locations,
       (SELECT COUNT(*)
        FROM visitor_visits vv
        JOIN project_locations pl ON pl.id = vv.location_id
        WHERE vv.project_id = ? AND vv.visitor_id = ? AND pl.disabled = 0) AS visited_locations`,
    [projectId, projectId, visitorId],
  );
  const totals = (countRows as any)[0];
  const locations = await getVisitorLocations(projectId, visitorId);
  const quizzes = await getVisitorQuizzes(projectId, visitorId, locations);
  // 진행률 기반 tier 자동 발급 + 현재 모든 Gift
  try { await ensureAllTierGifts(projectId, visitorId); } catch (e) { /* noop */ }
  const giftData = await getVisitorGift(projectId, visitorId);
  const projTiers = await getProjectTierStatus(projectId, visitorId, Number(totals.total_locations), Number(totals.visited_locations));

  // 프로젝트 진행상태 — visitor 앱에서 QR 스캔 가능 여부 판별
  const toYmd = (d: any): string => {
    if (!d) return "";
    if (typeof d === "string") return d.slice(0, 10);
    if (d instanceof Date) {
      const z = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`;
    }
    return String(d).slice(0, 10);
  };
  const fromYmd = toYmd(projectFromDate);
  const toYmdStr = toYmd(projectToDate);
  // 현재 KST 기준 yyyy-mm-dd
  const now = new Date();
  const todayYmd = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const notStartedYet =
    projectStatus === "quoted" ||
    projectStatus === "deposit_wait" ||
    projectStatus === "deposit_confirmed" ||
    projectStatus === "ready_to_start" ||
    (!!fromYmd && todayYmd < fromYmd);
  const alreadyEnded =
    projectStatus === "completed" || projectStatus === "ended" || projectStatus === "cancelled" ||
    (!!toYmdStr && todayYmd > toYmdStr);
  const scanEnabled = !notStartedYet && !alreadyEnded;
  res.json({
    ok: true,
    project_name: projectName,
    description: projectDesc,
    project_status: projectStatus,
    project_from_date: fromYmd,
    project_to_date: toYmdStr,
    not_started_yet: notStartedYet,
    already_ended: alreadyEnded,
    scan_enabled: scanEnabled,
    totalLocations: Number(totals.total_locations),
    visitedLocations: Number(totals.visited_locations),
    locations,
    quizzes,
    gifts: giftData.gifts || [],
    tiers: projTiers,
  });
});

// 프로젝트의 모든 tier + visitor 의 도달/발급 상태
async function getProjectTierStatus(projectId: number, visitorId: number, total: number, visited: number) {
  const [tRows] = await pool.execute(
    "SELECT threshold_pct, amount FROM project_gift_tiers WHERE project_id = ? ORDER BY threshold_pct ASC",
    [projectId],
  );
  const tiers = (Array.isArray(tRows) ? tRows : []) as any[];
  if (!tiers.length) return [];
  const pct = total > 0 ? Math.round((visited / total) * 100) : 0;
  const [issuedRows] = await pool.execute(
    "SELECT threshold_pct FROM gifts WHERE project_id = ? AND visitor_id = ?",
    [projectId, visitorId],
  );
  const issuedSet = new Set<number>((issuedRows as any[]).map((r) => Number(r.threshold_pct)));
  return tiers.map((t) => ({
    pct: Number(t.threshold_pct),
    amount: Number(t.amount),
    reached: pct >= Number(t.threshold_pct),
    issued: issuedSet.has(Number(t.threshold_pct)),
  }));
}

// 방문자에게 노출할 퀴즈 목록 + 응시 상태 + 활성화 여부
async function getVisitorQuizzes(projectId: number, visitorId: number, locations: any[]) {
  const [quizRows] = await pool.execute(
    `SELECT q.id, q.location_id, q.question, q.question_image_path, q.choice_type,
            l.location_name AS location_name, l.display_seq AS location_display_seq
     FROM project_quizzes q
     LEFT JOIN project_locations l ON l.id = q.location_id
     WHERE q.project_id = ? AND q.disabled = 0
     ORDER BY q.display_seq ASC, q.id ASC`,
    [projectId],
  );
  const quizzes = (Array.isArray(quizRows) ? quizRows : []) as any[];
  if (!quizzes.length) return [];

  const ids = quizzes.map((q) => q.id);
  const [choiceRows] = await pool.query(
    `SELECT id, quiz_id, choice_text, choice_image_path, display_seq
     FROM project_quiz_choices
     WHERE quiz_id IN (?)
     ORDER BY quiz_id ASC, display_seq ASC, id ASC`,
    [ids],
  );
  const choicesByQuiz: Record<number, any[]> = {};
  for (const c of (Array.isArray(choiceRows) ? choiceRows : []) as any[]) {
    (choicesByQuiz[c.quiz_id] ??= []).push({
      id: c.id,
      text: c.choice_text,
      image_url: toUploadUrl(c.choice_image_path),
    });
  }

  const [attemptRows] = await pool.query(
    `SELECT quiz_id, is_correct, attempted_at FROM visitor_quiz_attempts WHERE visitor_id = ? AND quiz_id IN (?)`,
    [visitorId, ids],
  );
  const attemptByQuiz: Record<number, any> = {};
  for (const a of (Array.isArray(attemptRows) ? attemptRows : []) as any[]) {
    attemptByQuiz[a.quiz_id] = { is_correct: Number(a.is_correct) === 1, attempted_at: a.attempted_at };
  }

  // 정답 맞춘 퀴즈는 정답 보기 id 들을 노출 (방문자가 확인 가능)
  const solvedQuizIds = Object.entries(attemptByQuiz)
    .filter(([, a]) => a.is_correct)
    .map(([qid]) => Number(qid));
  if (solvedQuizIds.length) {
    const [corRows] = await pool.query(
      `SELECT quiz_id, id FROM project_quiz_choices WHERE quiz_id IN (?) AND is_correct = 1`,
      [solvedQuizIds],
    );
    for (const r of (Array.isArray(corRows) ? corRows : []) as any[]) {
      const qid = Number(r.quiz_id);
      (attemptByQuiz[qid].correct_choice_ids ??= []).push(Number(r.id));
    }
  }

  // 비연계 퀴즈 활성화 조건: 모든 활성 Tour 방문 완료
  const allVisited = locations.length > 0 && locations.every((l) => l.visited);
  const visitedLocIds = new Set(
    locations.filter((l) => l.visited).map((l) => l.location_id || l.id),
  );
  // location.id 가 응답에 없으므로 location_seq로 매칭이 어려움 → seq 기반으로 재매핑
  // 실제 location_id는 quizRows.location_id (project_quizzes.location_id) 와 비교 필요
  // → DB에서 직접 visited 여부 확인
  const [visitedRows] = await pool.execute(
    `SELECT DISTINCT location_id FROM visitor_visits WHERE visitor_id = ? AND project_id = ?`,
    [visitorId, projectId],
  );
  const visitedIdSet = new Set<number>(
    (Array.isArray(visitedRows) ? visitedRows : []).map((r: any) => Number(r.location_id)),
  );

  return quizzes.map((q: any) => {
    let activated = false;
    let activation_reason = "";
    if (q.location_id != null) {
      activated = visitedIdSet.has(Number(q.location_id));
      if (!activated) {
        activation_reason = `'${q.location_display_seq}. ${q.location_name}' 방문 후 활성화됩니다.`;
      }
    } else {
      activated = allVisited;
      if (!activated) activation_reason = "모든 Tour를 방문하면 활성화됩니다.";
    }
    return {
      id: q.id,
      location_id: q.location_id,
      location_name: q.location_name,
      location_display_seq: q.location_display_seq,
      question: q.question,
      question_image_url: toUploadUrl(q.question_image_path),
      choice_type: q.choice_type,
      choices: choicesByQuiz[q.id] ?? [],
      attempt: attemptByQuiz[q.id] ?? null,
      activated,
      activation_reason,
    };
  });
}

// 답안 제출 + 채점
router.post("/quiz-answer", async (req, res) => {
  const { project_serial, quiz_id, selected_choice_ids } = req.body as {
    project_serial?: string;
    quiz_id?: number;
    selected_choice_ids?: number[];
  };
  if (!project_serial || !quiz_id || !Array.isArray(selected_choice_ids) || selected_choice_ids.length === 0) {
    res.status(400).json({ error: "project_serial, quiz_id, selected_choice_ids 가 필요합니다." });
    return;
  }
  const [projectRows] = await pool.execute("SELECT id FROM projects WHERE project_serial = ?", [project_serial]);
  if (!Array.isArray(projectRows) || projectRows.length === 0) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }
  const projectId = Number((projectRows as any)[0].id);
  const phone = extractVisitorPhone(req, projectId);
  if (!phone) {
    res.status(400).json({ error: "phone_required" });
    return;
  }
  const [visitorRows] = await pool.execute(
    "SELECT id FROM visitors WHERE project_id = ? AND phone = ?",
    [projectId, phone],
  );
  if (!Array.isArray(visitorRows) || visitorRows.length === 0) {
    res.status(404).json({ error: "visitor_not_found" });
    return;
  }
  const visitorId = Number((visitorRows as any)[0].id);

  // 퀴즈 + 활성화 검증
  const [qRows] = await pool.execute(
    "SELECT id, project_id, location_id, choice_type FROM project_quizzes WHERE id = ? AND disabled = 0",
    [quiz_id],
  );
  if (!(qRows as any[]).length || Number((qRows as any[])[0].project_id) !== projectId) {
    res.status(404).json({ error: "quiz_not_found" });
    return;
  }
  const quiz = (qRows as any[])[0];

  // 활성화: 연계이면 그 location 방문 확인, 비연계이면 모든 활성 location 방문 확인
  if (quiz.location_id != null) {
    const [vv] = await pool.execute(
      "SELECT 1 FROM visitor_visits WHERE visitor_id = ? AND location_id = ? LIMIT 1",
      [visitorId, quiz.location_id],
    );
    if (!(vv as any[]).length) {
      res.status(403).json({ error: "이 퀴즈는 연계 Tour를 먼저 방문해야 응시할 수 있습니다." });
      return;
    }
  } else {
    const [chk] = await pool.execute(
      `SELECT
         (SELECT COUNT(*) FROM project_locations WHERE project_id = ? AND disabled = 0) AS total,
         (SELECT COUNT(DISTINCT vv.location_id) FROM visitor_visits vv
            JOIN project_locations pl ON pl.id = vv.location_id
            WHERE vv.visitor_id = ? AND pl.project_id = ? AND pl.disabled = 0) AS visited`,
      [projectId, visitorId, projectId],
    );
    const row = (chk as any[])[0];
    if (Number(row.total) === 0 || Number(row.visited) < Number(row.total)) {
      res.status(403).json({ error: "이 퀴즈는 모든 Tour를 방문해야 응시할 수 있습니다." });
      return;
    }
  }

  // 정답 채점
  const [correctRows] = await pool.execute(
    "SELECT id FROM project_quiz_choices WHERE quiz_id = ? AND is_correct = 1",
    [quiz_id],
  );
  const correctIds = new Set<number>((correctRows as any[]).map((r) => Number(r.id)));
  const submittedIds = new Set<number>(selected_choice_ids.map((n) => Number(n)));
  const isCorrect =
    submittedIds.size === correctIds.size &&
    Array.from(correctIds).every((id) => submittedIds.has(id));

  // UPSERT — 기존 row 있으면 갱신
  await pool.execute(
    `INSERT INTO visitor_quiz_attempts (visitor_id, quiz_id, is_correct, selected_choice_ids)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       is_correct = VALUES(is_correct),
       selected_choice_ids = VALUES(selected_choice_ids),
       attempted_at = CURRENT_TIMESTAMP`,
    [visitorId, quiz_id, isCorrect ? 1 : 0, JSON.stringify(Array.from(submittedIds))],
  );

  // 진행률 기준으로 단일 Gift 발급/업그레이드 — Gift 단가 보너스는 100% 도달 시에만 반영됨
  try { await ensureAllTierGifts(projectId, visitorId); } catch (e) { /* noop */ }

  // 현재 발급된(미사용) Gift 의 실제 amount = expected_total
  const [gRow] = await pool.execute(
    `SELECT amount, threshold_pct FROM gifts
      WHERE project_id = ? AND visitor_id = ? AND status = 'issued'
      ORDER BY threshold_pct DESC LIMIT 1`,
    [projectId, visitorId],
  );
  const curGift = (gRow as any[])[0];
  const expectedTotal = curGift ? Number(curGift.amount) : 0;
  const reachedTopTier = curGift && Number(curGift.threshold_pct) >= 100;

  const [pRows] = await pool.execute(
    "SELECT gift_amount, prize_amount FROM projects WHERE id = ?",
    [projectId],
  );
  const proj = (pRows as any[])[0] || {};
  const baseAmount = Number(proj.gift_amount || 0);
  const prizeAmount = Number(proj.prize_amount || 0);
  // Quiz 보너스는 정답 맞출 때마다 Gift 에 반영 (도달 tier 무관)
  const bonusAdded = isCorrect ? prizeAmount : 0;

  res.json({
    ok: true,
    is_correct: isCorrect,
    correct_choice_ids: Array.from(correctIds),
    prize_amount: prizeAmount,
    bonus_added: bonusAdded,
    base_amount: baseAmount,
    expected_total: expectedTotal,
    reached_top_tier: !!reachedTopTier,
  });
});

router.get("/mission-qr/:projectSerial", async (req, res) => {
  const projectSerial = req.params.projectSerial;
  const [projectRows] = await pool.execute("SELECT id FROM projects WHERE project_serial = ?", [projectSerial]);
  if (!Array.isArray(projectRows) || projectRows.length === 0) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }
  const projectId = Number((projectRows as any)[0].id);
  const phone = extractVisitorPhone(req, projectId);
  if (!phone) {
    res.status(400).json({ error: "phone_required" });
    return;
  }

  const [visitorRows] = await pool.execute("SELECT id FROM visitors WHERE project_id = ? AND phone = ?", [projectId, phone]);
  if (!Array.isArray(visitorRows) || visitorRows.length === 0) {
    res.status(404).json({ error: "visitor_not_found" });
    return;
  }

  const payload = `${projectSerial}|${phone}`;
  const dataUrl = await QRCode.toDataURL(payload, { width: 360 });
  res.json({ ok: true, dataUrl });
});

router.post("/gift/redeem", async (req, res) => {
  const { project_serial, pin_input, type = "normal" } = req.body as Record<string, string>;

  const [projectRows] = await pool.execute(
    "SELECT id, pin_hash, gift_amount FROM projects WHERE project_serial = ?",
    [project_serial],
  );
  if (!Array.isArray(projectRows) || projectRows.length === 0) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }
  const project = (projectRows as any)[0];

  const pinOk = await verifyPin(pin_input ?? "", String(project.pin_hash));
  if (!pinOk) {
    res.status(400).json({ error: "비밀전호가 일치하지 않습니다" });
    return;
  }

  const projectId = Number(project.id);
  const phone = extractVisitorPhone(req, projectId);
  if (!phone) {
    res.status(400).json({ error: "phone_required" });
    return;
  }

  const [visitorRows] = await pool.execute("SELECT id FROM visitors WHERE project_id = ? AND phone = ?", [projectId, phone]);
  if (!Array.isArray(visitorRows) || visitorRows.length === 0) {
    res.status(404).json({ error: "visitor_not_found" });
    return;
  }
  const visitorId = Number((visitorRows as any)[0].id);

  const [countRows] = await pool.execute(
    `SELECT
       (SELECT COUNT(*) FROM project_locations WHERE project_id = ? AND disabled = 0) AS total_locations,
       (SELECT COUNT(*) FROM visitor_visits WHERE project_id = ? AND visitor_id = ?) AS visited_locations`,
    [projectId, projectId, visitorId],
  );

  const totals = (countRows as any)[0];
  const eligible = Number(totals.total_locations) > 0 && Number(totals.visited_locations) >= Number(totals.total_locations);
  const redemptionType = type === "grant" ? "grant" : "normal";

  if (redemptionType === "normal" && !eligible) {
    res.status(400).json({ error: "미션 완료 방문자만 Gift 사용 가능합니다." });
    return;
  }

  await pool.execute(
    "INSERT INTO gift_redemptions (project_id, visitor_id, redemption_type, amount, eligible) VALUES (?, ?, ?, ?, ?)",
    [projectId, visitorId, redemptionType, Number(project.gift_amount), eligible ? 1 : 0],
  );

  res.json({ ok: true, eligible, redemptionType, amount: Number(project.gift_amount) });
});

// 방문자 본인의 Gift 발급/사용 상태
router.get("/gift/:projectSerial", async (req, res) => {
  const projectSerial = req.params.projectSerial;
  const [projectRows] = await pool.execute("SELECT id FROM projects WHERE project_serial = ?", [projectSerial]);
  if (!Array.isArray(projectRows) || projectRows.length === 0) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }
  const projectId = Number((projectRows as any)[0].id);
  const phone = extractVisitorPhone(req, projectId);
  if (!phone) {
    res.status(400).json({ error: "phone_required" });
    return;
  }
  const [visitorRows] = await pool.execute("SELECT id FROM visitors WHERE project_id = ? AND phone = ?", [projectId, phone]);
  if (!Array.isArray(visitorRows) || visitorRows.length === 0) {
    res.status(404).json({ error: "visitor_not_found" });
    return;
  }
  const visitorId = Number((visitorRows as any)[0].id);
  const gift = await getVisitorGift(projectId, visitorId);
  res.json({ ok: true, ...gift });
});

// ── 웹푸시: 공개키(VAPID) 조회 ──
router.get("/vapid-public-key", (_req, res) => {
  const key = vapidPublicKey();
  if (!key) { res.status(503).json({ error: "push_not_configured" }); return; }
  res.json({ ok: true, key });
});

// ── 웹푸시: 방문자 구독 저장 (식별된 방문자에 한함) ──
router.post("/push/subscribe", async (req, res) => {
  const { project_serial, subscription } = req.body as Record<string, any>;
  if (!project_serial || !subscription?.endpoint) {
    res.status(400).json({ error: "project_serial, subscription are required" });
    return;
  }
  const [projectRows] = await pool.execute("SELECT id FROM projects WHERE project_serial = ?", [project_serial]);
  if (!Array.isArray(projectRows) || projectRows.length === 0) { res.status(404).json({ error: "project_not_found" }); return; }
  const projectId = Number((projectRows as any)[0].id);

  const phone = extractVisitorPhone(req, projectId);
  if (!phone) { res.status(400).json({ error: "phone_required" }); return; }

  const [visitorRows] = await pool.execute("SELECT id FROM visitors WHERE project_id = ? AND phone = ?", [projectId, phone]);
  if (!Array.isArray(visitorRows) || visitorRows.length === 0) { res.status(404).json({ error: "visitor_not_found" }); return; }
  const visitorId = Number((visitorRows as any)[0].id);

  try { await saveVisitorSubscription(visitorId, subscription); } catch (e) { console.error("saveVisitorSubscription failed:", e); }
  res.json({ ok: true });
});

// 프로젝트별 PWA manifest (설치 시 해당 프로젝트 진행현황으로 실행)
function imageMime(url: string): string {
  const u = url.toLowerCase();
  if (u.endsWith(".png")) return "image/png";
  if (u.endsWith(".jpg") || u.endsWith(".jpeg")) return "image/jpeg";
  if (u.endsWith(".webp")) return "image/webp";
  if (u.endsWith(".svg")) return "image/svg+xml";
  return "image/png";
}

router.get("/manifest/:projectSerial", async (req, res) => {
  const projectSerial = req.params.projectSerial;
  const [rows] = await pool.execute(
    "SELECT project_name, supervisor_favicon_path FROM projects WHERE project_serial = ?",
    [projectSerial],
  );
  const row = (Array.isArray(rows) && rows.length > 0) ? (rows as any)[0] : null;
  const name = row ? String(row.project_name) : "스탬프투어";
  const iconUrl = toUploadUrl(row?.supervisor_favicon_path);
  // 프로젝트 아이콘이 있으면 그것을, 없으면 기본 파비콘 사용
  const icons = iconUrl
    ? [
        { src: iconUrl, sizes: "192x192", type: imageMime(iconUrl), purpose: "any" },
        { src: iconUrl, sizes: "512x512", type: imageMime(iconUrl), purpose: "maskable" },
      ]
    : [
        { src: "/favicon-green.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        { src: "/favicon-green.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" },
      ];
  // 앱 이름·짧은 이름 모두 프로젝트명으로 통일
  const safeName = name || "스탬프투어";
  // scope 를 origin 전체로 두어 reserve / entry / survey / r 모든 visitor 경로에서
  // 동일 PWA 로 설치 안내가 노출되고, 설치 후에도 standalone 윈도우 안에서 동작하도록 함
  res.type("application/manifest+json").send(JSON.stringify({
    id: `/v/${projectSerial}`,
    name: safeName,
    short_name: safeName.length > 12 ? safeName.slice(0, 12) + "…" : safeName,
    start_url: `/v/${projectSerial}`,
    scope: `/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#f0fdf4",
    theme_color: "#15803d",
    icons,
  }));
});

// 방문자 랜딩 브랜딩 (프로젝트별 랜딩페이지 이미지 / 아이콘 / 이름)
// 방문자 인라인 개인정보 등록 — 사전·현장등록 기능이 없거나 빠른 등록 시
//   POST /api/visitor/identity
//   body: { serial, email, code, fields: { name, email, mobile } }
//   동작: 이메일 인증 후 reservations 에 mode='entry' 로 저장 (기능 비활성 무시)
router.post("/identity", async (req, res) => {
  const body = req.body || {};
  const serial = String(body.serial || "").trim();
  const email  = String(body.email || "").trim().toLowerCase();
  const code   = String(body.code || "").trim();
  const fields = (body.fields && typeof body.fields === "object") ? body.fields : {};
  if (!serial || !email || !code) { res.status(400).json({ ok: false, error: "missing" }); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ ok: false, error: "invalid_email" }); return;
  }
  if (!String(fields.name || "").trim()) { res.status(400).json({ ok: false, error: "missing_name" }); return; }

  // 프로젝트 조회
  const [pr] = await pool.execute(
    `SELECT id, project_name FROM projects WHERE project_serial = ?`, [serial],
  );
  const proj = (Array.isArray(pr) ? pr[0] : null) as any;
  if (!proj) { res.status(404).json({ ok: false, error: "project_not_found" }); return; }

  // 인증코드 검증
  const [codeRows] = await pool.execute(
    `SELECT id FROM host_email_verify_codes
      WHERE email = ? AND code = ? AND used = 0 AND expires_at > NOW()
      ORDER BY id DESC LIMIT 1`,
    [email, code],
  );
  if (!Array.isArray(codeRows) || codeRows.length === 0) {
    res.status(400).json({ ok: false, error: "email_not_verified" }); return;
  }
  await pool.execute(`UPDATE host_email_verify_codes SET used = 1 WHERE id = ?`,
    [(codeRows as any)[0].id]);

  // 이미 같은 이메일로 등록 → 그대로 OK 처리 (재인증 후 자동 로그인 흐름)
  const [exist] = await pool.execute(
    `SELECT id FROM reservations WHERE project_id = ? AND email_lower = ? LIMIT 1`,
    [proj.id, email],
  );
  if (Array.isArray(exist) && exist.length > 0) {
    res.json({ ok: true, found: true, message: "이미 등록된 이메일입니다. 기존 정보로 로그인됩니다." });
    return;
  }

  // 신규 등록 — mode='entry' 로 저장 (기능 활성/비활성 무시, 혜택 금액 0)
  const token = require("crypto").randomBytes(20).toString("hex");
  try {
    await pool.execute(
      `INSERT INTO reservations (project_id, mode, email_lower, token, fields_json, amount, status)
       VALUES (?, 'entry', ?, ?, ?, 0, 'pending')`,
      [proj.id, email, token, JSON.stringify(fields)],
    );
  } catch (e: any) {
    if (e && (e.code === "ER_DUP_ENTRY" || e.errno === 1062)) {
      res.json({ ok: true, found: true });
      return;
    }
    throw e;
  }

  res.json({ ok: true, found: false, message: "등록되었습니다." });
});

// 방문자 프로필 조회 — 자동 로그인용 (이메일 기반, 인증코드 없이 조회 가능)
//   /api/visitor/profile?serial=X&email=Y
//   응답: 사전·현장등록 정보(name·email·mobile·기타 필드)
router.get("/profile", async (req, res) => {
  const serial = String(req.query.serial || "").trim();
  const email  = String(req.query.email || "").trim().toLowerCase();
  if (!serial || !email) { res.status(400).json({ ok: false, error: "missing" }); return; }
  const [pr] = await pool.execute(
    `SELECT id, project_name FROM projects WHERE project_serial = ? LIMIT 1`, [serial],
  );
  const proj = (Array.isArray(pr) ? pr[0] : null) as any;
  if (!proj) { res.status(404).json({ ok: false, error: "project_not_found" }); return; }
  const [rows] = await pool.execute(
    `SELECT mode, status, fields_json, amount, token, qr_image_path,
            created_at, activated_at, used_at
       FROM reservations WHERE project_id = ? AND email_lower = ? LIMIT 1`,
    [proj.id, email],
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    res.json({ ok: true, found: false }); return;
  }
  const r = rows[0] as any;
  let fields: any = {};
  try { fields = r.fields_json ? JSON.parse(r.fields_json) : {}; } catch {}
  res.json({
    ok: true, found: true,
    profile: {
      mode: r.mode, status: r.status, fields,
      amount: Number(r.amount || 0),
      token: r.token,
      qr_image_url: toUploadUrl(r.qr_image_path),
      created_at: r.created_at, activated_at: r.activated_at, used_at: r.used_at,
      project_name: proj.project_name,
    },
  });
});

router.get("/project/:projectSerial", async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT project_name, supervisor_mobile_image_path, supervisor_favicon_path,
            reservation_use, entry_use, tour_use, quiz_use, survey_use, survey_reward_use,
            status, from_date, to_date, reservation_start_at
       FROM projects WHERE project_serial = ?`,
    [req.params.projectSerial],
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(404).json({ error: "project_not_found" });
    return;
  }
  const p = (rows as any)[0];
  res.json({
    ok: true,
    project_name: p.project_name,
    landing_image_url: toUploadUrl(p.supervisor_mobile_image_path),
    icon_url: toUploadUrl(p.supervisor_favicon_path),
    status: p.status,
    from_date: p.from_date,
    to_date: p.to_date,
    reservation_start_at: p.reservation_start_at,
    features: {
      reservation:    Number(p.reservation_use) === 1,
      entry:          Number(p.entry_use) === 1,
      tour:           Number(p.tour_use) === 1,
      quiz:           Number(p.quiz_use) === 1,
      survey:         Number(p.survey_use) === 1,
      survey_reward:  Number(p.survey_reward_use) === 1,
    },
  });
});

export default router;
