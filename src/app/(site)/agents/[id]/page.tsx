import { notFound } from "next/navigation";
import { PageStage } from "@/components/fx/PageStage";
import { assertModuleEnabled } from "@/lib/modules";
import { getSessionUser } from "@/lib/auth";
import { getAgentById, listAgentGroupChat } from "@/lib/roster";
import { getOrCreateActiveSession, listSessionMessages } from "@/lib/dm";
import { getDmQuota } from "@/lib/dm-limit";
import { GROUP_NAME } from "@/lib/constants";
import { loadSpeakStyle, speakStyleCaption } from "@/lib/speak-stats";
import { AgentChibi } from "./AgentChibi";
import { AgentDmClient } from "./AgentDmClient";

export default async function AgentDmPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await assertModuleEnabled("member-agents");
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) notFound();

  const agent = await getAgentById(Number(id));
  if (!agent) notFound();

  const session = await getOrCreateActiveSession(user.id, agent.id);
  const messages = await listSessionMessages(user.id, session.id);
  const groupLog = await listAgentGroupChat(agent.qq, 16);
  const speakStyle = await loadSpeakStyle(agent.qq);
  const dmQuota = await getDmQuota(user.id);

  return (
    <PageStage
      code="HDD-09"
      channel="DM"
      title={agent.display_name}
      lede={agent.summary || `${GROUP_NAME} · 单聊`}
      hideIndex
      rail={
        <AgentChibi
          name={agent.display_name}
          src={agent.illustration_url || null}
        />
      }
    >
      <AgentDmClient
        agentId={agent.id}
        agentName={agent.display_name}
        agentAvatar={agent.illustration_url || null}
        styleCaption={speakStyle ? speakStyleCaption(speakStyle) : ""}
        userName={user.displayName}
        userAvatar={user.avatarUrl}
        initialSessionId={session.id}
        initialQuota={{ used: dmQuota.used, limit: dmQuota.limit }}
        groupLog={groupLog.map((row) => ({
          id: row.id,
          sender: row.sender,
          content: row.content,
          sentAt: row.sent_at,
        }))}
        initialMessages={messages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          createdAt: m.created_at,
        }))}
      />
    </PageStage>
  );
}
