import { notFound } from "next/navigation";
import { assertModuleEnabled } from "@/lib/modules";
import { getSessionUser } from "@/lib/auth";
import { getAgentById, listAgentGroupChat } from "@/lib/roster";
import { getOrCreateActiveSession, listSessionMessages } from "@/lib/dm";
import { GROUP_NAME } from "@/lib/constants";
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

  return (
    <div>
      <p className="text-xs tracking-[0.2em] text-[var(--amber)]">
        {GROUP_NAME} · DM
      </p>
      <div className="mt-3 flex flex-wrap items-start gap-5">
        {agent.illustration_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={agent.illustration_url}
            alt={agent.display_name}
            className="h-28 w-28 rounded-2xl object-cover"
          />
        ) : null}
        <div>
          <h1 className="brand-font text-3xl text-[var(--cyan)]">
            {agent.display_name}
          </h1>
          <p className="mt-2 text-sm text-[var(--fog)]">{agent.summary}</p>
          <p className="mt-2 text-xs text-[var(--amber)]">
            绑定 QQ {agent.qq} · 已收录群聊约 {agent.source_msg_count} 条
          </p>
        </div>
      </div>

      {groupLog.length ? (
        <section className="panel mt-6 rounded-2xl p-5">
          <h2 className="text-sm text-[var(--amber)]">该 QQ 近期群聊（实时归档）</h2>
          <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto text-sm">
            {groupLog.map((m) => (
              <li key={m.id}>
                <span className="text-[var(--fog)]">
                  {m.sent_at || "?"} · {m.sender}
                </span>
                <div className="text-[var(--ink)]">{m.content}</div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="mt-6 text-sm text-[var(--fog)]">
          尚无该 QQ 的群聊语料。配置 OneBot 或导入带 QQ
          号的 TXT 后会自动出现在这里。
        </p>
      )}

      <AgentDmClient
        agentId={agent.id}
        agentName={agent.display_name}
        groupName={GROUP_NAME}
        initialSessionId={session.id}
        initialMessages={messages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
        }))}
      />
    </div>
  );
}
