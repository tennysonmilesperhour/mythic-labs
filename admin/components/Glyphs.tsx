/**
 * Editorial glyph set — thin-stroke SVGs that act as typographic specimens
 * for the brain's artifact taxonomy. All glyphs share the same canvas
 * (24×24), stroke language (1.3px hairline), and accent treatment so they
 * read as a single family.
 *
 * Replaces placeholder Unicode shapes like ◇ △ / ↯ ◈ with drawn forms.
 */

type GlyphProps = {
  size?: number;
  className?: string;
  title?: string;
};

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.3,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": "true" as const,
});

/* Skill — a poised rhombus suggesting a faceted gem / specimen */
export function GlyphSkill({ size = 16, className, title }: GlyphProps) {
  return (
    <svg {...base(size)} className={className}>
      {title ? <title>{title}</title> : null}
      <path d="M12 3 L21 12 L12 21 L3 12 Z" />
      <path d="M12 3 L12 21" opacity="0.4" />
      <path d="M3 12 L21 12" opacity="0.4" />
    </svg>
  );
}

/* Agent — a triangular envoy with a small inner mark */
export function GlyphAgent({ size = 16, className, title }: GlyphProps) {
  return (
    <svg {...base(size)} className={className}>
      {title ? <title>{title}</title> : null}
      <path d="M12 3 L21 20 L3 20 Z" />
      <circle cx="12" cy="14" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* Command — slash with a flanking hairline (literal but elegant) */
export function GlyphCommand({ size = 16, className, title }: GlyphProps) {
  return (
    <svg {...base(size)} className={className}>
      {title ? <title>{title}</title> : null}
      <path d="M15 3 L9 21" />
      <path d="M4 8 L4 8.01" opacity="0.6" />
      <path d="M20 16 L20 16.01" opacity="0.6" />
      <path d="M3 12 L6 12" opacity="0.5" />
      <path d="M18 12 L21 12" opacity="0.5" />
    </svg>
  );
}

/* Hook — two interlocked arcs (a hook in profile) */
export function GlyphHook({ size = 16, className, title }: GlyphProps) {
  return (
    <svg {...base(size)} className={className}>
      {title ? <title>{title}</title> : null}
      <path d="M8 3 L8 13 a4 4 0 0 0 8 0 L16 8" />
      <path d="M5 3 L11 3" />
    </svg>
  );
}

/* MCP — a node connected by two faint chords (a relay) */
export function GlyphMcp({ size = 16, className, title }: GlyphProps) {
  return (
    <svg {...base(size)} className={className}>
      {title ? <title>{title}</title> : null}
      <circle cx="12" cy="12" r="3.2" />
      <circle cx="4" cy="6" r="1.4" />
      <circle cx="20" cy="6" r="1.4" />
      <circle cx="4" cy="18" r="1.4" />
      <circle cx="20" cy="18" r="1.4" />
      <path d="M5.3 7 L9.2 10.4" opacity="0.5" />
      <path d="M18.7 7 L14.8 10.4" opacity="0.5" />
      <path d="M5.3 17 L9.2 13.6" opacity="0.5" />
      <path d="M18.7 17 L14.8 13.6" opacity="0.5" />
    </svg>
  );
}

/* Fork — a marker for forked repos. Two branches descending. */
export function GlyphFork({ size = 14, className, title }: GlyphProps) {
  return (
    <svg {...base(size)} className={className}>
      {title ? <title>{title}</title> : null}
      <circle cx="7" cy="5" r="1.6" />
      <circle cx="17" cy="5" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
      <path d="M7 6.6 L7 11 a3 3 0 0 0 3 3 L14 14 a3 3 0 0 0 3 -3 L17 6.6" />
      <path d="M12 14 L12 17.4" />
    </svg>
  );
}

/* Applied — a confident open circle with an interior mark (a sealed wax) */
export function GlyphApplied({ size = 14, className, title }: GlyphProps) {
  return (
    <svg {...base(size)} className={className}>
      {title ? <title>{title}</title> : null}
      <circle cx="12" cy="12" r="8" />
      <path d="M8.5 12.2 L11 14.6 L15.8 9.5" />
    </svg>
  );
}

/* Pending — a hollow circle with a hairline gap (the work is open) */
export function GlyphPending({ size = 14, className, title }: GlyphProps) {
  return (
    <svg {...base(size)} className={className}>
      {title ? <title>{title}</title> : null}
      <path d="M12 4 A8 8 0 1 1 4.5 14.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* Plus — for the Add button */
export function GlyphPlus({ size = 12, className, title }: GlyphProps) {
  return (
    <svg {...base(size)} className={className}>
      {title ? <title>{title}</title> : null}
      <path d="M12 4 L12 20" />
      <path d="M4 12 L20 12" />
    </svg>
  );
}

/* Close — for the remove (×) */
export function GlyphClose({ size = 12, className, title }: GlyphProps) {
  return (
    <svg {...base(size)} className={className}>
      {title ? <title>{title}</title> : null}
      <path d="M5 5 L19 19" />
      <path d="M19 5 L5 19" />
    </svg>
  );
}

/* Arrow — a thin right-arrow used for "Open →" and Apply */
export function GlyphArrow({ size = 12, className, title }: GlyphProps) {
  return (
    <svg {...base(size)} className={className}>
      {title ? <title>{title}</title> : null}
      <path d="M4 12 L20 12" />
      <path d="M14 6 L20 12 L14 18" />
    </svg>
  );
}

/* The signature mark — used in the sidebar logo / pinned moments. */
export function GlyphMark({ size = 18, className }: GlyphProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3 L12 21" opacity="0.45" />
      <path d="M3 12 L21 12" opacity="0.45" />
      <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* Map kind → glyph component for the catalogue. */
export const KIND_GLYPHS = {
  skill: GlyphSkill,
  agent: GlyphAgent,
  command: GlyphCommand,
  hook: GlyphHook,
  mcp: GlyphMcp,
} as const;
