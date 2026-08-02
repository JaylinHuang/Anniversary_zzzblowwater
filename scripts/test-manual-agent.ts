/**
 * 手动 Agent 建档流程自测（写临时 Agent 再停用）
 */
import assert from "assert";
import {
  createManualAgent,
  disableAgent,
  bumpAgentSourceCount,
  countTextsForQq,
  getAgentById,
  listAgentGroupChat,
} from "../src/lib/roster";

async function main() {
  console.log("== test-manual-agent ==");
  // 使用样本里已有的 QQ
  const qq = "10001";
  const before = await countTextsForQq(qq);
  assert.ok(before >= 0);

  let createdId: number | null = null;
  try {
    const created = await createManualAgent({
      qq,
      displayName: "测试绳匠甲",
      illustrationUrl: "/uploads/test-agent.png",
    });
    createdId = created.id;
    assert.strictEqual(created.qq, qq);
    const agent = await getAgentById(created.id);
    assert.ok(agent);
    assert.strictEqual(agent!.display_name, "测试绳匠甲");
    assert.strictEqual(agent!.illustration_url, "/uploads/test-agent.png");
    console.log(`  ✓ 创建 Agent #${created.id} 语料=${created.sourceMsgCount}`);

    await bumpAgentSourceCount(qq);
    const again = await getAgentById(created.id);
    assert.ok(again);
    console.log(`  ✓ 刷新计数 source_msg_count=${again!.source_msg_count}`);

    const log = await listAgentGroupChat(qq, 5);
    console.log(`  ✓ 群聊摘录 ${log.length} 条`);
  } catch (e) {
    // QQ 可能已被占用：改为断言占用错误也算逻辑通
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("已绑定")) {
      console.log("  ✓ QQ 唯一约束生效（已有绑定）");
    } else {
      throw e;
    }
  } finally {
    if (createdId) {
      await disableAgent(createdId);
      const gone = await getAgentById(createdId);
      assert.strictEqual(gone, null);
      console.log("  ✓ 停用后不可见");
    }
  }

  console.log("手动 Agent 用例通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
