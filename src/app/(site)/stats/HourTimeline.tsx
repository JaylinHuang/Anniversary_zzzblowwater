"use client";

import { useState } from "react";
import { isNightOwlHour } from "@/lib/stats-rules";

type Bucket = { hour: string; count: number };

const LABELS = [0, 6, 12, 18, 23];

function fmt(n: number) {
  return n.toLocaleString("zh-CN");
}

/** 24 小时发言时间轴：补齐空小时、标出深夜段、峰值和低谷 */
export function HourTimeline({ buckets }: { buckets: Bucket[] }) {
  const rows = Array.from({ length: 24 }, (_, hour) => {
    const found = buckets.find((row) => Number(row.hour) === hour);
    return { hour, count: found?.count ?? 0 };
  });
  const max = Math.max(1, ...rows.map((row) => row.count));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const peak = rows.reduce((best, row) => (row.count > best.count ? row : best), rows[0]);
  const quiet = rows.reduce((best, row) => (row.count < best.count ? row : best), rows[0]);
  const [hover, setHover] = useState<number | null>(null);
  const active = hover == null ? null : rows[hover];

  const width = 720;
  const height = 168;
  const padL = 4;
  const padR = 4;
  const padT = 14;
  const padB = 8;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const slot = innerW / 24;
  const yOf = (count: number) => padT + innerH - (count / max) * innerH;
  const xOf = (hour: number) => padL + hour * slot;

  const line = rows
    .map((row, index) => `${index === 0 ? "M" : "L"} ${xOf(row.hour) + slot / 2} ${yOf(row.count)}`)
    .join(" ");
  const area = `${line} L ${xOf(23) + slot / 2} ${padT + innerH} L ${xOf(0) + slot / 2} ${padT + innerH} Z`;

  const tip = active
    ? `${String(active.hour).padStart(2, "0")}:00–${String(active.hour).padStart(2, "0")}:59 · ${fmt(active.count)} 条${
        total > 0 ? ` · ${Math.round((active.count / total) * 1000) / 10}%` : ""
      }`
    : "";

  return (
    <div className="hour-chart">
      <div className="hour-legend">
        <span>
          <i className="is-day" /> 其余时段
        </span>
        <span>
          <i className="is-night" /> 23:00–04:59
        </span>
        <span>峰值 {String(peak.hour).padStart(2, "0")}:00 · {fmt(peak.count)}</span>
        <span>低谷 {String(quiet.hour).padStart(2, "0")}:00 · {fmt(quiet.count)}</span>
      </div>
      <div className="hour-plot">
        {/* 纵坐标拉高去填卡片和图之间的空档，刻度放在图外，避免字被拉变形 */}
        <div className="hour-svg">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="一天 24 小时的发言数量"
        >
          <rect
            x={xOf(23)}
            y={padT}
            width={slot}
            height={innerH}
            className="hour-band"
          />
          <rect
            x={xOf(0)}
            y={padT}
            width={slot * 5}
            height={innerH}
            className="hour-band"
          />
          <line
            x1={padL}
            x2={width - padR}
            y1={padT + innerH}
            y2={padT + innerH}
            className="hour-base"
          />
          <path d={area} className="hour-area" />
          <path d={line} className="hour-line" />
          {[...rows.filter((row) => row.hour !== hover), ...rows.filter((row) => row.hour === hover)].map((row) => {
            const night = isNightOwlHour(row.hour);
            const hot = row.count === peak.count && row.count > 0;
            const top = yOf(row.count);
            const barH = Math.max(0, padT + innerH - top);
            return (
              <g key={row.hour}>
                <rect
                  x={xOf(row.hour) + slot * 0.18}
                  y={row.count === 0 ? padT + innerH - 2 : top}
                  width={slot * 0.64}
                  height={row.count === 0 ? 2 : barH}
                  className={
                    [
                      "hour-bar",
                      night ? "is-night" : "",
                      hot ? "is-peak" : "",
                      hover === row.hour ? "is-on" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")
                  }
                  tabIndex={0}
                  role="img"
                  aria-label={`${row.hour}时 ${fmt(row.count)} 条`}
                  onMouseEnter={() => setHover(row.hour)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(row.hour)}
                  onBlur={() => setHover(null)}
                />
              </g>
            );
          })}
        </svg>
        {rows
          .filter((row) => row.count === peak.count && row.count > 0)
          .map((row) => (
            <span
              key={row.hour}
              className="hour-peak-dot"
              style={{
                left: `${((xOf(row.hour) + slot / 2) / width) * 100}%`,
                top: `${(yOf(row.count) / height) * 100}%`,
              }}
            />
          ))}
        {active ? (
          <p
            className={`hour-tip${active.hour >= 18 ? " is-end" : ""}`}
            style={{ left: `${((active.hour + 0.5) / 24) * 100}%` }}
          >
            {tip}
            {isNightOwlHour(active.hour) ? " · 深夜" : ""}
          </p>
        ) : null}
        </div>
        <div className="hour-axis" aria-hidden>
          {Array.from({ length: 24 }, (_, hour) => (
            <span key={hour}>{LABELS.includes(hour) ? String(hour).padStart(2, "0") : ""}</span>
          ))}
        </div>
        {active ? null : <p className="hour-tip is-idle">悬停某一小时查看条数</p>}
      </div>
    </div>
  );
}
