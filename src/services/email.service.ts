import path from "node:path";
import nodemailer from "nodemailer";
import pool from "../config/database";
import { makeQuoteToken } from "../utils/quote-token";

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.worksmobile.com",
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: true,
    auth: {
      user: process.env.SMTP_USER ?? "",
      pass: process.env.SMTP_PASS ?? "",
    },
  });
}

function baseCompanyInfo(sealCid?: string): string {
  const ceo = process.env.COMPANY_CEO ?? "김창호";
  const sealImg = sealCid
    ? ` <img src="cid:${sealCid}" alt="인감" style="height:42px;vertical-align:middle;margin-left:6px;">`
    : "";
  return [
    `${process.env.COMPANY_NAME ?? "(주)모노라마"}`,
    `대표: ${ceo}${sealImg}`,
    `사업자등록번호: ${process.env.COMPANY_BIZ_NO ?? "277-86-00185"}`,
    `입금은행: ${process.env.COMPANY_BANK_NAME ?? "국민은행"}`,
    `계좌번호: ${process.env.COMPANY_BANK_ACCOUNT ?? "000-000-000000"}`,
  ].join("<br>");
}

export async function sendEmail(params: {
  templateKey: string;
  to: string;
  subject: string;
  html: string;
  projectId?: number;
  hostId?: number;
  attachments?: nodemailer.SendMailOptions["attachments"];
}): Promise<void> {
  let status: "sent" | "failed" = "sent";
  let error = "";

  try {
    await getTransporter().sendMail({
      from: `\"${process.env.SMTP_FROM_NAME ?? "(주)모노라마"}\" <${process.env.SMTP_FROM ?? process.env.SMTP_USER ?? ""}>`,
      to: params.to,
      subject: params.subject,
      html: params.html,
      attachments: params.attachments,
    });
  } catch (err) {
    status = "failed";
    error = err instanceof Error ? err.message : "unknown_error";
  }

  await pool.execute(
    `INSERT INTO email_logs (template_key, to_email, subject, project_id, host_id, status, error_msg)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [params.templateKey, params.to, params.subject, params.projectId ?? null, params.hostId ?? null, status, error || null],
  );

  if (status === "failed") {
    throw new Error(error);
  }
}

export async function sendEmailVerifyCode(email: string, code: string, actionUrl?: string): Promise<void> {
  const actionBtn = actionUrl ? `
      <div style="text-align:center;margin:0 0 8px;">
        <a href="${actionUrl}" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:11px 24px;border-radius:8px;font-size:14px;font-weight:600;display:inline-block;">인증코드 자동입력하기 →</a>
        <div style="margin-top:6px;font-size:11px;color:#94a3b8;">버튼을 누르면 가입 화면에서 인증코드가 자동 입력·확인됩니다.</div>
      </div>` : "";
  await sendEmail({
    templateKey: "email_verify",
    to: email,
    subject: "[모노라마] 이메일 인증 코드",
    html: `<div style="font-family:'Malgun Gothic',sans-serif;max-width:480px;">
      <h3 style="color:#2563eb;">이메일 인증 코드</h3>
      <p>아래 6자리 코드를 인증코드 입력란에 입력해 주세요.</p>
      <div style="text-align:center;margin:24px 0;">
        <div style="display:inline-block;background:#f1f5f9;border:2px dashed #cbd5e1;border-radius:12px;padding:18px 32px;">
          <div style="font-size:34px;font-weight:700;letter-spacing:14px;color:#1e293b;font-family:'Courier New',monospace;user-select:all;-webkit-user-select:all;-moz-user-select:all;">${code}</div>
        </div>
        <div style="margin-top:10px;font-size:12px;color:#94a3b8;">위 코드를 길게 누르거나 드래그하여 선택한 뒤 복사할 수 있습니다.</div>
      </div>
      ${actionBtn}
      <p style="color:#64748b;font-size:13px;">유효시간은 10분입니다. 본인이 요청하지 않았다면 이 메일을 무시하세요.</p>    </div>`,
  });
}

export async function sendProjectPinEmail(hostEmail: string, hostName: string, pin: string, hostId: number): Promise<void> {
  await sendEmail({
    templateKey: "project_pin",
    to: hostEmail,
    subject: "[모노라마] Gift 승인 비밀번호",
    html: `<div style="font-family:'Malgun Gothic',sans-serif;max-width:480px;">
      <h3 style="color:#2563eb;">Gift 승인 비밀번호</h3>
      <p>${hostName} 담당자님, 아래 6자리 비밀번호는 Gift 결제 승인 시 사용됩니다.</p>
      <div style="text-align:center;margin:24px 0;">
        <div style="display:inline-block;background:#fff7ed;border:2px dashed #fed7aa;border-radius:12px;padding:18px 32px;">
          <div onclick="if(navigator.clipboard){navigator.clipboard.writeText('${pin}').then(function(){var b=document.getElementById('cpbtn_pin');if(b)b.textContent='✓ 복사됨';})}"
               style="font-size:34px;font-weight:700;letter-spacing:14px;color:#1e293b;font-family:'Courier New',monospace;cursor:pointer;user-select:all;-webkit-user-select:all;">${pin}</div>
          <div style="margin-top:10px;">
            <a href="javascript:void(0)"
               id="cpbtn_pin"
               onclick="if(navigator.clipboard){navigator.clipboard.writeText('${pin}').then(function(){document.getElementById('cpbtn_pin').textContent='✓ 복사됨';});return false;}"
               style="background:#ea580c;color:#ffffff;text-decoration:none;padding:7px 18px;border-radius:6px;font-size:13px;display:inline-block;cursor:pointer;">
              &#128203; 복사하기
            </a>
          </div>
        </div>
      </div>
      <p style="color:#dc2626;font-size:13px;font-weight:600;">※ 별도로 메모하여 안전하게 보관하십시오.</p>
      <p style="color:#64748b;font-size:13px;">유효시간은 10분입니다.</p>    </div>`,
    hostId,
  });
}

export async function sendSupervisorNewHostNotification(params: {
  hostName: string;
  hostEmail: string;
  organizationName: string | null;
  bizNo: string | null;
  hostId: number;
}): Promise<void> {
  const supervisorEmail = process.env.SUPERVISOR_EMAIL ?? "";
  if (!supervisorEmail) return;

  const baseUrl = process.env.BASE_URL ?? "http://localhost:5000";
  const reviewLink = `${baseUrl}/supervisor?tab=hosts`;
  const bizNoFormatted = params.bizNo
    ? params.bizNo.replace(/^(\d{3})(\d{2})(\d{5})$/, "$1-$2-$3")
    : "-";

  await sendEmail({
    templateKey: "supervisor_new_host",
    to: supervisorEmail,
    subject: "[모노라마 트래커] 신규 Host 가입 신청 확인 요청",
    html: `<div style="font-family:'Malgun Gothic',sans-serif;max-width:560px;">
      <h2 style="color:#2563eb;">신규 Host 가입 신청</h2>
      <p>새로운 Host 가입 신청이 접수되었습니다. 아래 내용을 확인하고 승인 또는 취소 처리해 주세요.</p>
      <table border="1" cellpadding="10" cellspacing="0" style="border-collapse:collapse;width:100%;margin:16px 0;">
        <tr><td style="background:#f8fafc;font-weight:600;">담당자명</td><td>${params.hostName}</td></tr>
        <tr><td style="background:#f8fafc;font-weight:600;">이메일</td><td>${params.hostEmail}</td></tr>
        <tr><td style="background:#f8fafc;font-weight:600;">소속기관</td><td>${params.organizationName ?? "-"}</td></tr>
        <tr><td style="background:#f8fafc;font-weight:600;">사업자등록번호</td><td>${bizNoFormatted}</td></tr>
      </table>
      <p style="margin:20px 0;">
        <a href="${reviewLink}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
          가입 신청 확인하기 →
        </a>
      </p>    </div>`,
    hostId: params.hostId,
  });
}

export async function sendHostRegistrationEmail(hostEmail: string, hostName: string, hostId: number): Promise<void> {
  await sendEmail({
    templateKey: "host_registration_submitted",
    to: hostEmail,
    subject: "[모노라마] 회원가입 신청이 완료되었습니다",
    html: `<div><h3>회원가입 신청 완료</h3><p>${hostName}님, 회원가입 신청이 접수되었습니다.</p><p>관리자 승인 후 로그인이 가능합니다. 승인 완료 시 이메일로 안내 드리겠습니다.</p></div>`,
    hostId,
  });
}

export async function sendHostStatusEmail(hostEmail: string, hostName: string, status: string, reason: string, hostId: number): Promise<void> {
  const subjects: Record<string, string> = {
    approved: "[모노라마] 회원가입이 승인되었습니다",
    cancelled: "[모노라마] 회원가입 신청이 취소되었습니다",
    terminated: "[모노라마] 계정이 종료되었습니다",
  };
  const bodies: Record<string, string> = {
    approved: `<p>${hostName}님, 회원가입이 승인되었습니다. 이제 로그인하여 서비스를 이용하실 수 있습니다.</p>`,
    cancelled: `<p>${hostName}님, 회원가입 신청이 취소되었습니다.${reason ? `<br>사유: ${reason}` : ""}</p>`,
    terminated: `<p>${hostName}님, 계정이 종료되었습니다.${reason ? `<br>사유: ${reason}` : ""}</p>`,
  };
  await sendEmail({
    templateKey: `host_status_${status}`,
    to: hostEmail,
    subject: subjects[status] ?? `[모노라마] 계정 상태 변경 안내`,
    html: `<div><h3>계정 상태 변경 안내</h3>${bodies[status] ?? ""}</div>`,
    hostId,
  });
}

export async function sendHostTempPasswordEmail(hostEmail: string, hostName: string, tempPassword: string, hostId: number): Promise<void> {
  await sendEmail({
    templateKey: "host_temp_password",
    to: hostEmail,
    subject: "[모노라마] 임시 비밀번호 안내",
    html: `<div><h3>임시 비밀번호 안내</h3><p>${hostName}님, 요청하신 임시 비밀번호입니다.</p><p style="font-size:22px;font-weight:bold;letter-spacing:4px;">${tempPassword}</p><p>로그인 후 반드시 비밀번호를 변경해 주세요.</p></div>`,
    hostId,
  });
}

export async function sendSupervisorQuoteNotification(params: {
  hostName: string;
  hostEmail: string;
  projectName: string;
  projectSerial: string;
  fromDate: string;
  toDate: string;
  days: number;
  total: number;
  projectId: number;
  hostId: number;
}): Promise<void> {
  const supervisorEmail = process.env.SUPERVISOR_EMAIL ?? "";
  if (!supervisorEmail) return;

  const baseUrl = process.env.BASE_URL ?? "http://localhost:5000";
  const reviewLink = `${baseUrl}/supervisor?tab=projects`;

  await sendEmail({
    templateKey: "supervisor_quote_sent",
    to: supervisorEmail,
    subject: `[모노라마 트래커] 견적서 발송 알림 - ${params.projectName}`,
    html: `<div style="font-family:'Malgun Gothic',sans-serif;max-width:560px;">
      <h2 style="color:#2563eb;">견적서 발송 알림</h2>
      <p>아래 프로젝트에 대한 견적서가 담당자에게 발송되었습니다.</p>
      <table border="1" cellpadding="10" cellspacing="0" style="border-collapse:collapse;width:100%;margin:16px 0;">
        <tr><td style="background:#f8fafc;font-weight:600;">프로젝트명</td><td>${params.projectName}</td></tr>
        <tr><td style="background:#f8fafc;font-weight:600;">일련번호</td><td>${params.projectSerial}</td></tr>
        <tr><td style="background:#f8fafc;font-weight:600;">담당자</td><td>${params.hostName} (${params.hostEmail})</td></tr>
        <tr><td style="background:#f8fafc;font-weight:600;">기간</td><td>${params.fromDate} ~ ${params.toDate} (${params.days}일)</td></tr>
        <tr><td style="background:#f8fafc;font-weight:600;">견적 총액</td><td><b>${params.total.toLocaleString()}원</b></td></tr>
      </table>
      <p style="margin:20px 0;">
        <a href="${reviewLink}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
          프로젝트 목록 확인하기 →
        </a>
      </p>    </div>`,
    projectId: params.projectId,
    hostId: params.hostId,
  });
}

export async function sendQuoteEmail(input: {
  hostEmail: string;
  hostName: string;
  projectName: string;
  projectSerial: string;
  fromDate: string;
  toDate: string;
  days: number;
  total: number;
  usageFee: number;
  mobileDesignFee: number;
  faviconFee: number;
  initialSetupFee: number;
  projectId: number;
  hostId: number;
  requoteNote?: string;
}): Promise<void> {
  // 견적서 확인 링크는 호스트가 메일 클라이언트에서 클릭하므로 공개 도메인으로 보낸다.
  // .env DOMAIN 이 비어있을 때만 BASE_URL(개발용)로 폴백한다.
  const publicBase = process.env.DOMAIN
    ? `https://${process.env.DOMAIN}`
    : (process.env.BASE_URL ?? "http://localhost:5000");
  const token = makeQuoteToken(input.projectId, input.hostId);
  const confirmUrl = `${publicBase}/api/host/projects/${input.projectId}/confirm-quote?token=${token}&host_id=${input.hostId}`;
  const sealPath = path.join(process.cwd(), "public", "image", "모노라마_인감증명.png");

  await sendEmail({
    templateKey: "project_quote",
    to: input.hostEmail,
    subject: input.requoteNote
      ? `[모노라마] 재견적서 - ${input.projectName}`
      : `[모노라마] 견적서 - ${input.projectName}`,
    html: `<div style="font-family:'Malgun Gothic',sans-serif;max-width:560px;">
      <h2 style="color:#2563eb;">${input.requoteNote ? '프로젝트 재견적서' : '프로젝트 견적서'}</h2>
      ${input.requoteNote ? `<div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:8px;padding:12px 14px;margin:12px 0;font-size:13px;line-height:1.6;">${input.requoteNote}</div>` : ''}
      <p>${input.hostName}님, 요청하신 견적 내역입니다.</p>
      <table border="1" cellpadding="10" cellspacing="0" style="border-collapse:collapse;width:100%;margin:16px 0;">
        <tr><td style="background:#f8fafc;font-weight:600;">프로젝트명</td><td>${input.projectName}</td></tr>
        <tr><td style="background:#f8fafc;font-weight:600;">일련번호</td><td>${input.projectSerial}</td></tr>
        <tr><td style="background:#f8fafc;font-weight:600;">기간</td><td>${input.fromDate} ~ ${input.toDate} (${input.days}일)</td></tr>
        <tr style="border-top:2px solid #cbd5e1;"><td colspan="2" style="background:#f0f9ff;font-weight:600;font-size:13px;">견적 내역</td></tr>
        <tr><td style="padding-left:20px;">이용료 (${input.days}일 × ${Math.round(input.usageFee / input.days).toLocaleString()}원)</td><td style="text-align:right;">${input.usageFee.toLocaleString()}원</td></tr>
        <tr><td style="padding-left:20px;">모바일 디자인</td><td style="text-align:right;">${input.mobileDesignFee.toLocaleString()}원</td></tr>
        <tr><td style="padding-left:20px;">파비콘</td><td style="text-align:right;">${input.faviconFee.toLocaleString()}원</td></tr>
        <tr><td style="padding-left:20px;">초기 세팅</td><td style="text-align:right;">${input.initialSetupFee.toLocaleString()}원</td></tr>
        <tr style="background:#1e293b;color:#fff;"><td style="font-weight:700;font-size:15px;">합계</td><td style="text-align:right;font-weight:700;font-size:15px;">${(input.usageFee + input.mobileDesignFee + input.faviconFee + input.initialSetupFee).toLocaleString()}원</td></tr>
      </table>
      <p style="font-size:13px;color:#64748b;">※ 추가 디자인 시안은 별도 견적입니다.</p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${confirmUrl}" style="background:#16a34a;color:#fff;padding:13px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">
          ✓ 견적서를 확인했습니다
        </a>
        <p style="margin-top:8px;font-size:12px;color:#94a3b8;">버튼을 클릭하시면 견적서 확인으로 처리됩니다.</p>
      </div>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">
      <p style="font-size:12px;color:#94a3b8;line-height:1.7;">${baseCompanyInfo("mono_seal")}</p>
    </div>`,
    projectId: input.projectId,
    hostId: input.hostId,
    attachments: [
      { filename: "인감.png", path: sealPath, cid: "mono_seal" },
      { filename: "사업자등록증.pdf", path: path.join(process.cwd(), "public", "image", "사업자등록증(강서구마곡)_주식회사모노라마.pdf") },
      { filename: "통장사본.pdf", path: path.join(process.cwd(), "public", "image", "모노라마_법인_우리은행_1005802852258통장사본.pdf") },
    ],
  });
}

// ── 가맹점(merchant) 메일 ──
export async function sendMerchantRegistrationEmail(email: string, name: string): Promise<void> {
  await sendEmail({
    templateKey: "merchant_registration_submitted",
    to: email,
    subject: "[모노라마] 가맹점 가입 신청이 완료되었습니다",
    html: `<div style="font-family:'Malgun Gothic',sans-serif;max-width:480px;">
      <h3 style="color:#2563eb;">가맹점 가입 신청 완료</h3>
      <p>${name} 가맹점님, 가입 신청이 접수되었습니다.</p>
      <p>관리자(supervisor) 승인 후 로그인이 가능합니다. 승인 완료 시 이메일로 안내 드리겠습니다.</p>    </div>`,
  });
}

export async function sendMerchantTempPasswordEmail(email: string, name: string, tempPassword: string): Promise<void> {
  await sendEmail({
    templateKey: "merchant_temp_password",
    to: email,
    subject: "[모노라마] 임시 비밀번호 안내",
    html: `<div style="font-family:'Malgun Gothic',sans-serif;max-width:480px;">
      <h3 style="color:#2563eb;">임시 비밀번호 안내</h3>
      <p>${name} 가맹점님, 요청하신 임시 비밀번호입니다.</p>
      <div style="text-align:center;margin:20px 0;">
        <div style="display:inline-block;background:#f1f5f9;border:2px dashed #cbd5e1;border-radius:12px;padding:16px 28px;">
          <div style="font-size:24px;font-weight:700;letter-spacing:3px;color:#1e293b;font-family:'Courier New',monospace;user-select:all;-webkit-user-select:all;-moz-user-select:all;">${tempPassword}</div>
        </div>
      </div>
      <p style="color:#dc2626;font-size:13px;font-weight:600;">※ 로그인 후 반드시 새 비밀번호로 변경해 주세요.</p>    </div>`,
  });
}

export async function sendSupervisorNewMerchantNotification(params: {
  merchantName: string;
  email: string;
  bizNo: string | null;
  bankName: string | null;
}): Promise<void> {
  const supervisorEmail = process.env.SUPERVISOR_EMAIL ?? "";
  if (!supervisorEmail) return;

  const baseUrl = process.env.BASE_URL ?? "http://localhost:5000";
  const reviewLink = `${baseUrl}/supervisor?tab=merchants`;
  const bizNoFormatted = params.bizNo
    ? params.bizNo.replace(/^(\d{3})(\d{2})(\d{5})$/, "$1-$2-$3")
    : "-";

  await sendEmail({
    templateKey: "supervisor_new_merchant",
    to: supervisorEmail,
    subject: "[모노라마 트래커] 신규 가맹점 가입 신청 확인 요청",
    html: `<div style="font-family:'Malgun Gothic',sans-serif;max-width:560px;">
      <h2 style="color:#2563eb;">신규 가맹점 가입 신청</h2>
      <p>새로운 가맹점 가입 신청이 접수되었습니다. 아래 내용을 확인하고 승인 또는 취소 처리해 주세요.</p>
      <table border="1" cellpadding="10" cellspacing="0" style="border-collapse:collapse;width:100%;margin:16px 0;">
        <tr><td style="background:#f8fafc;font-weight:600;">가맹점명</td><td>${params.merchantName}</td></tr>
        <tr><td style="background:#f8fafc;font-weight:600;">이메일</td><td>${params.email}</td></tr>
        <tr><td style="background:#f8fafc;font-weight:600;">사업자등록번호</td><td>${bizNoFormatted}</td></tr>
        <tr><td style="background:#f8fafc;font-weight:600;">은행</td><td>${params.bankName ?? "-"}</td></tr>
      </table>
      <p style="margin:20px 0;">
        <a href="${reviewLink}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
          가입 신청 확인하기 →
        </a>
      </p>    </div>`,
  });
}

export async function sendProjectSupportRequestEmail(hostEmail: string, hostName: string, projectName: string, projectSerial: string): Promise<void> {
  await sendEmail({
    templateKey: "project_support_request",
    to: hostEmail,
    subject: `[모노라마 트래커] 가맹점 프로젝트 지원 요청 - ${projectName}`,
    html: `<div style="font-family:'Malgun Gothic',sans-serif;max-width:560px;">
      <h2 style="color:#2563eb;">가맹점 프로젝트 지원 요청</h2>
      <p>${hostName} 담당자님,</p>
      <p>아래 프로젝트에 <b>가맹점의 지원(참여) 요청</b>이 접수되었습니다.</p>
      <table border="1" cellpadding="10" cellspacing="0" style="border-collapse:collapse;width:100%;margin:16px 0;">
        <tr><td style="background:#f8fafc;font-weight:600;width:120px;">프로젝트명</td><td>${projectName}</td></tr>
        <tr><td style="background:#f8fafc;font-weight:600;">일련번호</td><td>${projectSerial}</td></tr>
      </table>
      <p style="font-size:13px;color:#64748b;">자세한 내용은 운영자(supervisor)에게 문의해 주세요.</p>    </div>`,
  });
}

// 가맹점 프로젝트 지원에 대한 host의 승인/거절 결과 메일 (승인 시 프로젝트 비밀번호 동봉)
export async function sendMerchantApplicationDecisionEmail(params: {
  email: string;
  merchantName: string;
  projectName: string;
  projectSerial: string;
  decision: "approved" | "rejected";
  reason?: string;
  pin?: string | null;
}): Promise<void> {
  const approved = params.decision === "approved";
  const reasonRow = params.reason
    ? `<tr><td style="background:#f8fafc;font-weight:600;width:120px;">사유</td><td>${params.reason}</td></tr>`
    : "";

  const pinBlock = approved && params.pin
    ? `<div style="margin:20px 0;padding:16px 18px;background:#fff7ed;border:2px dashed #fed7aa;border-radius:12px;">
         <div style="font-size:14px;color:#9a3412;font-weight:700;margin-bottom:8px;">Gift 승인 비밀번호</div>
         <div style="font-size:30px;font-weight:700;letter-spacing:12px;color:#1e293b;font-family:'Courier New',monospace;text-align:center;user-select:all;-webkit-user-select:all;-moz-user-select:all;">${params.pin}</div>
         <div style="margin-top:12px;font-size:13px;color:#7c2d12;line-height:1.6;">방문자가 모든 목적지를 방문한 뒤 Gift 결제를 요청하면, 가맹점에서 위 <b>Gift 승인 비밀번호</b>를 입력하여 결제를 승인합니다.</div>
         <div style="margin-top:6px;font-size:13px;color:#dc2626;font-weight:700;">※ 비밀번호를 꼭 기억하시고, 별도로 메모하여 안전하게 보관해 주세요.</div>
       </div>`
    : (approved
        ? `<p style="color:#dc2626;font-size:13px;">※ 본 프로젝트의 Gift 승인 비밀번호는 시스템에 별도 저장되어 있지 않습니다. 운영자(supervisor)에게 문의해 주세요.</p>`
        : "");

  await sendEmail({
    templateKey: `merchant_application_${params.decision}`,
    to: params.email,
    subject: approved
      ? `[모노라마] 프로젝트 참여가 승인되었습니다 - ${params.projectName}`
      : `[모노라마] 프로젝트 참여 신청 결과 안내 - ${params.projectName}`,
    html: `<div style="font-family:'Malgun Gothic',sans-serif;max-width:560px;">
      <h2 style="color:${approved ? "#16a34a" : "#dc2626"};">프로젝트 참여 ${approved ? "승인" : "반려"} 안내</h2>
      <p>${params.merchantName} 가맹점님,</p>
      <p>지원하신 아래 프로젝트의 참여가 <b>${approved ? "승인" : "반려"}</b>되었습니다.</p>
      <table border="1" cellpadding="10" cellspacing="0" style="border-collapse:collapse;width:100%;margin:16px 0;">
        <tr><td style="background:#f8fafc;font-weight:600;width:120px;">프로젝트명</td><td>${params.projectName}</td></tr>
        <tr><td style="background:#f8fafc;font-weight:600;">일련번호</td><td>${params.projectSerial}</td></tr>
        ${reasonRow}
      </table>
      ${pinBlock}    </div>`,
  });
}

// 가맹점이 프로젝트에 지원하면 host(주최)에게 알림 (/admin 지원현황에서 검토)
export async function sendHostNewApplicationEmail(params: {
  hostEmail: string;
  hostName: string;
  merchantName: string;
  projectName: string;
  projectSerial: string;
}): Promise<void> {
  const baseUrl = process.env.BASE_URL ?? "http://localhost:5000";
  const reviewLink = `${baseUrl}/admin`;
  await sendEmail({
    templateKey: "host_new_application",
    to: params.hostEmail,
    subject: `[모노라마 트래커] 가맹점 프로젝트 지원 신청 - ${params.projectName}`,
    html: `<div style="font-family:'Malgun Gothic',sans-serif;max-width:560px;">
      <h2 style="color:#2563eb;">가맹점 프로젝트 지원 신청</h2>
      <p>${params.hostName} 담당자님,</p>
      <p>아래 프로젝트에 <b>${params.merchantName}</b> 가맹점이 참여를 신청했습니다.</p>
      <table border="1" cellpadding="10" cellspacing="0" style="border-collapse:collapse;width:100%;margin:16px 0;">
        <tr><td style="background:#f8fafc;font-weight:600;width:120px;">프로젝트명</td><td>${params.projectName}</td></tr>
        <tr><td style="background:#f8fafc;font-weight:600;">일련번호</td><td>${params.projectSerial}</td></tr>
        <tr><td style="background:#f8fafc;font-weight:600;">지원 가맹점</td><td>${params.merchantName}</td></tr>
      </table>
      <p style="margin:20px 0;">
        <a href="${reviewLink}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
          내 프로젝트에서 검토하기 →
        </a>
      </p>
      <p style="font-size:13px;color:#64748b;">'내 프로젝트'의 <b>지원현황</b> 버튼에서 승인 또는 거절할 수 있습니다.</p>    </div>`,
  });
}

export async function sendMerchantStatusEmail(email: string, name: string, status: string, reason: string): Promise<void> {
  const subjects: Record<string, string> = {
    approved: "[모노라마] 가맹점 가입이 승인되었습니다",
    cancelled: "[모노라마] 가맹점 가입 신청이 취소되었습니다",
    terminated: "[모노라마] 가맹점 계정이 종료되었습니다",
  };
  const bodies: Record<string, string> = {
    approved: `<p>${name} 가맹점님, 가입이 승인되었습니다. 이제 로그인하여 서비스를 이용하실 수 있습니다.</p>`,
    cancelled: `<p>${name} 가맹점님, 가입 신청이 취소되었습니다.${reason ? `<br>사유: ${reason}` : ""}</p>`,
    terminated: `<p>${name} 가맹점님, 계정이 종료되었습니다.${reason ? `<br>사유: ${reason}` : ""}</p>`,
  };
  await sendEmail({
    templateKey: `merchant_status_${status}`,
    to: email,
    subject: subjects[status] ?? "[모노라마] 가맹점 상태 변경 안내",
    html: `<div><h3>가맹점 상태 변경 안내</h3>${bodies[status] ?? ""}</div>`,
  });
}
