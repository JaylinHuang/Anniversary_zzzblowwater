import Link from "next/link";
import { assertModuleEnabled } from "@/lib/modules";
import { getSessionUser, isAdmin } from "@/lib/auth";
import { GROUP_NAME } from "@/lib/constants";
import { isLlmConfigured, getLlmConfig } from "@/lib/llm";
import { listRosterAgents } from "@/lib/roster";
import { getDmQuota } from "@/lib/dm-limit";
import {
  AgentsRosterClient,
  AgentAdminActions,
} from "./AgentsRosterClient";

export default async function AgentsPage() {
  await assertModuleEnabled("member-agents");
  const user = await getSessionUser();
  const agents = await listRosterAgents();
  const cfg = getLlmConfig();
  const canManage = !!user && isAdmin(user.role);
  const dmQuota = user
    ? await getDmQuota(user.id)
    : { used: 0, limit: 40, remaining: 40 };

  return (
    <div>
      <h1 className="brand-font text-3xl text-[var(--cyan)]">群友 Agent</h1>
      <p className="mt-2 max-w-2xl text-sm text-[var(--fog)]">
        {canManage
          ? `管理员可在此为「${GROUP_NAME}」建档分身（姓名、插画、绑定 QQ）。成员点进卡片即可单聊。`
          : `点进卡片，和「${GROUP_NAME}」里已建档的群友分身一对一聊聊。对话只你可见，不会进群归档。`}
      </p>
      <AgentsRosterClient
        groupName={GROUP_NAME}
        llmConfigured={isLlmConfigured()}
        model={cfg?.model ?? null}
        canManage={canManage}
        dmQuota={dmQuota}
      />
      {agents.length ? (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((a) => (
            <li key={a.id} className="panel rounded-2xl p-5">
              <Link
                href={`/agents/${a.id}`}
                className="block transition hover:opacity-90"
              >
                {a.illustration_url ? (
                  <div className="mb-3 aspect-[3/5] w-full overflow-hidden rounded-xl bg-[rgba(61,224,208,0.06)]">
                    {/* 素材多为 900×1500（3:5），contain 显示全身 */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={a.illustration_url}
                      alt={a.display_name}
                      className="h-full w-full object-contain object-center"
                    />
                  </div>
                ) : (
                  <div className="mb-3 flex aspect-[3/5] items-center justify-center rounded-xl bg-[rgba(61,224,208,0.08)] text-[var(--fog)]">
                    暂无插画
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-lg">{a.display_name}</span>
                  <span className="text-xs text-[var(--fog)]">
                    {a.source_msg_count} 条群聊
                  </span>
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-[var(--fog)]">
                  {a.summary}
                </p>
                {canManage ? (
                  <p className="mt-2 text-xs text-[var(--amber)]">QQ {a.qq}</p>
                ) : (
                  <p className="mt-2 text-xs text-[var(--cyan)]">点进单聊 →</p>
                )}
              </Link>
              <AgentAdminActions
                id={a.id}
                name={a.display_name}
                canManage={canManage}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-sm text-[var(--fog)]">
          {canManage
            ? "还没有 Agent。请在上方填写姓名、上传插画并绑定 QQ。"
            : "管理员还没建档任何 Agent，稍后再来看看吧。"}
        </p>
      )}
    </div>
  );
}
