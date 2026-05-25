import crypto from "crypto";

function secret(): string {
  return process.env.QUOTE_TOKEN_SECRET ?? process.env.SESSION_SECRET ?? "tracker_secret";
}

export function makeQuoteToken(projectId: number, hostId: number): string {
  return crypto.createHmac("sha256", secret()).update(`${projectId}:${hostId}`).digest("hex");
}

export function verifyQuoteToken(projectId: number, hostId: number, token: string): boolean {
  try {
    const expected = makeQuoteToken(projectId, hostId);
    if (token.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
