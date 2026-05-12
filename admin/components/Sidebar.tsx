"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Overview", num: "00" },
  { href: "/repos", label: "Repos", num: "01" },
  { href: "/brain", label: "Brain", num: "02" },
  { href: "/authoring", label: "Authoring", num: "03" },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed left-0 top-0 h-screen w-64 border-r border-line bg-bg-warm flex flex-col">
      <div className="px-8 py-8 border-b border-line">
        <div className="font-mono text-[0.65rem] tracking-[0.25em] uppercase text-fg">
          Mythic<span className="text-accent">·</span>Labs
        </div>
        <div className="serif-display text-xl mt-2 text-fg">Brain Admin</div>
      </div>

      <nav className="flex-1 py-8">
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
                flex items-baseline gap-4 px-8 py-3 transition-all
                font-mono text-[0.7rem] tracking-[0.2em] uppercase
                border-l-2
                ${
                  active
                    ? "border-accent text-fg bg-bg"
                    : "border-transparent text-fg-dim hover:text-fg hover:border-accent-light"
                }
              `}
            >
              <span className="text-accent opacity-60 text-[0.55rem]">
                {item.num}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-8 py-6 border-t border-line">
        <div className="mono-label mb-2">Session</div>
        <div className="font-mono text-[0.7rem] text-fg-dim">
          admin · single-user
        </div>
        <div className="font-mono text-[0.65rem] text-fg-ghost mt-2">
          no-auth mode
        </div>
      </div>
    </aside>
  );
}
