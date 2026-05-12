"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GlyphMark } from "./Glyphs";

const NAV = [
  { href: "/", label: "Overview", num: "00" },
  { href: "/repos", label: "Repos", num: "01" },
  { href: "/brain", label: "Brain", num: "02" },
  { href: "/authoring", label: "Authoring", num: "03" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="glass fixed left-0 top-0 h-screen w-64 border-r border-line flex flex-col z-30">
      {/* Logo block */}
      <div className="px-8 pt-8 pb-7 border-b border-line">
        <div className="flex items-center gap-3 mb-4">
          <GlyphMark size={16} className="text-accent" />
          <div className="font-mono text-[0.6rem] tracking-[0.3em] uppercase text-fg">
            Mythic <span className="text-accent">·</span> Labs
          </div>
        </div>
        <div className="serif-display text-[1.35rem] leading-none text-fg">
          Brain Admin
        </div>
        <div className="mono-label-dim mt-3 opacity-70">
          Diagnostic console
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-6">
        {NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                group relative flex items-baseline gap-4 pl-8 pr-6 py-3.5
                font-mono text-[0.7rem] tracking-[0.22em] uppercase
                ease-mythic
                ${
                  active
                    ? "text-fg"
                    : "text-fg-dim hover:text-fg hover:pl-9"
                }
              `}
              style={{
                transition:
                  "color var(--motion-base) var(--ease-mythic), padding-left var(--motion-base) var(--ease-mythic)",
              }}
            >
              {/* Left rule — solid accent when active, gentle when hovered */}
              <span
                className={`
                  absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[2px]
                  ${
                    active
                      ? "bg-accent"
                      : "bg-transparent group-hover:bg-accent-light"
                  }
                `}
                style={{
                  transition: "background-color var(--motion-base) var(--ease-mythic)",
                }}
              />
              <span
                className={`text-[0.55rem] opacity-60 ${
                  active ? "text-accent" : "text-fg-ghost"
                }`}
              >
                {item.num}
              </span>
              <span>{item.label}</span>
              {active ? (
                <span
                  className="ml-auto h-1 w-1 rounded-full bg-accent pulse-dot"
                  aria-hidden="true"
                />
              ) : null}
            </Link>
          );
        })}
      </nav>

      {/* Footer block */}
      <div className="px-8 py-6 border-t border-line">
        <div className="mono-label-dim mb-3">Session</div>
        <div className="flex items-baseline gap-2">
          <span
            className="h-1.5 w-1.5 rounded-full bg-accent pulse-dot"
            aria-hidden="true"
          />
          <span className="font-mono text-[0.7rem] text-fg-dim">
            admin · single-user
          </span>
        </div>
        <div className="font-mono text-[0.6rem] text-fg-ghost mt-3 tracking-[0.15em] uppercase">
          no-auth mode
        </div>
      </div>
    </aside>
  );
}
