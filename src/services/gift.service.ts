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

// 해당 방문자가 활성 목적지를 모두 방문했는지(미션 완료) 확인
async function isMissionComplete(projectId: number, visitorId: number): Promise<boolean> {
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
  return Number(r.total) > 0 && Number(r.visited) >= Number(r.total);
}

// 방문자의 누적 정답 보너스 (정답 1개당 prize_amount)
export async function computeVisitorGiftAmount(projectId: number, visitorId: number): Promise<number> {
  const [pr] = await pool.execute(
    "SELECT gift_amount, prize_amount FROM projects WHERE id = ?",
    [projectId],
  );
  if (!Array.isArray(pr) || pr.length === 0) return 0;
  const baseAmount = Number((pr as any)[0].gift_amount || 0);
  const prizeAmount = Number((pr as any)[0].prize_amount || 0);
  const [cnt] = await pool.execute(
    `SELECT COUNT(*) AS n FROM visitor_quiz_attempts vqa
       JOIN project_quizzes q ON q.id = vqa.quiz_id
      WHERE vqa.visitor_id = ? AND vqa.is_correct = 1 AND q.project_id = ? AND q.disabled = 0`,
    [visitorId, projectId],
  );
  const correctCount = Number((cnt as any[])[0]?.n || 0);
  return baseAmount + prizeAmount * correctCount;
}

// 발급 전인 visitor 의 누적 Gift 금액(미리보기) — Gift 행이 없을 때도 계산 가능
export async function previewVisitorGiftAmount(projectId: number, visitorId: number): Promise<number> {
  return computeVisitorGiftAmount(projectId, visitorId);
}

// 이미 발급된(미사용) Gift 의 amount 를 현재 정답 수 기반으로 갱신
export async function recomputeIssuedGiftAmount(projectId: number, visitorId: number): Promise<void> {
  const [rows] = await pool.execute(
    "SELECT id, status FROM gifts WHERE project_id = ? AND visitor_id = ?",
    [projectId, visitorId],
  );
  const g = (rows as any[])[0];
  if (!g || g.status !== "issued") return;
  const newAmount = await computeVisitorGiftAmount(projectId, visitorId);
  await pool.execute(
    "UPDATE gifts SET amount = ? WHERE id = ? AND status = 'issued'",
    [newAmount, g.id],
  );
}

// 미션 완료 시 Gift(QR) 발급 — 이미 있으면 그대로 반환, 자격 없으면 null
export async function ensureGiftIfEligible(projectId: number, visitorId: number): Promise<any | null> {
  const [existing] = await pool.execute(
    "SELECT * FROM gifts WHERE project_id = ? AND visitor_id = ?",
    [projectId, visitorId],
  );
  if (Array.isArray(existing) && existing.length > 0) return (existing as any)[0];

  if (!(await isMissionComplete(projectId, visitorId))) return null;

  // 발급 시점의 base + 정답 보너스 누적분을 Gift amount 로 기록
  const amount = await computeVisitorGiftAmount(projectId, visitorId);
  if (amount <= 0) return null;

  const token = crypto.randomBytes(20).toString("hex");
  fs.mkdirSync(giftDir, { recursive: true });
  const filePath = path.join(giftDir, `${token}.png`);
  const url = `${publicBaseUrl()}/g/${token}`;
  await QRCode.toFile(filePath, url, { margin: 2, width: 460 });

  try {
    await pool.execute(
      "INSERT INTO gifts (project_id, visitor_id, token, amount, status, qr_image_path) VALUES (?, ?, ?, ?, 'issued', ?)",
      [projectId, visitorId, token, amount, filePath],
    );
  } catch (e: any) {
    // 동시 요청 등으로 이미 생성된 경우
    try { fs.unlinkSync(filePath); } catch (_) {}
    const [again] = await pool.execute(
      "SELECT * FROM gifts WHERE project_id = ? AND visitor_id = ?",
      [projectId, visitorId],
    );
    if (Array.isArray(again) && again.length > 0) return (again as any)[0];
    throw e;
  }

  const [created] = await pool.execute("SELECT * FROM gifts WHERE token = ?", [token]);
  return (created as any)[0];
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

// 방문자 본인의 Gift 상태 (없으면 자격 검사 후 발급 시도)
export async function getVisitorGift(projectId: number, visitorId: number): Promise<any> {
  const g = await ensureGiftIfEligible(projectId, visitorId);
  if (!g) return { eligible: false };
  // 사용 후에도 'PAID' 라벨이 새겨진 QR 이미지를 그대로 노출한다.
  // (?paid=1 쿼리로 캐시 무효화 → 브라우저/서비스워커가 스탬프된 새 이미지를 받음)
  const hasImage = g.qr_image_path ? fs.existsSync(String(g.qr_image_path)) : false;
  return {
    eligible: true,
    status: g.status,
    amount: Number(g.amount),
    used_at: g.used_at,
    qr_url: hasImage ? giftQrUrlPath(g.token) + (g.status === "used" ? "?paid=1" : "") : null,
  };
}

type UseResult = { ok: boolean; error?: string; amount?: number };

// 가맹점 사용처리: 프로젝트 비밀번호 검증 → 1회만 사용 처리 → 이미지 삭제 + 사용내역 기록
export async function useGift(token: string, pin: string): Promise<UseResult> {
  const g = await getGiftByToken(token);
  if (!g) return { ok: false, error: "gift_not_found" };
  if (g.status === "used") return { ok: false, error: "already_used" };

  const pinOk = await verifyPin(pin, String(g.pin_hash));
  if (!pinOk) return { ok: false, error: "invalid_pin" };

  // 동시 사용 방지: issued 상태일 때만 used로 전환
  const [upd] = await pool.execute(
    "UPDATE gifts SET status = 'used', used_at = NOW() WHERE id = ? AND status = 'issued'",
    [g.id],
  );
  if ((upd as any).affectedRows === 0) return { ok: false, error: "already_used" };

  // 사용된 Gift QR 이미지에 'PAID' 라벨을 새겨 더 이상 스캔되지 않게 한다(삭제하지 않음).
  if (g.qr_image_path) { try { stampPaidOnPng(String(g.qr_image_path)); } catch (_) {} }

  // 대시보드 집계를 위한 사용내역 기록 (지급=normal)
  await pool.execute(
    "INSERT INTO gift_redemptions (project_id, visitor_id, redemption_type, amount, eligible, redeemed_at) VALUES (?, ?, 'normal', ?, 1, NOW())",
    [g.project_id, g.visitor_id, g.amount],
  );

  // 방문자에게 'Gift 사용 완료' 푸시 알림(구독자에 한함). 실패해도 사용처리에는 영향 없음.
  sendGiftUsedPush(Number(g.visitor_id)).catch(() => {});

  return { ok: true, amount: Number(g.amount) };
}
