import { NextResponse } from "next/server";
import { requireModerator, requireUser } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/modules";
import { getDb, rowsFrom, withDb, rowFrom } from "@/lib/db";

export async function GET(req: Request) {
  try {
    await assertModuleEnabled("lore-constellation");
    await requireUser();
    const url = new URL(req.url);
    const figureId = url.searchParams.get("figureId");
    const db = await getDb();

    if (figureId) {
      const figure = rowFrom<{
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
        `SELECT * FROM lore_figures WHERE id = ? AND published = 1`,
        [Number(figureId)],
      );
      if (!figure) {
        return NextResponse.json({ error: "人物不存在" }, { status: 404 });
      }
      const anecdotes = rowsFrom(
        db,
        `SELECT id, title, body, era_label, sort_order FROM lore_anecdotes
         WHERE figure_id = ? AND published = 1
         ORDER BY sort_order ASC, id ASC`,
        [Number(figureId)],
      );
      const relations = rowsFrom<{
        id: number;
        label: string;
        other_id: number;
        other_name: string;
        other_epithet: string;
        direction: string;
      }>(
        db,
        `SELECT r.id, r.label,
                CASE WHEN r.from_id = ? THEN r.to_id ELSE r.from_id END as other_id,
                f.name as other_name, f.epithet as other_epithet,
                CASE WHEN r.from_id = ? THEN 'out' ELSE 'in' END as direction
         FROM lore_relations r
         JOIN lore_figures f ON f.id = CASE WHEN r.from_id = ? THEN r.to_id ELSE r.from_id END
         WHERE (r.from_id = ? OR r.to_id = ?) AND f.published = 1`,
        [
          Number(figureId),
          Number(figureId),
          Number(figureId),
          Number(figureId),
          Number(figureId),
        ],
      );
      return NextResponse.json({ figure, anecdotes, relations });
    }

    const figures = rowsFrom(
      db,
      `SELECT id, name, epithet, summary, avatar_text, hue, pos_x, pos_y
       FROM lore_figures WHERE published = 1 ORDER BY id ASC`,
    );
    const relations = rowsFrom(
      db,
      `SELECT r.id, r.from_id, r.to_id, r.label
       FROM lore_relations r
       JOIN lore_figures a ON a.id = r.from_id AND a.published = 1
       JOIN lore_figures b ON b.id = r.to_id AND b.published = 1`,
    );
    return NextResponse.json({ figures, relations });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ERROR" },
      { status: 400 },
    );
  }
}

export async function POST(req: Request) {
  try {
    await assertModuleEnabled("lore-constellation");
    await requireModerator();
    const body = await req.json();
    const action = String(body.action || "");

    if (action === "figure") {
      const id = await withDb((db) => {
        db.run(
          `INSERT INTO lore_figures (name, epithet, summary, avatar_text, hue, pos_x, pos_y)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            String(body.name || "").trim(),
            String(body.epithet || ""),
            String(body.summary || ""),
            String(body.avatarText || "").slice(0, 2) ||
              String(body.name || "").slice(0, 1),
            Number(body.hue ?? 180),
            Number(body.posX ?? 50),
            Number(body.posY ?? 50),
          ],
        );
        return rowFrom<{ id: number }>(
          db,
          `SELECT id FROM lore_figures ORDER BY id DESC LIMIT 1`,
        )!.id;
      });
      return NextResponse.json({ ok: true, id });
    }

    if (action === "relation") {
      await withDb((db) => {
        db.run(
          `INSERT INTO lore_relations (from_id, to_id, label) VALUES (?, ?, ?)`,
          [Number(body.fromId), Number(body.toId), String(body.label || "相关")],
        );
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "anecdote") {
      await withDb((db) => {
        db.run(
          `INSERT INTO lore_anecdotes (figure_id, title, body, era_label, sort_order)
           VALUES (?, ?, ?, ?, ?)`,
          [
            Number(body.figureId),
            String(body.title || ""),
            String(body.body || ""),
            String(body.eraLabel || ""),
            Number(body.sortOrder ?? 0),
          ],
        );
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "move") {
      await withDb((db) => {
        db.run(`UPDATE lore_figures SET pos_x = ?, pos_y = ? WHERE id = ?`, [
          Number(body.posX),
          Number(body.posY),
          Number(body.id),
        ]);
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ERROR" },
      { status: 400 },
    );
  }
}
