/**
 * 一轮发言的多步回路。照 DeepSeek Harness 的 Turn flow：
 * 一步 = 一次模型请求加上它发起的工具调用；
 * 工具结果回到同一轮，模型可以再要一步；
 * 没有待执行的工具、或者步数到顶，这一轮才结束。
 *
 * 只有模型最后那条不带工具调用的回复才是给用户看的话。
 * 这里不碰数据库也不发请求：模型和工具都是传进来的。
 */
import type { ChatMessage, ChatTurnResult, LlmToolSpec } from "@/lib/llm";
import {
  findTool,
  toolSpecs,
  type ToolArgs,
  type ToolDef,
  type ToolPorts,
} from "@/lib/agent-tools";

/** 一轮最多几次模型请求 */
export const MAX_TURN_STEPS = 5;

/** 步数到顶还在要工具时的收尾话。不会把带工具调用的那条内容发给用户 */
export const TURN_CAP_REPLY =
  "这轮我查得有点久，先停在这儿。你把想问的那一点再说一次，我直接答。";

export type StepFn = (
  messages: ChatMessage[],
  tools: LlmToolSpec[],
) => Promise<ChatTurnResult>;

export type LoopCallRecord = {
  step: number;
  tool: string;
  args: string;
  result: string;
  ok: boolean;
};

export type LoopOutcome = {
  /** 给用户看的那句话 */
  reply: string;
  /** 实际发出的模型请求次数 */
  steps: number;
  calls: LoopCallRecord[];
  /** 步数到顶才结束的 */
  hitCap: boolean;
  /** 回路走完时的完整消息序列，便于排查 */
  messages: ChatMessage[];
};

function parseArgs(raw: string): ToolArgs {
  try {
    const parsed = JSON.parse(raw || "{}") as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as ToolArgs;
    }
  } catch {
    /* 模型给的不是合法 JSON，当空参数处理 */
  }
  return {};
}

export async function runToolLoop(params: {
  messages: ChatMessage[];
  tools: ToolDef[];
  ports: ToolPorts;
  identified: boolean;
  step: StepFn;
  maxSteps?: number;
  /** 每执行完一次工具调一下，用来写工作记忆 */
  onCall?: (record: LoopCallRecord) => Promise<void> | void;
  /** 第二步及以后每步发请求前调一次，返回这一轮已有的工作记忆文本（没有就返回空串） */
  workingContext?: (step: number) => Promise<string> | string;
}): Promise<LoopOutcome> {
  const maxSteps = Math.max(1, params.maxSteps ?? MAX_TURN_STEPS);
  const specs = toolSpecs(params.tools);
  const messages: ChatMessage[] = [...params.messages];
  const calls: LoopCallRecord[] = [];
  // 记下原始系统提示，每一步都在它后面重新拼本轮进度，避免越叠越长
  const baseSystem =
    messages[0]?.role === "system" ? messages[0].content : null;

  for (let step = 1; step <= maxSteps; step++) {
    if (step >= 2) {
      const progress = [
        `本轮进度：现在是第 ${step} 步（最多 ${maxSteps} 步），前面已经执行了 ${calls.length} 次工具调用。`,
        calls.length
          ? `已调用：${calls
              .map((c) => `第 ${c.step} 步·${c.tool}`)
              .join("、")}`
          : "",
        ((await params.workingContext?.(step)) || "").trim(),
      ]
        .filter(Boolean)
        .join("\n");
      if (baseSystem !== null) {
        messages[0] = {
          role: "system",
          content: `${baseSystem}\n\n${progress}`,
        };
      } else {
        // 原本没有系统提示：补一条放在最前面，仅此一条，后面步骤只替换它
        if (messages[0]?.role !== "system") {
          messages.unshift({ role: "system", content: progress });
        } else {
          messages[0] = { role: "system", content: progress };
        }
      }
    }
    const out = await params.step(messages, specs);

    // 没有待执行的工具：这一条就是给用户看的话，回路结束
    if (!out.toolCalls.length) {
      return {
        reply: out.content.trim(),
        steps: step,
        calls,
        hitCap: false,
        messages,
      };
    }

    messages.push({
      role: "assistant",
      content: out.content,
      toolCalls: out.toolCalls,
    });

    for (const call of out.toolCalls) {
      const def = findTool(params.tools, call.name);
      let result: string;
      let ok = true;
      if (!def) {
        ok = false;
        result = `没有注册这个工具：${call.name}。只能用已注册的那几个。`;
      } else {
        try {
          result = await def.run(parseArgs(call.arguments), {
            step,
            identified: params.identified,
            ports: params.ports,
          });
        } catch (err) {
          ok = false;
          result = `工具 ${call.name} 执行失败：${
            err instanceof Error ? err.message : String(err)
          }`;
        }
      }
      // 工具结果回到同一轮里
      messages.push({ role: "tool", content: result, toolCallId: call.id });
      const record: LoopCallRecord = {
        step,
        tool: call.name,
        args: call.arguments,
        result,
        ok,
      };
      calls.push(record);
      await params.onCall?.(record);
    }
  }

  return {
    reply: TURN_CAP_REPLY,
    steps: maxSteps,
    calls,
    hitCap: true,
    messages,
  };
}
