"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import { apiFetch } from "@/lib/api-client";

type Suggestion = {
  quoteId: number;
  title: string;
  happenedOn: string | null;
  description: string;
  sender: string;
};

export function MilestoneForm() {
  const router = useRouter();
  const { success, error } = useToast();
  const [title, setTitle] = useState("");
  const [happenedOn, setHappenedOn] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [quoteId, setQuoteId] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [hint, setHint] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await apiFetch("/api/timeline", {
        method: "POST",
        body: JSON.stringify({
          title,
          happenedOn,
          description,
          tags: tags
            .split(/[,，]/)
            .map((t) => t.trim())
            .filter(Boolean),
          quoteId: quoteId ? Number(quoteId) : null,
        }),
      });
      setTitle("");
      setDescription("");
      setQuoteId("");
      success("里程碑已添加");
      router.refresh();
    } catch (err) {
      error(err instanceof Error ? err.message : "添加失败");
    }
  }

  async function loadSuggestions() {
    setHint("加载金句候选…");
    try {
      const data = await apiFetch<{ suggestions?: Suggestion[] }>(
        "/api/timeline?suggest=1",
      );
      setSuggestions(data.suggestions || []);
      setHint(
        data.suggestions?.length
          ? `找到 ${data.suggestions.length} 条金句候选，点选填入表单`
          : "暂无金句，请先在归档里标记",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "无法加载建议";
      setHint(msg);
      error(msg);
    }
  }

  function applySuggestion(s: Suggestion) {
    setTitle(s.title);
    setHappenedOn(s.happenedOn || "");
    setDescription(s.description);
    setQuoteId(String(s.quoteId));
    setTags("金句");
    setHint(`已填入：${s.sender} 的金句 #${s.quoteId}`);
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="btn btn-ghost"
          type="button"
          onClick={() => void loadSuggestions()}
        >
          从金句生成候选
        </button>
        {hint ? <span className="text-sm text-[var(--fog)]">{hint}</span> : null}
      </div>
      {suggestions.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {suggestions.map((s) => (
            <li key={s.quoteId}>
              <button
                type="button"
                className="panel w-full rounded-xl p-3 text-left text-sm transition hover:border-[rgba(61,224,208,0.45)]"
                onClick={() => applySuggestion(s)}
              >
                <div className="text-[var(--amber)]">{s.title}</div>
                <div className="mt-1 text-[var(--fog)]">{s.description}</div>
                <div className="mt-1 text-xs text-[var(--fog)]">
                  {s.happenedOn || "无日期"} · #{s.quoteId}
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <form
        onSubmit={onSubmit}
        className="panel grid gap-3 rounded-2xl p-5 md:grid-cols-2"
      >
        <input
          className="input"
          placeholder="标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <input
          className="input"
          type="date"
          value={happenedOn}
          onChange={(e) => setHappenedOn(e.target.value)}
          required
        />
        <textarea
          className="input md:col-span-2"
          placeholder="描述"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <input
          className="input"
          placeholder="标签，逗号分隔"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
        <input
          className="input"
          placeholder="关联金句 ID（可选）"
          value={quoteId}
          onChange={(e) => setQuoteId(e.target.value)}
        />
        <button className="btn md:col-span-2" type="submit">
          添加里程碑
        </button>
      </form>
    </div>
  );
}
