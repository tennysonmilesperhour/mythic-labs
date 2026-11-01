"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GlyphMark } from "./Glyphs";
import { useCommands } from "./CommandLayer";
import { useTheme } from "./Theme";

export const NAV_GROUPS: Array<{ title: string; items: Array<{ href: string; label: string; key: string }> }> = [
  {
    title: "Work",
    items: [
      { href: "/", label: "Overview", key: "o" },
      { href: "/today", label: "Today", key: "t" },
      { href: "/inbox", label: "Inbox", key: "i" },
      { href: "/tasks", label: "My tasks", key: "m" },
      { href: "/queue", label: "All tasks", key: "q" },
      { href: "/projects", label: "Projects", key: "p" },
    ],
  },
  {
    title: "Reflect",
    items: [
      { href: "/review", label: "Review", key: "r" },
      { href: "/insights", label: "Insights", key: "n" },
      { href: "/history", label: "History", key: "h" },
    ],
  },
  {
    title: "Brain",
    items: [
      { href: "/import", label: "Import", key: "" },
      { href: "/repos", label: "Repos", key: "s" },
      { href: "/brain", label: "Brain", key: "b" },
      { href: "/authoring", label: "Authoring", key: "a" },
    ],
  },
];

export const NAV = NAV_GROUPS.flatMap((g) => g.items);

/** /tasks is "My tasks"; /tasks/<id> is a task map that belongs to no section. */
function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/tasks") return pathname === "/tasks";
  return pathname === href || pathname.startsWith(`${href}/`) || pathname.startsWith(`${href}?`);
}

export default function Sidebar() {
  const pathname = usePathname();
  const { open } = useCommands();
  const [theme, toggleTheme] = useTheme();

  return (
    <aside className="glass fixed left-0 top-0 h-screen w-64 border-r border-line hidden md:flex flex-col z-30">
      <div className="px-8 pt-8 pb-6 border-b border-line">
        <div className="flex items-center gap-3 mb-4">
          <GlyphMark size={16} className="text-accent" />
          <div className="font-mono text-[0.6rem] tracking-[0.3em] uppercase text-fg">
            Mythic <span className="text-accent">·</span> Labs
          </div>
        </div>
        <div className="serif-display text-[1.35rem] leading-none text-fg">Brain Admin</div>
        <button
          onClick={() => open("palette")}
          className="mt-4 w-full flex items-center justify-between border border-line bg-bg/60 px-3 py-2 text-left hover:border-fg-dim"
          style={{ transition: "border-color var(--motion-base) var(--ease-mythic)" }}
          title="Search projects, tasks and decisions, or run a command"
        >
          <span className="font-mono text-[0.62rem] text-fg-dim">Search or jump…</span>
          <kbd className="font-mono text-[0.55rem] text-fg-ghost">⌘K</kbd>
        </button>
      </div>

      <nav className="flex-1 py-4 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="mb-3">
            <div className="px-8 pt-2 pb-1 font-mono text-[0.5rem] tracking-[0.3em] uppercase text-fg-ghost">{group.title}</div>
            {group.items.map((item) => {
              const active = isActive(item.href, pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group relative flex items-baseline gap-3 pl-8 pr-6 py-2 font-mono text-[0.68rem] tracking-[0.2em] uppercase ${
                    active ? "text-fg" : "text-fg-dim hover:text-fg hover:pl-9"
                  }`}
                  style={{
                    transition: "color var(--motion-base) var(--ease-mythic), padding-left var(--motion-base) var(--ease-mythic)",
                  }}
                >
                  <span
                    className={`absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[2px] ${active ? "bg-accent" : "bg-transparent group-hover:bg-accent-light"}`}
                    style={{ transition: "background-color var(--motion-base) var(--ease-mythic)" }}
                  />
                  <span>{item.label}</span>
                  {item.key ? (
                    <span className={`ml-auto font-mono text-[0.5rem] tracking-normal lowercase ${active ? "text-accent" : "text-fg-ghost opacity-0 group-hover:opacity-100"}`} title={`Press g then ${item.key}`}>
                      g {item.key}
                    </span>
                  ) : null}
                  {active ? <span className="ml-1 h-1 w-1 rounded-full bg-accent pulse-dot" aria-hidden="true" /> : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="px-8 py-5 border-t border-line flex flex-col gap-3">
        <button onClick={() => open("capture")} className="lift-on-hover font-mono text-[0.6rem] tracking-[0.22em] uppercase px-3 py-2 bg-fg text-bg text-left flex items-center justify-between">
          <span>Capture</span>
          <kbd className="font-mono text-[0.55rem] opacity-70 normal-case tracking-normal">c</kbd>
        </button>
        <div className="flex items-center justify-between font-mono text-[0.58rem] text-fg-ghost">
          <button onClick={() => open("help")} className="hover:text-fg" title="Keyboard shortcuts">
            ? shortcuts
          </button>
          <button onClick={toggleTheme} className="hover:text-fg" title="Switch between light and dark">
            {theme === "dark" ? "light mode" : "dark mode"}
          </button>
        </div>
      </div>
    </aside>
  );
}

/** Phones: a sticky top bar instead of the sidebar. */
export function MobileNav() {
  const pathname = usePathname();
  const { open } = useCommands();
  return (
    <nav className="glass sticky top-0 z-30 md:hidden border-b border-line flex items-center gap-1 overflow-x-auto px-3 py-2">
      <GlyphMark size={14} className="text-accent shrink-0 mr-2" />
      <button onClick={() => open("palette")} className="font-mono text-[0.6rem] tracking-[0.18em] uppercase px-2.5 py-1.5 shrink-0 text-accent" aria-label="Search">
        ⌕
      </button>
      <button onClick={() => open("capture")} className="font-mono text-[0.6rem] tracking-[0.18em] uppercase px-2.5 py-1.5 shrink-0 text-accent" aria-label="Capture">
        +
      </button>
      {NAV.map((item) => {
        const active = isActive(item.href, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`font-mono text-[0.6rem] tracking-[0.18em] uppercase px-2.5 py-1.5 shrink-0 ${active ? "text-fg border-b border-accent" : "text-fg-dim"}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
