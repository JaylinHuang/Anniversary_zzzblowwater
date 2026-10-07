/** 收款码下方的短说明，避免一整段字把二维码挤出首屏 */
export const SPONSOR_NOTE_MAX = 80;
/** 单笔登记的备注 */
export const SPONSOR_GIFT_NOTE_MAX = 40;
/** 单笔上限，挡住误填的超大数字 */
export const SPONSOR_YUAN_MAX = 100_000;

export type SponsorCard = {
  qrUrl: string | null;
  note: string;
};

export type SponsorTotal = {
  userId: number;
  displayName: string;
  avatarUrl: string | null;
  totalFen: number;
  count: number;
};

export type SponsorEntry = {
  id: number;
  userId: number;
  displayName: string;
  avatarUrl: string | null;
  amountFen: number;
  note: string;
  createdAt: string;
};

export type SponsorMember = {
  id: number;
  displayName: string;
};

/** 空说明可以，超长就拒绝 */
export function normalizeSponsorNote(raw: unknown): string {
  const note = String(raw ?? "").trim();
  if (note.length > SPONSOR_NOTE_MAX) {
    throw new Error(`说明最多 ${SPONSOR_NOTE_MAX} 字`);
  }
  return note;
}

/** 登记备注可空 */
export function normalizeSponsorGiftNote(raw: unknown): string {
  const note = String(raw ?? "").trim();
  if (note.length > SPONSOR_GIFT_NOTE_MAX) {
    throw new Error(`备注最多 ${SPONSOR_GIFT_NOTE_MAX} 字`);
  }
  return note;
}

/** 把「10」「10.5」「¥10.50」收成以分为单位的整数 */
export function parseSponsorYuan(raw: unknown): number {
  const text = String(raw ?? "")
    .trim()
    .replace(/[¥￥元\s,，]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw new Error("金额请填数字，最多两位小数");
  }
  const [yuan, frac = ""] = text.split(".");
  const fen = Number(yuan) * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isSafeInteger(fen) || fen <= 0) throw new Error("金额要大于 0");
  if (fen > SPONSOR_YUAN_MAX * 100) {
    throw new Error(`单笔最多 ${SPONSOR_YUAN_MAX} 元`);
  }
  return fen;
}

/** 分转成两位小数的元，给页面直接显示 */
export function formatSponsorYuan(fen: number): string {
  const n = Number.isFinite(fen) ? Math.max(0, Math.round(fen)) : 0;
  const yuan = Math.floor(n / 100);
  const cents = n % 100;
  return `${yuan}.${String(cents).padStart(2, "0")}`;
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
