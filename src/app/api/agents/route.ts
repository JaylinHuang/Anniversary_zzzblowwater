import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { requireAdmin, requireUser } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/modules";
import { isLlmConfigured, getLlmConfig } from "@/lib/llm";
import { GROUP_NAME } from "@/lib/constants";
import {
  createManualAgent,
  updateManualAgent,
  disableAgent,
  rebuildAgentPersona,
  listRosterAgents,
  getAgentById,
  listAgentGroupChat,
} from "@/lib/roster";
import {
  getOrCreateActiveSession,
  listSessionMessages,
  sendDm,
  startNewSession,
} from "@/lib/dm";
import { getDmQuota } from "@/lib/dm-limit";

async function saveIllustration(file: File, userId: number) {
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("插画不能超过 5MB");
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name) || ".png";
  const name = `agent-${Date.now()}-${userId}${ext}`;
  const dir = path.join(process.cwd(), "data", "uploads");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), buf);
  return `/uploads/${name}`;
}

export async function GET(req: Request) {
  try {
    await assertModuleEnabled("member-agents");
    const user = await requireUser();
    const url = new URL(req.url);
    const agentId = url.searchParams.get("agentId");
    const cfg = getLlmConfig();

    if (agentId) {
      const agent = await getAgentById(Number(agentId));
      if (!agent) {
        return NextResponse.json({ error: "Agent 不存在" }, { status: 404 });
      }
      const wantLog = url.searchParams.get("chatLog") === "1";
      if (wantLog) {
        const log = await listAgentGroupChat(agent.qq, 50);
        return NextResponse.json({
          agentId: agent.id,
          qq: agent.qq,
          messages: log,
        });
      }
      const session = await getOrCreateActiveSession(user.id, agent.id);
      const messages = await listSessionMessages(user.id, session.id);
      const dmQuota = await getDmQuota(user.id);
      const groupLog = await listAgentGroupChat(agent.qq, 12);
      return NextResponse.json({
        agent: {
          id: agent.id,
          qq: agent.qq,
          name: agent.display_name,
          summary: agent.summary,
          illustrationUrl: agent.illustration_url || "",
          sourceMsgCount: agent.source_msg_count,
        },
        sessionId: session.id,
        messages,
        groupLog,
        dmQuota,
        groupName: GROUP_NAME,
      });
    }

    const agents = await listRosterAgents();
    const dmQuota = await getDmQuota(user.id);
    return NextResponse.json({
      groupName: GROUP_NAME,
      llmConfigured: isLlmConfigured(),
      model: cfg?.model ?? null,
      dmQuota,
      mode: "manual",
      agents: agents.map((a) => ({
        id: a.id,
        qq: a.qq,
        name: a.display_name,
        summary: a.summary,
        illustrationUrl: a.illustration_url || "",
        styleTags: JSON.parse(a.style_tags || "[]"),
        sampleQuotes: JSON.parse(a.sample_quotes || "[]"),
        sourceMsgCount: a.source_msg_count,
        updatedAt: a.updated_at,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ERROR" },
      { status: 400 },
    );
  }
}

export async function POST(req: Request) {
  try {
    await assertModuleEnabled("member-agents");
    const user = await requireUser();
    const contentType = req.headers.get("content-type") || "";

    // 创建 / 更新支持 multipart（含插画）
    if (contentType.includes("multipart/form-data")) {
      await requireAdmin();
      const form = await req.formData();
      const action = String(form.get("action") || "create");
      const file = form.get("illustration");
      let illustrationUrl: string | undefined;
      if (file instanceof File && file.size > 0) {
        illustrationUrl = await saveIllustration(file, user.id);
      }

      if (action === "create") {
        const result = await createManualAgent({
          qq: String(form.get("qq") || ""),
          displayName: String(form.get("displayName") || ""),
          illustrationUrl: illustrationUrl || "",
        });
        return NextResponse.json({ ok: true, ...result });
      }

      if (action === "update") {
        const id = Number(form.get("id"));
        const result = await updateManualAgent({
          id,
          displayName: form.has("displayName")
            ? String(form.get("displayName"))
            : undefined,
          qq: form.has("qq") ? String(form.get("qq")) : undefined,
          illustrationUrl,
        });
        return NextResponse.json({ ok: true, agent: result });
      }

      return NextResponse.json({ error: "未知操作" }, { status: 400 });
    }

    const body = await req.json();
    const action = String(body.action || "");

    if (action === "create") {
      await requireAdmin();
      const result = await createManualAgent({
        qq: String(body.qq || ""),
        displayName: String(body.displayName || ""),
        illustrationUrl: String(body.illustrationUrl || ""),
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "update") {
      await requireAdmin();
      const result = await updateManualAgent({
        id: Number(body.id),
        displayName: body.displayName,
        qq: body.qq,
        illustrationUrl: body.illustrationUrl,
      });
      return NextResponse.json({ ok: true, agent: result });
    }

    if (action === "delete" || action === "disable") {
      await requireAdmin();
      await disableAgent(Number(body.id));
      return NextResponse.json({ ok: true });
    }

    if (action === "rebuild-persona") {
      await requireAdmin();
      const result = await rebuildAgentPersona(Number(body.id));
      return NextResponse.json(result);
    }

    if (action === "reindex-rag") {
      await requireAdmin();
      const agent = await getAgentById(Number(body.id));
      if (!agent) {
        return NextResponse.json({ error: "Agent 不存在" }, { status: 404 });
      }
      const { rebuildEmbeddingsForQq } = await import("@/lib/rag");
      const result = await rebuildEmbeddingsForQq(agent.qq);
      const notice = result.local
        ? `云端业务空间拒绝了当前密钥，已用本地检索索引 ${result.indexed} 条原话。换上该空间自己的 Key 并重启后，再点一次会改走云端向量。`
        : undefined;
      return NextResponse.json({ ok: true, qq: agent.qq, ...result, notice });
    }

    if (action === "dm") {
      const agentId = Number(body.agentId);
      const content = String(body.content || "");
      const result = await sendDm({
        userId: user.id,
        agentId,
        content,
      });
      return NextResponse.json({ ok: true, ...result, groupName: GROUP_NAME });
    }

    if (action === "new-session") {
      const agentId = Number(body.agentId);
      const session = await startNewSession(user.id, agentId);
      return NextResponse.json({ ok: true, sessionId: session.id });
    }

    if (
      action === "baseline" ||
      action === "scan" ||
      action === "rebuild-bases" ||
      action === "grant" ||
      action === "manual-add"
    ) {
      return NextResponse.json(
        {
          error:
            "已改为管理员手动建档：请使用 create / update / delete / rebuild-persona",
        },
        { status: 403 },
      );
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ERROR" },
      { status: 400 },
    );
  }
}
