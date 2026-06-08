import { Router } from "express";
import { getGiftByToken, useGift } from "../services/gift.service";

const router = Router();

function maskPhone(phone: string): string {
  const s = String(phone || "").replace(/[^0-9]/g, "");
  if (s.length === 11) return `${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7)}`;
  if (s.length === 10) return `${s.slice(0, 3)}-${s.slice(3, 6)}-${s.slice(6)}`;
  return s;
}

// 가맹점이 Gift QR을 스캔 → Gift 정보 조회
router.get("/:token", async (req, res) => {
  const g = await getGiftByToken(req.params.token);
  if (!g) {
    res.status(404).json({ error: "gift_not_found", message: "유효하지 않은 Gift QR입니다." });
    return;
  }
  res.json({
    ok: true,
    status: g.status,            // 'issued' | 'used'
    used_at: g.used_at,
    amount: Number(g.amount),
    project_name: g.project_name,
    project_serial: g.project_serial,
    phone: maskPhone(g.phone),
  });
});

// 가맹점 사용처리: 프로젝트 비밀번호 확인 후 1회만 사용
router.post("/:token/use", async (req, res) => {
  const { pin } = req.body as { pin?: string };
  if (!pin?.trim()) {
    res.status(400).json({ error: "pin_required", message: "비밀번호를 입력해 주세요." });
    return;
  }

  const merchantId = req.session?.merchant?.id ?? null;
  const result = await useGift(req.params.token, pin.trim(), merchantId);
  if (!result.ok) {
    const messages: Record<string, string> = {
      gift_not_found: "유효하지 않은 Gift입니다.",
      already_used: "이미 사용된 Gift입니다.",
      invalid_pin: "비밀번호가 일치하지 않습니다.",
      not_approved_application: "이 프로젝트에 승인된 가맹점이 아닙니다. QR 코드를 승인해 줄 수 없습니다.",
      support_type_mismatch: "지원하지 않는 혜택 유형의 QR 코드입니다. (귀 가맹점은 'Tour+Quiz' 유형을 지원하지 않습니다.) QR 코드를 승인해 줄 수 없습니다.",
    };
    const status = result.error === "already_used" ? 409
      : result.error === "invalid_pin" ? 400
      : result.error === "support_type_mismatch" ? 403
      : result.error === "not_approved_application" ? 403
      : 404;
    res.status(status).json({ error: result.error, message: messages[result.error ?? ""] ?? "사용 처리에 실패했습니다." });
    return;
  }

  res.json({ ok: true, amount: result.amount, message: "Gift가 사용 처리되었습니다." });
});

export default router;
