import { assertModuleEnabled } from "@/lib/modules";
import { getDb, rowsFrom } from "@/lib/db";
import { canModerate, getSessionUser } from "@/lib/auth";
import { ConstellationClient } from "./ConstellationClient";

export default async function ConstellationPage() {
  await assertModuleEnabled("lore-constellation");
  const user = await getSessionUser();
  const db = await getDb();
  const figures = rowsFrom<{
    id: number;
    name: string;
    epithet: string;
    summary: string;
    avatar_text: string;
    hue: number;
    pos_x: number;
    pos_y: number;
  }>(
    db,
    `SELECT id, name, epithet, summary, avatar_text, hue, pos_x, pos_y
     FROM lore_figures WHERE published = 1 ORDER BY id ASC`,
  );
  const relations = rowsFrom<{
    id: number;
    from_id: number;
    to_id: number;
    label: string;
  }>(
    db,
    `SELECT r.id, r.from_id, r.to_id, r.label
     FROM lore_relations r
     JOIN lore_figures a ON a.id = r.from_id AND a.published = 1
     JOIN lore_figures b ON b.id = r.to_id AND b.published = 1`,
  );

  return (
    <div>
      <h1 className="brand-font text-3xl text-[var(--cyan)]">人物关系星图</h1>
      <p className="mt-2 max-w-2xl text-sm text-[var(--fog)]">
        半真半假的群野史图谱。点头像/名字查看轶事与关系——参考百科人物关系图，但更吹水一点。
      </p>
      <ConstellationClient
        figures={figures}
        relations={relations}
        canModerate={!!user && canModerate(user.role)}
      />
    </div>
  );
}
