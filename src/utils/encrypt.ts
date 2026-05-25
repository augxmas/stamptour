export function encKey(): string {
  return process.env.ENCRYPTION_KEY ?? "tracker_enc_default";
}

// SELECT fragment: fn_decrypt(col, ?) AS alias
export function dec(col: string, alias?: string): string {
  return `fn_decrypt(${col}, ?) AS ${alias ?? col.replace(/\w+\./, "")}`;
}

// INSERT/UPDATE fragment: fn_encrypt(?, ?)
export const ENC = "fn_encrypt(?, ?)";
