import { headers } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { PointerField } from "@/components/fx/PointerField";
import { MODULE_META, type ModuleKey } from "@/lib/constants";
import { getFeatureFlags } from "@/lib/modules";
import {
  MORE_NAV_KEYS,
  PRIMARY_NAV_KEYS,
  buildNavLinks,
  isNavActive,
} from "@/lib/nav";

/**
 * 功能页共用舞台：眉题、弹簧指针场、粒子，右侧频道索引。
 * 各页只换频道号和正文，视觉语言跟首页夜街同一套代币。
 */
export async function PageStage({
  code,
  channel,
  title,
  lede,
  rail,
  hideIndex = false,
  children,
}: {
  code: string;
  channel: string;
  title: string;
  lede?: ReactNode;
  rail?: ReactNode;
  /** 单聊页用立绘占右侧，不再放频道索引 */
  hideIndex?: boolean;
  children: ReactNode;
}) {
  const flags = hideIndex ? null : await getFeatureFlags();
  const pathname = (await headers()).get("x-pathname") || "";
  const links = flags
    ? buildNavLinks(flags, [...PRIMARY_NAV_KEYS, ...MORE_NAV_KEYS])
    : [];

  return (
    <section className="page-stage">
      <PointerField />
      <header className="page-stage-head">
        <div className="page-stage-kicker">
          <span className="eyebrow">{channel}</span>
          <span className="mono page-stage-code">{code}</span>
        </div>
        <div className="page-stage-title-row">
          <h1 className="brand-font page-stage-title">{title}</h1>
          <span className="page-stage-mark" aria-hidden>
            HDD
          </span>
        </div>
        {lede ? <div className="page-stage-lede">{lede}</div> : null}
        <div className="page-stage-scan" aria-hidden />
      </header>

      <div className="page-stage-grid">
        <div className="page-stage-main">{children}</div>
        <aside className={hideIndex ? "page-stage-rail is-standee" : "page-stage-rail"}>
          {rail}
          {hideIndex ? null : (
          <nav className="page-index" aria-label="频道索引">
            <p className="eyebrow">INDEX</p>
            <ul>
              {links.map((link) => {
                const active = isNavActive(pathname, link.href);
                const meta = MODULE_META[link.key as ModuleKey];
                return (
                  <li key={link.key}>
                    <Link
                      href={link.href}
                      className={active ? "is-active" : undefined}
                      aria-current={active ? "page" : undefined}
                    >
                      <span>{link.label}</span>
                      <small>{meta.blurb}</small>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          )}
        </aside>
      </div>
    </section>
  );
}
