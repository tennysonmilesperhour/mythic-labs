"use client";

import { useRouter } from "next/navigation";

/**
 * A link that can sit inside another link (a whole-row Link), which a nested
 * <a> can't. Clicking it goes to its own destination instead of the row's.
 */
export default function SubLink({
  href,
  children,
  className = "",
  title,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  const router = useRouter();
  const external = /^https?:\/\//.test(href);
  const go = (e: React.SyntheticEvent, newTab = false) => {
    e.preventDefault();
    e.stopPropagation();
    if (external || newTab) window.open(href, "_blank", "noopener,noreferrer");
    else router.push(href);
  };
  return (
    <span
      role="link"
      tabIndex={0}
      title={title}
      onClick={(e) => go(e, e.metaKey || e.ctrlKey)}
      onAuxClick={(e) => e.button === 1 && go(e, true)}
      onKeyDown={(e) => e.key === "Enter" && go(e)}
      className={`cursor-pointer underline-offset-2 hover:underline hover:text-accent ${className}`}
    >
      {children}
    </span>
  );
}
