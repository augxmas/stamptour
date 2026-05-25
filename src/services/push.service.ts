import crypto from "node:crypto";
import webpush from "web-push";
import pool from "../config/database";

let configured = false;

// VAPID 설정(키가 있을 때만). 키가 없으면 푸시는 조용히 비활성화된다.
function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const pri = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !pri) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@monorama.kr", pub, pri);
  configured = true;
  return true;
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

// 방문자의 푸시 구독 저장(있으면 갱신)
export async function saveVisitorSubscription(visitorId: number, sub: any): Promise<void> {
  const endpoint = String(sub?.endpoint || "");
  const p256dh = String(sub?.keys?.p256dh || "");
  const auth = String(sub?.keys?.auth || "");
  if (!endpoint || !p256dh || !auth) return;

  const hash = crypto.createHash("sha256").update(endpoint).digest("hex");
  await pool.execute(
    `INSERT INTO visitor_push_subscriptions (visitor_id, endpoint, endpoint_hash, p256dh, auth)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE visitor_id = VALUES(visitor_id), p256dh = VALUES(p256dh), auth = VALUES(auth)`,
    [visitorId, endpoint, hash, p256dh, auth],
  );
}

// 방문자에게 푸시 발송. 만료(404/410)된 구독은 정리한다. 실패해도 호출부에 영향 없음.
export async function sendVisitorPush(
  visitorId: number,
  payload: { title: string; body: string; url?: string },
): Promise<void> {
  if (!ensureConfigured()) return;

  const [rows] = await pool.execute(
    "SELECT id, endpoint, p256dh, auth FROM visitor_push_subscriptions WHERE visitor_id = ?",
    [visitorId],
  );
  const subs = Array.isArray(rows) ? (rows as any[]) : [];
  if (subs.length === 0) return;

  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
      } catch (e: any) {
        const code = e?.statusCode;
        if (code === 404 || code === 410) {
          try { await pool.execute("DELETE FROM visitor_push_subscriptions WHERE id = ?", [s.id]); } catch (_) {}
        }
      }
    }),
  );
}

// Gift 사용(소진) 완료 알림
export async function sendGiftUsedPush(visitorId: number, url?: string): Promise<void> {
  await sendVisitorPush(visitorId, {
    title: "모노라마 트래커",
    body: "Gift 사용이 완료되었습니다.",
    url: url || "/",
  });
}
