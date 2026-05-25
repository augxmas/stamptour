import { Router } from "express";
import QRCode from "qrcode";
import pool from "../config/database";
import { normalizePhone, verifyPin } from "../services/project.service";
import { ensureGiftIfEligible, getVisitorGift } from "../services/gift.service";
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

// 활성 목적지 목록 + 해당 방문자의 목적지별 방문 여부
async function getVisitorLocations(projectId: number, visitorId: number) {
  const [rows] = await pool.execute(
    `SELECT pl.location_seq, pl.display_seq, pl.dest_type, pl.location_name, pl.image_path,
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
    image_url: toUploadUrl(r.image_path),
    visited: !!Number(r.visited),
  }));
}

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

  const [projectRows] = await pool.execute("SELECT id, status FROM projects WHERE project_serial = ?", [project_serial]);
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

  // 이미 방문한 목적지인지 확인 (재촬영 시 안내용)
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

  // 모든 목적지 방문 완료 시 Gift(QR) 발급
  let gift: any = null;
  if (completed) {
    try {
      const g = await ensureGiftIfEligible(projectId, visitorId);
      if (g) gift = { status: g.status, amount: Number(g.amount), qr_url: g.status === "issued" ? `/uploads/gift-qr/${g.token}.png` : null, used_at: g.used_at };
    } catch (e) { console.error("ensureGiftIfEligible failed:", e); }
  }

  const locations = await getVisitorLocations(projectId, visitorId);

  res.json({
    ok: true,
    totalLocations,
    visitedLocations,
    completed,
    alreadyVisited,
    progressRate: totalLocations > 0 ? Math.round((visitedLocations / totalLocations) * 100) : 0,
    locations,
    gift,
  });
});

router.get("/progress/:projectSerial", async (req, res) => {
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

  res.json({
    ok: true,
    totalLocations: Number(totals.total_locations),
    visitedLocations: Number(totals.visited_locations),
    locations,
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
        { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        { src: "/favicon.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" },
      ];
  res.type("application/manifest+json").send(JSON.stringify({
    name: `${name} 스탬프투어`,
    short_name: name.slice(0, 12) || "스탬프투어",
    start_url: `/v/${projectSerial}`,
    scope: "/v/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6fbff",
    theme_color: "#0d3b66",
    icons,
  }));
});

// 방문자 랜딩 브랜딩 (프로젝트별 랜딩페이지 이미지 / 아이콘 / 이름)
router.get("/project/:projectSerial", async (req, res) => {
  const [rows] = await pool.execute(
    "SELECT project_name, supervisor_mobile_image_path, supervisor_favicon_path FROM projects WHERE project_serial = ?",
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
  });
});

export default router;
