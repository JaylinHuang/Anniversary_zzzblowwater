import { getDb, rowFrom, withDb } from "../src/lib/db";

async function main() {
  await getDb();
  const existing = await withDb((db) =>
    rowFrom<{ c: number }>(db, `SELECT COUNT(*) as c FROM lore_figures`),
  );
  if ((existing?.c ?? 0) > 0) {
    console.log("人物星图已有数据，跳过种子写入");
    return;
  }

  await withDb((db) => {
    const figures: [string, string, string, string, number, number, number][] = [
      [
        "绳匠甲",
        "建群先知",
        "据说是第一个在群里打出「绝区零」三字的人。野史称其预言了七月十日。",
        "甲",
        175,
        22,
        35,
      ],
      [
        "夜猫丙",
        "深夜修仙王",
        "生物钟与服务器维护窗口高度重合。白天传说中不存在。",
        "夜",
        210,
        55,
        22,
      ],
      [
        "杠精丁",
        "抬杠宗师",
        "每一场群聊论战的催化剂。有人说没有他就没有梗。",
        "杠",
        25,
        78,
        40,
      ],
      [
        "欧皇戊",
        "非酋克星",
        "出金时群里会短暂安静三秒，然后开始复盘玄学。",
        "欧",
        40,
        40,
        70,
      ],
      [
        "复读己",
        "回声精灵",
        "专司复读与表情包投送。史料记载其最长连复达三十条。",
        "复",
        300,
        70,
        72,
      ],
      [
        "神秘庚",
        "只看不说话",
        "在线却沉默。野史有云：关键转折点都有 TA 的已读。",
        "庚",
        160,
        30,
        55,
      ],
    ];

    for (const [name, epithet, summary, avatar, hue, x, y] of figures) {
      db.run(
        `INSERT INTO lore_figures (name, epithet, summary, avatar_text, hue, pos_x, pos_y)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [name, epithet, summary, avatar, hue, x, y],
      );
    }

    const ids = figures.map((_, i) => i + 1);
    const rels: [number, number, string][] = [
      [ids[0], ids[1], "深夜同修"],
      [ids[0], ids[5], "建群目击"],
      [ids[1], ids[3], "玄学对线"],
      [ids[2], ids[4], "抬杠与复读"],
      [ids[2], ids[0], "死对头（互封）"],
      [ids[3], ids[4], "出金狂欢共犯"],
      [ids[5], ids[1], "已读不回传说"],
    ];
    for (const [from, to, label] of rels) {
      db.run(
        `INSERT INTO lore_relations (from_id, to_id, label) VALUES (?, ?, ?)`,
        [from, to, label],
      );
    }

    const anecdotes: [number, string, string, string][] = [
      [
        1,
        "七月十日谶言",
        "建群当日有人随口说「那就定今天」。一年后群友翻聊天记录，发现这句话旁边还跟着三个复读。",
        "建群纪元",
      ],
      [
        1,
        "首次团战夜点名",
        "据说点名点到一半断网，再上线时只剩夜猫丙还在排队。",
        "联机传说",
      ],
      [
        2,
        "四点十七分的胜利",
        "某次活动结算时间定格在 04:17。此后群规非正式条款：凌晨四点后发言免责。",
        "修仙篇",
      ],
      [
        3,
        "三连问事件",
        "连续三句「真的吗？」引发长达两小时的资料战。战后双方互加「宗师」称号。",
        "论战篇",
      ],
      [
        4,
        "欧气外溢事故",
        "出金截图发出后，三人宣称「沾了欧气」。次日三人集体沉船，野史谓之反噬。",
        "玄学篇",
      ],
      [
        5,
        "三十连复读",
        "在无人制止的情况下完成三十连。最后一条被神秘庚「已读」。",
        "回声篇",
      ],
      [
        6,
        "关键节点的已读",
        "凡群内重大分歧尘埃落定之际，总有人发现神秘庚刚刚上线又离开。",
        "旁观篇",
      ],
    ];
    for (const [figureId, title, body, era] of anecdotes) {
      db.run(
        `INSERT INTO lore_anecdotes (figure_id, title, body, era_label) VALUES (?, ?, ?, ?)`,
        [figureId, title, body, era],
      );
    }
  });

  console.log("人物星图野史种子已写入（6 人、7 条关系、7 则轶事）");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
