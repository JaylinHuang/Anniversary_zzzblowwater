# -*- coding: utf-8 -*-
"""词云清洗的命令行副本。网站统计不跑这个文件。

正式规则在 src/lib/wordcloud-rules.ts，由 Node 直接执行。
生产镜像里没有 Python，以前网页调用失败会退回双字滑动窗口，
虚词、群名和人名碎片都会漏进词云。

这里同样：中英文都收，汉字不限 2～4 个字，先挖掉群名，再按虚词切开，
不再做双字或三四字滑动。超过 4 个字的片段在网站里还会按常用词表切开，
命令行这里整段保留。
"""

from __future__ import annotations

import json
import re
import sys

# 虚词和代词：用来切开，不单独成词
GLUE = set(
    "的了呢啊吧吗呀哦嗯着过在是有把被让给和跟与或也就都还又很太更最"
    "这那我你他她它没不而及对从到为以但如所因若则且并么哈想"
    "说里去来看做讲聊问听"
)

# 切开之后仍会整段留下、但没有检索价值的英文虚词。大小写已合并
EN_STOP = {
    "a", "an", "the", "of", "to", "in", "on", "or", "is", "it", "be", "as", "at",
    "by", "we", "he", "me", "my", "and", "you", "for", "are", "was", "not", "but",
    "with", "this", "that", "have", "from", "they", "what", "your", "just", "like",
    "its", "about", "there", "their", "would", "could", "should", "been", "were",
    "will", "can", "all", "any", "our", "out", "get", "got", "how", "who", "why",
    "when", "where", "which", "than", "then", "them", "his", "her", "she", "him",
    "has", "had", "did", "does", "dont", "im", "ive", "youre", "its", "also",
    "into", "over", "after", "before", "because", "really", "very", "some",
}
# 切开之后仍会整段留下、但没有检索价值的说法
STOP = {
    "时候",
    "时间",
    "小时",
    "今日",
    "今天",
    "明天",
    "昨天",
    "现在",
    "知道",
    "觉得",
    "可以",
    "真的",
    "一下",
    "一点",
    "自己",
    "然后",
    "已经",
    "因为",
    "所以",
    "但是",
    "如果",
    "不过",
    "就是",
    "还是",
    "不是",
    "没有",
    "什么",
    "怎么",
    "这个",
    "那个",
    "一个",
    "我们",
    "你们",
    "他们",
    "这样",
    "那样",
    "这里",
    "那里",
    "出来",
    "进去",
    "回来",
    "哈哈",
    "呵呵",
    "嘿嘿",
    "好的",
    "好吧",
    "行吧",
    "谢谢",
    "看看",
    "东西",
    "地方",
    "其实",
    "应该",
    "可能",
    "好像",
    "真是",
    "难道",
    "到底",
    "而且",
    "或者",
    "一起",
    "一直",
    "一样",
    "一般",
    "于是",
}

def group_pieces(name: str) -> set[str]:
    """群名本身，以及其中任意连续汉字，避免「吹水」「水群」再被算进去。"""
    pieces: set[str] = set()
    raw = (name or "").strip()
    if raw:
        pieces.add(raw.lower())
    chars = "".join(re.findall(r"[\u4e00-\u9fff]", raw))
    for n in range(2, len(chars) + 1):
        for i in range(0, len(chars) - n + 1):
            pieces.add(chars[i : i + n])
    for token in re.findall(r"[A-Za-z]{2,}", raw):
        pieces.add(token.lower())
    return pieces


def strip_noise(text: str, pieces: set[str]) -> str:
    text = re.sub(r"\[[^\]]*\]", "", text)
    text = re.sub(r"https?://\S+", "", text, flags=re.IGNORECASE)
    text = re.sub(r"@\S+", "", text)
    for piece in sorted((p for p in pieces if re.search(r"[\u4e00-\u9fff]", p)), key=len, reverse=True):
        text = text.replace(piece, "")
    return text


def chunks_of(text: str) -> list[str]:
    buf: list[str] = []
    out: list[str] = []
    for ch in text:
        if "\u4e00" <= ch <= "\u9fff" and ch not in GLUE:
            buf.append(ch)
        elif buf:
            out.append("".join(buf))
            buf = []
    if buf:
        out.append("".join(buf))
    return out


# 词尾口头禅。后面还连着字的「操场 / 操作」不算口头禅
CAO_WORDS = ("操场", "操作", "操心", "操办", "操持", "操劳", "操纵", "操盘", "操练")


def split_tic(chunk: str) -> list[str]:
    """把粘在词尾的「操」撕开丢掉，只留下前面的说法。"""
    parts: list[str] = []
    buf: list[str] = []
    i = 0
    while i < len(chunk):
        kept = next((word for word in CAO_WORDS if chunk.startswith(word, i)), "")
        if kept:
            if buf:
                parts.append("".join(buf))
                buf = []
            parts.append(kept)
            i += len(kept)
            continue
        if chunk[i] == "操":
            if buf:
                parts.append("".join(buf))
                buf = []
            i += 1
            continue
        buf.append(chunk[i])
        i += 1
    if buf:
        parts.append("".join(buf))
    return parts


def pieces_of(chunk: str) -> list[str]:
    # 整段留下。不按 2/3/4 字滑动，也不截断到 4 个字
    if len(chunk) >= 2:
        return [chunk]
    return []


def keep(word: str, pieces: set[str]) -> bool:
    if not re.fullmatch(r"[\u4e00-\u9fff]{2,24}", word):
        return False
    if word in STOP or word in pieces:
        return False
    if len(set(word)) == 1:
        return False
    return True


def latin_words(text: str) -> list[str]:
    """整段英文按词收下，大小写并成小写。不拆成字母碎片。"""
    words: list[str] = []
    for raw in re.findall(r"[A-Za-z][A-Za-z']{1,31}", text):
        word = raw.replace("'", "").lower()
        if 2 <= len(word) <= 32:
            words.append(word)
    return words


def keep_latin(word: str, pieces: set[str]) -> bool:
    if word in EN_STOP or word in pieces:
        return False
    if len(set(word)) == 1:
        return False
    return True


def subsume(freq: dict[str, int]) -> dict[str, int]:
    """短词如果只是某个更长词的一部分，而且次数没有高出一截，就当成碎片丢掉。"""
    drop: set[str] = set()
    longer = sorted(freq, key=len, reverse=True)
    for long in longer:
        if long in drop:
            continue
        for short, count in freq.items():
            if len(short) >= len(long) or short in drop:
                continue
            if short in long and count <= freq[long] * 1.25:
                drop.add(short)
    return {word: count for word, count in freq.items() if word not in drop}


def clean_texts(
    texts: list[str],
    group_name: str,
    top_n: int,
    ban_names: list[str] | None = None,
) -> list[dict[str, int | str]]:
    pieces = group_pieces(group_name)
    for name in ban_names or []:
        pieces |= group_pieces(name)
    freq: dict[str, int] = {}
    for text in texts:
        if not isinstance(text, str) or not text:
            continue
        for chunk in chunks_of(strip_noise(text, pieces)):
            for part in split_tic(chunk):
                for word in pieces_of(part):
                    if not keep(word, pieces):
                        continue
                    freq[word] = freq.get(word, 0) + 1
        for word in latin_words(strip_noise(text, pieces)):
            if not keep_latin(word, pieces):
                continue
            freq[word] = freq.get(word, 0) + 1
    freq = subsume(freq)
    ranked = sorted(freq.items(), key=lambda item: (-item[1], item[0]))[: max(0, top_n)]
    return [{"word": word, "count": count} for word, count in ranked]


def main() -> int:
    raw = sys.stdin.buffer.read()
    try:
        payload = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError:
        sys.stderr.write("词云清洗：输入不是 JSON\n")
        return 1
    texts = payload.get("texts") or []
    group_name = str(payload.get("groupName") or "")
    top_n = int(payload.get("topN") or 40)
    ban_names = [str(name) for name in (payload.get("banNames") or []) if str(name).strip()]
    result = clean_texts(texts, group_name, top_n, ban_names)
    sys.stdout.buffer.write(json.dumps({"words": result}, ensure_ascii=False).encode("utf-8"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
