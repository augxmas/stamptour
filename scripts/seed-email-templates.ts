// @ts-nocheck
// 이메일 양식 기본값 시드 — 시스템에서 사용 중인 모든 templateKey 등록
//   실행: npx ts-node scripts/seed-email-templates.ts
import pool from "../src/config/database";

const templates = [
  { key: "email_verify",                description: "회원가입 이메일 인증 코드",          subject: "[모노라마] 이메일 인증 코드",                                 vars: ["code","actionUrl"] },
  { key: "project_pin",                 description: "Gift 승인 비밀번호 안내",            subject: "[모노라마] Gift 승인 비밀번호",                              vars: ["hostName","pin"] },
  { key: "supervisor_new_host",         description: "신규 Host 가입 확인 (관리자)",       subject: "[모노라마 트래커] 신규 Host 가입 신청 확인 요청",            vars: ["hostName","hostEmail","organizationName"] },
  { key: "host_registration_submitted", description: "Host 가입 신청 완료",                subject: "[모노라마] 회원가입 신청이 완료되었습니다",                  vars: ["hostName"] },
  { key: "host_status_approved",        description: "Host 승인 알림",                      subject: "[모노라마] 회원가입 승인 안내",                              vars: ["hostName"] },
  { key: "host_status_rejected",        description: "Host 거절 알림",                      subject: "[모노라마] 회원가입 거절 안내",                              vars: ["hostName","reason"] },
  { key: "host_status_locked",          description: "Host 계정 잠금 알림",                 subject: "[모노라마] 계정 잠금 안내",                                  vars: ["hostName","reason"] },
  { key: "host_status_terminated",      description: "Host 계정 종료 알림",                 subject: "[모노라마] 계정 종료 안내",                                  vars: ["hostName","reason"] },
  { key: "host_temp_password",          description: "Host 임시 비밀번호 발급",             subject: "[모노라마] 임시 비밀번호 안내",                              vars: ["hostName","tempPassword"] },
  { key: "supervisor_quote_sent",       description: "견적서 발송 알림 (관리자)",           subject: "[모노라마 트래커] 견적서 발송 알림",                         vars: ["projectName","projectSerial","total","hostName"] },
  { key: "project_quote",               description: "프로젝트 견적서",                     subject: "[모노라마] 프로젝트 견적서",                                 vars: ["projectName","projectSerial","total","days","fromDate","toDate"] },
  { key: "merchant_registration_submitted", description: "가맹점 가입 신청 완료",            subject: "[모노라마] 가맹점 가입 신청이 접수되었습니다",                vars: ["merchantName","contactName"] },
  { key: "merchant_temp_password",      description: "가맹점 임시 비밀번호 발급",            subject: "[모노라마] 가맹점 임시 비밀번호",                            vars: ["merchantName","tempPassword"] },
  { key: "supervisor_new_merchant",     description: "신규 가맹점 가입 확인 (관리자)",       subject: "[모노라마 트래커] 신규 가맹점 가입 신청",                    vars: ["merchantName","bizNo","contactName"] },
  { key: "project_support_request",     description: "프로젝트 지원 요청 (관리자→호스트)",   subject: "[모노라마 트래커] 프로젝트 지원 검토 요청",                  vars: ["hostName","projectName"] },
  { key: "merchant_application_approved", description: "가맹점 지원 승인",                   subject: "[모노라마] 프로젝트 지원이 승인되었습니다",                   vars: ["merchantName","projectName","supportType","pin"] },
  { key: "merchant_application_rejected", description: "가맹점 지원 거절",                   subject: "[모노라마] 프로젝트 지원이 거절되었습니다",                   vars: ["merchantName","projectName","reason"] },
  { key: "host_new_application",        description: "신규 가맹점 지원 알림 (호스트)",        subject: "[모노라마] 신규 가맹점 지원 알림",                            vars: ["hostName","merchantName","projectName"] },
  { key: "merchant_status_approved",    description: "가맹점 계정 승인",                     subject: "[모노라마] 가맹점 계정 승인 안내",                            vars: ["merchantName"] },
  { key: "merchant_status_rejected",    description: "가맹점 계정 거절",                     subject: "[모노라마] 가맹점 계정 거절 안내",                            vars: ["merchantName","reason"] },
  { key: "merchant_status_locked",      description: "가맹점 계정 잠금",                     subject: "[모노라마] 가맹점 계정 잠금 안내",                            vars: ["merchantName","reason"] },
  { key: "merchant_status_terminated",  description: "가맹점 계정 종료",                     subject: "[모노라마] 가맹점 계정 종료 안내",                            vars: ["merchantName","reason"] },
];

function defaultBody(t) {
  return `<div style="font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;max-width:520px;margin:0 auto;padding:20px;">
  <h2 style="color:#1d4ed8;border-bottom:2px solid #1d4ed8;padding-bottom:8px;">${t.description || t.key}</h2>
  <p>안녕하세요${t.vars && t.vars.includes('hostName') ? ', {hostName} 님' : t.vars && t.vars.includes('merchantName') ? ', {merchantName} 님' : ''}.</p>
  <p>본 메일은 모노라마 트래커 시스템에서 자동 발송되는 ${t.description || t.key} 안내 메일입니다.</p>
  ${t.vars && t.vars.length ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin:14px 0;font-size:13px;">
    <b style="color:#475569;">사용 가능한 변수</b><br>
    ${t.vars.map(v => `<code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;margin-right:6px;">{${v}}</code>`).join('')}
  </div>` : ''}
  <p style="color:#64748b;font-size:12px;margin-top:24px;border-top:1px solid #e2e8f0;padding-top:12px;">
    ※ 이 메일은 자동 발송되므로 회신할 수 없습니다.<br>
    (주)모노라마 · tracker.mono-rama.com
  </p>
</div>`;
}

async function main() {
  for (const t of templates) {
    const body = defaultBody(t);
    await pool.execute(
      `INSERT INTO email_templates (template_key, description, subject, body_html, variables, is_active)
       VALUES (?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE description=VALUES(description), variables=VALUES(variables), updated_at=NOW()`,
      [t.key, t.description, t.subject, body, JSON.stringify(t.vars || [])],
    );
    console.log(`  ✓ ${t.key} — ${t.description}`);
  }
  const [rows] = await pool.execute("SELECT COUNT(*) AS n FROM email_templates");
  console.log(`\n✅ 시드 완료 — 총 ${(rows as any[])[0].n} 개 양식`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
