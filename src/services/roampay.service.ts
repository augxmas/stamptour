import crypto from "node:crypto";
import { publicBaseUrl } from "./qr.service";

export type RoampayMerchantPayload = Record<string, unknown>;

export type RoampaySendResult = {
  ok: boolean;
  statusCode: number | null;
  attempts: number;
  responseText: string;
  responseJson: unknown | null;
  error?: string;
};

function requiredEnv(name: string): string {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name}_missing`);
  return value;
}

function stampHeaders(rawBody: string): Record<string, string> {
  const secret = requiredEnv("STAMP_PARTNER_SECRET");
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const bodyHash = crypto.createHash("sha256").update(rawBody, "utf8").digest("hex");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}:${nonce}:${bodyHash}`, "utf8")
    .digest("hex");

  return {
    "content-type": "application/json",
    "x-stamp-timestamp": timestamp,
    "x-stamp-nonce": nonce,
    "x-stamp-signature": signature,
  };
}

async function postOnce(url: string, rawBody: string, timeoutMs: number): Promise<Omit<RoampaySendResult, "attempts">> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: stampHeaders(rawBody),
      body: rawBody,
      signal: controller.signal,
    });
    const responseText = await response.text();
    let responseJson: unknown | null = null;
    if (responseText) {
      try { responseJson = JSON.parse(responseText); } catch (_) { responseJson = null; }
    }
    return {
      ok: response.ok,
      statusCode: response.status,
      responseText,
      responseJson,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error: any) {
    return {
      ok: false,
      statusCode: null,
      responseText: "",
      responseJson: null,
      error: error?.name === "AbortError" ? "timeout" : String(error?.message || error),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function sendMerchantApprovalRequest(payload: RoampayMerchantPayload): Promise<RoampaySendResult> {
  return sendRoampayRequest(payload);
}

export async function sendRoampayRequest(payload: RoampayMerchantPayload): Promise<RoampaySendResult> {
  const url = requiredEnv("ROAMPAY_API_URL");
  const rawBody = JSON.stringify(payload);

  let last: Omit<RoampaySendResult, "attempts"> | null = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    last = await postOnce(url, rawBody, 10_000);
    if (last.ok || last.statusCode !== null) {
      return { ...last, attempts: attempt };
    }
  }

  return {
    ...(last ?? { ok: false, statusCode: null, responseText: "", responseJson: null, error: "no_response" }),
    attempts: 2,
  };
}

export function absoluteUploadUrl(pathOrUrl?: string | null): string | null {
  if (!pathOrUrl) return null;
  const value = String(pathOrUrl);
  if (/^https?:\/\//i.test(value)) return value;
  const norm = value.replace(/\\/g, "/");
  const idx = norm.lastIndexOf("/uploads/");
  const uploadUrl = idx >= 0 ? norm.slice(idx) : (norm.includes("uploads/") ? `/${norm.slice(norm.indexOf("uploads/"))}` : norm);
  return `${publicBaseUrl()}${uploadUrl.startsWith("/") ? "" : "/"}${uploadUrl}`;
}
