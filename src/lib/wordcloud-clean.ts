import { spawn } from "child_process";
import path from "path";
import { chineseBigramFreq } from "@/lib/stats-rules";

export type CloudWord = { word: string; count: number };

/**
 * 用 scripts/wordcloud_clean.py 洗掉群名、虚词和双字碎片。
 * 脚本起不来时退回原来的双字统计，统计页不会因此打不开。
 */
export async function cleanWordCloud(
  texts: string[],
  groupName: string,
  topN = 40,
  banNames: string[] = [],
): Promise<CloudWord[]> {
  const script = path.join(process.cwd(), "scripts", "wordcloud_clean.py");
  const payload = JSON.stringify({ texts, groupName, topN, banNames });
  const commands = process.platform === "win32" ? ["py", "python"] : ["python3", "python"];
  for (const command of commands) {
    const args = command === "py" ? ["-3", script] : [script];
    try {
      const raw = await runPython(command, args, payload);
      const parsed = JSON.parse(raw) as { words?: CloudWord[] };
      if (!Array.isArray(parsed.words)) continue;
      return parsed.words
        .filter((item) => item && typeof item.word === "string")
        .map((item) => ({ word: item.word, count: Number(item.count) || 0 }));
    } catch {
      /* 换下一个解释器 */
    }
  }
  return chineseBigramFreq(texts, topN);
}

function runPython(command: string, args: string[], payload: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1",
      },
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("词云清洗超时"));
    }, 20000);
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(err.length ? "词云清洗失败" : `词云清洗退出 ${code}`));
        return;
      }
      resolve(Buffer.concat(out).toString("utf8"));
    });
    child.stdin.write(payload);
    child.stdin.end();
  });
}
