/**
 * 「猜说话人」出题纯逻辑：给定正文池与干扰项昵称池，产出四选一。
 * 答案索引不落库到前端明文以外的服务端签名可选；此处用 session 级 token。
 */

export type SpeakerLine = {
  id: number;
  sender: string;
  content: string;
};

export type GuessRound = {
  messageId: number;
  content: string;
  options: string[];
  /** 正确答案在 options 中的下标 */
  answerIndex: number;
};

function shuffleInPlace<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 简单可复现 RNG（mulberry32） */
export function mulberry32(seed: number) {
  return function rng() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildGuessRound(
  lines: SpeakerLine[],
  seed: number,
): GuessRound | null {
  const usable = lines.filter(
    (l) =>
      l.content.trim().length >= 6 &&
      l.content.trim().length <= 120 &&
      !l.content.startsWith("["),
  );
  if (usable.length < 1) return null;

  const rng = mulberry32(seed);
  const pick = usable[Math.floor(rng() * usable.length)];
  const names = [...new Set(usable.map((l) => l.sender))];
  if (names.length < 2) return null;

  const distractors = names.filter((n) => n !== pick.sender);
  shuffleInPlace(distractors, rng);
  const options = [pick.sender, ...distractors.slice(0, 3)];
  // 凑不满 4 个就用已有
  while (options.length < 2) {
    options.push(`神秘群友${options.length}`);
  }
  shuffleInPlace(options, rng);
  const answerIndex = options.indexOf(pick.sender);
  if (answerIndex < 0) return null;

  return {
    messageId: pick.id,
    content: pick.content,
    options,
    answerIndex,
  };
}

/** 校验作答 */
export function gradeGuess(answerIndex: number, chosen: number): boolean {
  return answerIndex === chosen;
}
