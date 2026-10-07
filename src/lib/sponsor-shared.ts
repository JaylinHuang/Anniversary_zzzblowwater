/** 收款码下方的短说明，避免一整段字把二维码挤出首屏 */
export const SPONSOR_NOTE_MAX = 80;

export type SponsorCard = {
  qrUrl: string | null;
  note: string;
};

/** 空说明可以，超长就拒绝 */
export function normalizeSponsorNote(raw: unknown): string {
  const note = String(raw ?? "").trim();
  if (note.length > SPONSOR_NOTE_MAX) {
    throw new Error(`说明最多 ${SPONSOR_NOTE_MAX} 字`);
  }
  return note;
}

/** 只认常见收款码图片的文件头，扩展名不够 */
export function sponsorImageKind(bytes: Uint8Array): "png" | "jpeg" | "webp" | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}
