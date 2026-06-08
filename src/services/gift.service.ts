import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import pool from "../config/database";
import { publicBaseUrl } from "./qr.service";
import { verifyPin } from "./project.service";
import { stampPaidOnPng } from "../utils/qr-stamp";
import { sendGiftUsedPush } from "./push.service";

const giftDir = path.join(process.cwd(), "uploads", "gift-qr");

// 방문자에게 노출할 Gift QR 이미지의 정적 URL
export function giftQrUrlPath(token: string): string {
  return `/uploads/gift-qr/${token}.png`;
}

// 해당 방문자가 활성 Tour를 모두 방문했는지(미션 완료) 확인
async function isMissionComplete(projectId: number, visitorId: number): Promise<boolean> {
  const r = await getVisitorProgress(projectId, visitorId);
  return r.total > 0 && r.visited >= r.total;
}

// 방문자의 진행률 (visited/total, percent)
export async function getVisitorProgress(projectId: number, visitorId: number): Promise<{ total: number; visited: number; pct: number; }> {
  const [rows] = await pool.execute(
    `SELECT
       (SELECT COUNT(*) FROM project_locations WHERE project_id = ? AND disabled = 0) AS total,
       (SELECT COUNT(DISTINCT vv.location_id)
          FROM visitor_visits vv
          JOIN project_locations pl ON pl.id = vv.location_id AND pl.disabled = 0
         WHERE vv.project_id = ? AND vv.visitor_id = ?) AS visited`,
    [projectId, projectId, visitorId],
  );
  const r = (rows as any)[0];
  const total = Number(r.total);
  const visited = Number(r.visited);
  // tier pct 는 Math.round 로 정의되므로 진행률도 동일 라운딩 사용 (예: 2/3 → 67)
  const pct = total > 0 ? Math.round((visited / total) * 100) : 0;
  return { total, visited, pct };
}

// 방문자의 누적 정답 보너스 (정답 1개당 prize_amount)
async function computeQuizBonus(projectId: number, visitorId: number): Promise<number> {
  const [pr] = await pool.execute(
    "SELECT prize_amount FROM projects WHERE id = ?",
    [projectId],
  );
  const prizeAmount = Number((pr as any[])[0]?.prize_amount || 0);
  if (prizeAmount === 0) return 0;
  const [cnt] = await pool.execute(
    `SELECT COUNT(*) AS n FROM visitor_quiz_attempts vqa
       JOIN project_quizzes q ON q.id = vqa.quiz_id
      WHERE vqa.visitor_id = ? AND vqa.is_correct = 1 AND q.project_id = ? AND q.disabled = 0`,
    [visitorId, projectId],
  );
  return prizeAmount * Number((cnt as any[])[0]?.n || 0);
}

// 특정 tier 의 Gift amount = tier amount + Quiz 정답 보너스 (어느 tier 든 보너스 합산)
async function tierAmount(projectId: number, visitorId: number, tierAmt: number, _pct: number): Promise<number> {
  return tierAmt + (await computeQuizBonus(projectId, visitorId));
}

// 발급 후에도 정답 추가 시 100% tier 의 amount 갱신
export async function recomputeIssuedGiftAmount(projectId: number, visitorId: number): Promise<void> {
  const [rows] = await pool.execute(
    "SELECT id, status, threshold_pct FROM gifts WHERE project_id = ? AND visitor_id = ? AND status = 'issued' AND threshold_pct = 100",
    [projectId, visitorId],
  );
  const g = (rows as any[])[0];
  if (!g) return;
  // 100% tier 의 base amount 다시 계산
  const [tRows] = await pool.execute(
    "SELECT amount FROM project_gift_tiers WHERE project_id = ? AND threshold_pct = 100",
    [projectId],
  );
  const tierAmt = (tRows as any[])[0] ? Number((tRows as any[])[0].amount) : 0;
  // tier 가 없으면 projects.gift_amount 폴백
  let baseAmt = tierAmt;
  if (!tierAmt) {
    const [pr] = await pool.execute("SELECT gift_amount FROM projects WHERE id = ?", [projectId]);
    baseAmt = Number((pr as any[])[0]?.gift_amount || 0);
  }
  const newAmount = baseAmt + (await computeQuizBonus(projectId, visitorId));
  await pool.execute(
    "UPDATE gifts SET amount = ? WHERE id = ? AND status = 'issued'",
    [newAmount, g.id],
  );
}

async function createGiftQr(projectId: number, visitorId: number, amount: number, pct: number): Promise<any | null> {
  const token = crypto.randomBytes(20).toString("hex");
  fs.mkdirSync(giftDir, { recursive: true });
  const filePath = path.join(giftDir, `${token}.png`);
  const url = `${publicBaseUrl()}/g/${token}`;
  await QRCode.toFile(filePath, url, { margin: 2, width: 460 });
  try {
    await pool.execute(
      "INSERT INTO gifts (project_id, visitor_id, token, amount, threshold_pct, status, qr_image_path) VALUES (?, ?, ?, ?, ?, 'issued', ?)",
      [projectId, visitorId, token, amount, pct, filePath],
    );
  } catch (e: any) {
    try { fs.unlinkSync(filePath); } catch (_) {}
    // 동시 발급 — 이미 존재
    const [again] = await pool.execute(
      "SELECT * FROM gifts WHERE project_id = ? AND visitor_id = ? AND threshold_pct = ?",
      [projectId, visitorId, pct],
    );
    if (Array.isArray(again) && again.length > 0) return (again as any)[0];
    throw e;
  }
  const [created] = await pool.execute("SELECT * FROM gifts WHERE token = ?", [token]);
  return (created as any)[0];
}

// 도달한 모든 tier 에 대해 Gift 발급 — 신규 발급된 것들 반환
export async function ensureGiftIfEligible(projectId: number, visitorId: number): Promise<any | null> {
  const newly = await ensureAllTierGifts(projectId, visitorId);
  // 호환성 위해 첫 번째(가장 높은 tier) gift 반환 또는 기존 100% gift
  if (newly && newly.length) return newly[newly.length - 1];
  const [existing] = await pool.execute(
    "SELECT * FROM gifts WHERE project_id = ? AND visitor_id = ? ORDER BY threshold_pct DESC LIMIT 1",
    [projectId, visitorId],
  );
  return (existing as any[])[0] || null;
}

// 진행률 기준 visitor 의 Gift 1장만 유지 — 가장 높은 도달 tier 의 amount 로 발급/업그레이드
// 기존 다중 row 가 남아 있는 경우 가장 높은 tier 외 issued 행은 정리 (used 행은 보존)
export async function ensureAllTierGifts(projectId: number, visitorId: number): Promise<any[]> {
  const prog = await getVisitorProgress(projectId, visitorId);
  if (prog.total === 0) return [];

  const [projRows] = await pool.execute(
    "SELECT status, stop_on_budget_exceed, budget_amount, gift_amount FROM projects WHERE id = ?",
    [projectId],
  );
  const proj = (projRows as any[])[0];
  if (!proj) return [];
  if (proj.status === "completed" || proj.status === "cancelled") return [];

  const stopOver = Number(proj.stop_on_budget_exceed) === 1;
  const budget = Number(proj.budget_amount || 0);

  const [tierRows] = await pool.execute(
    "SELECT threshold_pct, amount FROM project_gift_tiers WHERE project_id = ? ORDER BY threshold_pct ASC",
    [projectId],
  );
  let tiers = (tierRows as any[]).map((r) => ({ pct: Number(r.threshold_pct), amount: Number(r.amount) }));
  if (!tiers.length) {
    const giftAmt = Number(proj.gift_amount || 0);
    if (giftAmt > 0) tiers = [{ pct: 100, amount: giftAmt }];
  }

  const reached = tiers.filter((t) => prog.pct >= t.pct);
  if (!reached.length) return [];
  const topTier = reached[reached.length - 1]; // 가장 높은 도달 tier

  // 기존 발급 row 조회 — issued/used 모두
  const [existingRows] = await pool.execute(
    "SELECT id, threshold_pct, amount, status, qr_image_path FROM gifts WHERE project_id = ? AND visitor_id = ? ORDER BY threshold_pct DESC",
    [projectId, visitorId],
  );
  const existing = (existingRows as any[]) || [];

  // 이미 가장 높은 tier 의 Gift 가 있고 amount 도 일치 → 다중 row 정리만 수행
  const newAmount = await tierAmount(projectId, visitorId, topTier.amount, topTier.pct);

  // 'issued' 중에서 가장 높은 tier 의 행 1개를 keeper 로 선정 (없으면 신규 발급)
  const issued = existing.filter((g) => g.status === "issued");
  const keeper = issued.length ? issued[0] : null; // ORDER BY threshold_pct DESC

  if (keeper) {
    // keeper 외 다른 'issued' 행 삭제 (파일도 정리). 'used' 행은 보존.
    const others = issued.filter((g) => g.id !== keeper.id);
    for (const o of others) {
      try {
        await pool.execute("DELETE FROM gifts WHERE id = ?", [o.id]);
        if (o.qr_image_path) { try { fs.unlinkSync(String(o.qr_image_path)); } catch (_) {} }
      } catch (e) { /* noop */ }
    }
    // keeper 의 tier/amount 가 다르면 업그레이드
    if (Number(keeper.threshold_pct) !== topTier.pct || Number(keeper.amount) !== newAmount) {
      // 예산 체크 (옵션 ON)
      if (stopOver && budget > 0) {
        const [sumRow] = await pool.execute(
          "SELECT COALESCE(SUM(amount), 0) AS total FROM gifts WHERE project_id = ? AND id <> ?",
          [projectId, keeper.id],
        );
        const totalOthers = Number((sumRow as any[])[0]?.total || 0);
        if (totalOthers + newAmount > budget) {
          try {
            await pool.execute(
              "UPDATE projects SET status='completed', updated_at=NOW() WHERE id=? AND status NOT IN ('completed','cancelled')",
              [projectId],
            );
          } catch (e) { /* noop */ }
          return [];
        }
      }
      await pool.execute(
        "UPDATE gifts SET amount = ?, threshold_pct = ? WHERE id = ?",
        [newAmount, topTier.pct, keeper.id],
      );
      const [updated] = await pool.execute("SELECT * FROM gifts WHERE id = ?", [keeper.id]);
      return [(updated as any[])[0]];
    }
    return []; // 변동 없음
  }

  // 신규 발급
  if (newAmount <= 0) return [];
  if (stopOver && budget > 0) {
    const [sumRow] = await pool.execute(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM gifts WHERE project_id = ?",
      [projectId],
    );
    const totalIssued = Number((sumRow as any[])[0]?.total || 0);
    if (totalIssued + newAmount > budget) {
      try {
        await pool.execute(
          "UPDATE projects SET status='completed', updated_at=NOW() WHERE id=? AND status NOT IN ('completed','cancelled')",
          [projectId],
        );
      } catch (e) { /* noop */ }
      return [];
    }
  }
  try {
    const g = await createGiftQr(projectId, visitorId, newAmount, topTier.pct);
    if (g) return [g];
  } catch (e) { /* noop */ }
  return [];
}

// 가맹점이 스캔한 토큰의 Gift 정보(프로젝트/금액/소유자 전화/상태)
export async function getGiftByToken(token: string): Promise<any | null> {
  const [rows] = await pool.execute(
    `SELECT g.id, g.project_id, g.visitor_id, g.token, g.amount, g.status, g.qr_image_path,
            g.issued_at, g.used_at, p.project_name, p.project_serial, p.pin_hash, v.phone
     FROM gifts g
     JOIN projects p ON p.id = g.project_id
     JOIN visitors v ON v.id = g.visitor_id
     WHERE g.token = ?`,
    [token],
  );
  return (Array.isArray(rows) && rows.length > 0) ? (rows as any)[0] : null;
}

// 방문자 본인의 Gift 상태 (없으면 자격 검사 후 발급 시도) — 모든 tier 의 Gift 목록 반환
export async function getVisitorGift(projectId: number, visitorId: number): Promise<any> {
  await ensureAllTierGifts(projectId, visitorId);
  const [rows] = await pool.execute(
    "SELECT * FROM gifts WHERE project_id = ? AND visitor_id = ? ORDER BY threshold_pct ASC",
    [projectId, visitorId],
  );
  const list = (rows as any[]) || [];
  if (!list.length) return { eligible: false, gifts: [] };
  const gifts = list.map((g) => {
    const hasImage = g.qr_image_path ? fs.existsSync(String(g.qr_image_path)) : false;
    return {
      threshold_pct: Number(g.threshold_pct),
      status: g.status,
      amount: Number(g.amount),
      used_at: g.used_at,
      qr_url: hasImage ? giftQrUrlPath(g.token) + (g.status === "used" ? "?paid=1" : "") : null,
    };
  });
  // 호환: 기존 단일 필드도 유지 (가장 높은 tier 기준)
  const top = gifts[gifts.length - 1];
  return {
    eligible: true,
    status: top.status,
    amount: top.amount,
    used_at: top.used_at,
    qr_url: top.qr_url,
    gifts,
  };
}

type UseResult = { ok: boolean; error?: string; amount?: number };

// 가맹점 사용처리: 프로젝트 비밀번호 검증 → 1회만 사용 처리 → 이미지 삭제 + 사용내역 기록
export async function useGift(token: string, pin: string, merchantId?: number | null): Promise<UseResult> {
  const g = await getGiftByToken(token);
  if (!g) return { ok: false, error: "gift_not_found" };
  if (g.status === "used") return { ok: false, error: "already_used" };

  const pinOk = await verifyPin(pin, String(g.pin_hash));
  if (!pinOk) return { ok: false, error: "invalid_pin" };

  // 가맹점 지원 유형 검증 — Gift QR (Tour) 또는 Quiz 보상 유형 중 하나라도 approved 면 승인
  if (merchantId) {
    const [appRows] = await pool.execute(
      `SELECT id FROM project_applications
       WHERE project_id = ? AND merchant_id = ? AND support_type IN ('tour','quiz') AND status='approved'`,
      [g.project_id, merchantId],
    );
    if (!Array.isArray(appRows) || appRows.length === 0) {
      return { ok: false, error: "support_type_mismatch" };
    }
  }

  // 동시 사용 방지: issued 상태일 때만 used로 전환
  const [upd] = await pool.execute(
    "UPDATE gifts SET status = 'used', used_at = NOW() WHERE id = ? AND status = 'issued'",
    [g.id],
  );
  if ((upd as any).affectedRows === 0) return { ok: false, error: "already_used" };

  // 사용된 Gift QR 이미지에 'PAID' 라벨을 새겨 더 이상 스캔되지 않게 한다(삭제하지 않음).
  if (g.qr_image_path) { try { stampPaidOnPng(String(g.qr_image_path)); } catch (_) {} }

  // 대시보드 집계를 위한 사용내역 기록 (지급=normal). 가맹점 세션이 있으면 merchant_id 기록.
  await pool.execute(
    "INSERT INTO gift_redemptions (project_id, visitor_id, merchant_id, redemption_type, amount, eligible, redeemed_at) VALUES (?, ?, ?, 'normal', ?, 1, NOW())",
    [g.project_id, g.visitor_id, merchantId ?? null, g.amount],
  );

  // 방문자에게 'Gift 사용 완료' 푸시 알림(구독자에 한함). 실패해도 사용처리에는 영향 없음.
  sendGiftUsedPush(Number(g.visitor_id)).catch(() => {});

  return { ok: true, amount: Number(g.amount) };
}
