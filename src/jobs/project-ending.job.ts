import pool from "../config/database";
import { sendEmail } from "../services/email.service";
import { dec, encKey } from "../utils/encrypt";

const TEMPLATE_KEY = "project_ending_notice";

// 종료일 3일 전 ~ 종료일(당일까지) 사이의 started 프로젝트 + 담당자/참여 가맹점 조회
async function findProjectsEnding(): Promise<Array<{
  project_id: number;
  project_name: string;
  project_serial: string;
  to_date: string;
  host_id: number;
  host_name: string;
  host_email: string;
}>> {
  const k = encKey();
  const [rows] = await pool.execute(
    `SELECT p.id AS project_id, p.project_name, p.project_serial, p.to_date,
            h.id AS host_id,
            ${dec("h.host_name")},
            ${dec("h.host_email")}
     FROM projects p
     INNER JOIN hosts h ON h.id = p.host_id
     WHERE p.status = 'started'
       AND p.to_date >= CURDATE()
       AND DATEDIFF(p.to_date, CURDATE()) <= 3`,
    [k, k],
  );
  return rows as any[];
}

async function findApprovedMerchants(projectId: number): Promise<Array<{ merchant_id: number; merchant_name: string; email: string }>> {
  const k = encKey();
  const [rows] = await pool.execute(
    `SELECT pa.merchant_id, ${dec("m.merchant_name")}, ${dec("m.email")}
     FROM project_applications pa
     INNER JOIN merchants m ON m.id = pa.merchant_id
     WHERE pa.project_id = ? AND pa.status = 'approved'`,
    [k, k, projectId],
  );
  return rows as any[];
}

async function alreadySentToday(projectId: number, toEmail: string): Promise<boolean> {
  const [rows] = await pool.execute(
    `SELECT 1 FROM email_logs
     WHERE template_key = ? AND project_id = ? AND to_email = ?
       AND DATE(created_at) = CURDATE() AND status = 'sent'
     LIMIT 1`,
    [TEMPLATE_KEY, projectId, toEmail],
  );
  return Array.isArray(rows) && rows.length > 0;
}

function toDateStr(d: any): string {
  const dt = new Date(d);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${z(dt.getMonth() + 1)}-${z(dt.getDate())}`;
}

function daysUntil(toDate: any): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(toDate);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / 86400000);
}

function buildHtml(recipientName: string, projectName: string, projectSerial: string, toDate: string, daysLeft: number): string {
  const dayText = daysLeft <= 0
    ? "오늘"
    : daysLeft === 1 ? "내일" : `${daysLeft}일 후`;
  const titleColor = daysLeft <= 0 ? "#dc2626" : "#ea580c";
  return `<div style="font-family:'Malgun Gothic',sans-serif;max-width:560px;">
    <h2 style="color:${titleColor};">프로젝트 종료 안내</h2>
    <p>${recipientName} 담당자님,</p>
    <p><b>${projectName}</b> 프로젝트가 <b>${dayText} (${toDate})</b> 종료될 예정입니다.</p>
    <table border="1" cellpadding="10" cellspacing="0" style="border-collapse:collapse;width:100%;margin:16px 0;">
      <tr><td style="background:#f8fafc;font-weight:600;width:120px;">프로젝트명</td><td>${projectName}</td></tr>
      <tr><td style="background:#f8fafc;font-weight:600;">일련번호</td><td>${projectSerial}</td></tr>
      <tr><td style="background:#f8fafc;font-weight:600;">종료일</td><td>${toDate}</td></tr>
      <tr><td style="background:#f8fafc;font-weight:600;">남은 일수</td><td>${daysLeft <= 0 ? "오늘 종료" : daysLeft + "일"}</td></tr>
    </table>
    <p style="font-size:13px;color:#64748b;">종료 전 마무리하실 사항이 있다면 확인해 주세요.</p>
  </div>`;
}

const BATCH_JOB_KEY = "project_ending_notice";

type RecipientResult = {
  type: "host" | "merchant";
  name: string;
  email: string;
  status: "sent" | "skipped" | "failed";
  error?: string;
};

type ProjectDetail = {
  project_id: number;
  project_name: string;
  project_serial: string;
  to_date: string;
  days_left: number;
  recipients: RecipientResult[];
};

async function logBatch(
  source: string,
  status: "ok" | "error",
  startedAt: Date,
  summary: string,
  errorMsg: string | null,
  details: object | null,
): Promise<void> {
  try {
    await pool.execute(
      `INSERT INTO batch_logs (job_key, source, status, result_summary, started_at, finished_at, error_msg, details)
       VALUES (?, ?, ?, ?, ?, NOW(), ?, ?)`,
      [BATCH_JOB_KEY, source, status, summary, startedAt, errorMsg, details ? JSON.stringify(details) : null],
    );
  } catch (e) {
    console.error("[project-ending] batch_logs insert failed:", e);
  }
}

export async function runProjectEndingNotifications(source: string = "node"): Promise<{ sent: number; skipped: number; failed: number }> {
  const startedAt = new Date();
  let sent = 0, skipped = 0, failed = 0;
  let projectsFound = 0;
  let topError: string | null = null;
  const projectDetails: ProjectDetail[] = [];

  try {
    const projects = await findProjectsEnding();
    projectsFound = projects.length;

    for (const p of projects) {
      const toDate = toDateStr(p.to_date);
      const daysLeft = daysUntil(p.to_date);
      const subject = `[모노라마] 프로젝트 종료 안내 - ${p.project_name}`;
      const recipients: RecipientResult[] = [];

      // Host
      if (p.host_email) {
        if (await alreadySentToday(p.project_id, String(p.host_email))) {
          skipped++;
          recipients.push({ type: "host", name: String(p.host_name ?? ""), email: String(p.host_email), status: "skipped" });
        } else {
          try {
            await sendEmail({
              templateKey: TEMPLATE_KEY,
              to: String(p.host_email),
              subject,
              html: buildHtml(String(p.host_name ?? ""), p.project_name, p.project_serial, toDate, daysLeft),
              projectId: p.project_id,
              hostId: p.host_id,
            });
            sent++;
            recipients.push({ type: "host", name: String(p.host_name ?? ""), email: String(p.host_email), status: "sent" });
          } catch (e) {
            failed++;
            const msg = e instanceof Error ? e.message : String(e);
            if (!topError) topError = msg;
            recipients.push({ type: "host", name: String(p.host_name ?? ""), email: String(p.host_email), status: "failed", error: msg });
          }
        }
      }

      // Approved merchants
      const merchants = await findApprovedMerchants(p.project_id);
      for (const m of merchants) {
        if (!m.email) continue;
        if (await alreadySentToday(p.project_id, String(m.email))) {
          skipped++;
          recipients.push({ type: "merchant", name: String(m.merchant_name ?? ""), email: String(m.email), status: "skipped" });
          continue;
        }
        try {
          await sendEmail({
            templateKey: TEMPLATE_KEY,
            to: String(m.email),
            subject,
            html: buildHtml(String(m.merchant_name ?? ""), p.project_name, p.project_serial, toDate, daysLeft),
            projectId: p.project_id,
          });
          sent++;
          recipients.push({ type: "merchant", name: String(m.merchant_name ?? ""), email: String(m.email), status: "sent" });
        } catch (e) {
          failed++;
          const msg = e instanceof Error ? e.message : String(e);
          if (!topError) topError = msg;
          recipients.push({ type: "merchant", name: String(m.merchant_name ?? ""), email: String(m.email), status: "failed", error: msg });
        }
      }

      projectDetails.push({
        project_id: p.project_id,
        project_name: p.project_name,
        project_serial: p.project_serial,
        to_date: toDate,
        days_left: daysLeft,
        recipients,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logBatch(source, "error", startedAt,
      `projects:${projectsFound} sent:${sent} skipped:${skipped} failed:${failed}`, msg,
      { projects: projectDetails });
    throw e;
  }

  const summary = `projects:${projectsFound} / sent:${sent} / skipped:${skipped} / failed:${failed}`;
  await logBatch(source, failed > 0 ? "error" : "ok", startedAt, summary, topError,
    projectDetails.length ? { projects: projectDetails } : null);

  return { sent, skipped, failed };
}

// 매시간 체크 (email_logs 로 dedupe 되어 하루 1회만 실제 발송됨)
// 서버 재시작에도 강건: 같은 날 이미 발송한 항목은 알아서 skip
export function scheduleProjectEndingNotifications(): void {
  const HOUR = 60 * 60 * 1000;
  const tick = async () => {
    try {
      const r = await runProjectEndingNotifications();
      if (r.sent || r.failed) {
        console.log(`[project-ending] sent=${r.sent} skipped=${r.skipped} failed=${r.failed}`);
      }
    } catch (e) {
      console.error("[project-ending] error:", e);
    }
  };
  // 서버 부팅 직후 60초 후 1회, 이후 매시간
  setTimeout(tick, 60_000);
  setInterval(tick, HOUR);
}
