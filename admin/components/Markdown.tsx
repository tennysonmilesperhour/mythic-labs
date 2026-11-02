"use client";

import { useState, type ReactNode } from "react";

/**
 * A small Markdown renderer for notes, acceptance criteria and decisions.
 * It builds React elements, never HTML strings, so pasted text cannot inject
 * markup. Covers: headings, paragraphs, bold, italics, inline code, fenced
 * code, links (http and https only), bare URLs, bullet and numbered lists,
 * task lists, block quotes and rules.
 */

const SAFE_URL = /^https?:\/\//i;

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Tokens: code, bold, italics, links, bare URLs. Every span is bounded so a long pasted line cannot stall the renderer.
  const re = /(`[^`\n]{1,500}`)|(\*\*[^*\n]{1,500}\*\*)|(\*[^*\n]{1,500}\*|_[^_\n]{1,500}_)|(\[[^\]\n]{1,200}\]\((https?:\/\/[^\s)]{1,2000})\))|(https?:\/\/[^\s<>()"'`]{0,2000}[^\s<>()"'`.,;:!?])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${keyBase}-${i++}`;
    if (m[1]) out.push(<code key={k} className="font-mono text-[0.85em] bg-bg-warm border border-line px-1 py-px">{m[1].slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k} className="font-medium text-fg">{m[2].slice(2, -2)}</strong>);
    else if (m[3]) out.push(<em key={k}>{m[3].slice(1, -1)}</em>);
    else if (m[4]) {
      const label = m[4].slice(1, m[4].indexOf("]("));
      const url = m[5];
      out.push(
        SAFE_URL.test(url) ? (
          <a key={k} href={url} target="_blank" rel="noreferrer" className="text-accent hover:text-fg underline underline-offset-2">
            {label}
          </a>
        ) : (
          label
        )
      );
    } else if (m[6]) {
      out.push(
        <a key={k} href={m[6]} target="_blank" rel="noreferrer" className="text-accent hover:text-fg underline underline-offset-2 break-all">
          {m[6]}
        </a>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "h"; level: number; text: string }
  | { kind: "code"; lines: string[]; lang: string }
  | { kind: "ul"; items: Array<{ text: string; checked: boolean | null }> }
  | { kind: "ol"; items: string[] }
  | { kind: "quote"; lines: string[] }
  | { kind: "hr" };

function parse(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  const flushP = (buf: string[]) => {
    if (buf.length) blocks.push({ kind: "p", lines: [...buf] });
    buf.length = 0;
  };
  const buf: string[] = [];
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^```\s*(\w*)\s*$/);
    if (fence) {
      flushP(buf);
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) code.push(lines[i++]);
      i++;
      blocks.push({ kind: "code", lines: code, lang: fence[1] });
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.+)$/);
    if (h) {
      flushP(buf);
      blocks.push({ kind: "h", level: h[1].length, text: h[2] });
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      flushP(buf);
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }
    if (/^\s*([-*•])\s+/.test(line)) {
      flushP(buf);
      const items: Array<{ text: string; checked: boolean | null }> = [];
      while (i < lines.length && /^\s*([-*•])\s+/.test(lines[i])) {
        const body = lines[i].replace(/^\s*([-*•])\s+/, "");
        const task = body.match(/^\[([ xX])\]\s+(.*)$/);
        items.push(task ? { text: task[2], checked: task[1] !== " " } : { text: body, checked: null });
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      flushP(buf);
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ""));
      blocks.push({ kind: "ol", items });
      continue;
    }
    if (/^>\s?/.test(line)) {
      flushP(buf);
      const q: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push({ kind: "quote", lines: q });
      continue;
    }
    if (!line.trim()) {
      flushP(buf);
      i++;
      continue;
    }
    buf.push(line);
    i++;
  }
  flushP(buf);
  return blocks;
}

export default function Markdown({ text, className = "" }: { text: string; className?: string }) {
  if (!text.trim()) return null;
  const blocks = parse(text);
  return (
    <div className={`md ${className}`}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "h": {
            const cls = b.level === 1 ? "text-[1.15em] font-medium text-fg mt-3 mb-1" : b.level === 2 ? "text-[1.05em] font-medium text-fg mt-3 mb-1" : "mono-label-dim mt-3 mb-1";
            return <div key={i} className={cls}>{inline(b.text, `h${i}`)}</div>;
          }
          case "code":
            return (
              <pre key={i} className="font-mono text-[0.78em] leading-relaxed bg-bg/80 border border-line px-3 py-2 my-2 whitespace-pre-wrap [overflow-wrap:anywhere]">
                {b.lines.join("\n")}
              </pre>
            );
          case "ul":
            return (
              <ul key={i} className="my-1.5 flex flex-col gap-0.5">
                {b.items.map((it, j) => (
                  <li key={j} className="flex items-baseline gap-2">
                    <span className="font-mono text-[0.7em] text-accent shrink-0 w-3">{it.checked === null ? "·" : it.checked ? "✓" : "○"}</span>
                    <span className={it.checked ? "line-through text-fg-ghost" : ""}>{inline(it.text, `li${i}-${j}`)}</span>
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="my-1.5 flex flex-col gap-0.5">
                {b.items.map((it, j) => (
                  <li key={j} className="flex items-baseline gap-2">
                    <span className="font-mono text-[0.7em] text-accent shrink-0 w-4 tnum">{j + 1}.</span>
                    <span>{inline(it, `oi${i}-${j}`)}</span>
                  </li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <blockquote key={i} className="border-l-2 border-accent-light pl-3 my-1.5 text-fg-dim italic">
                {b.lines.map((l, j) => (
                  <div key={j}>{inline(l, `q${i}-${j}`)}</div>
                ))}
              </blockquote>
            );
          case "hr":
            return <hr key={i} className="border-line my-3" />;
          default:
            return (
              <p key={i} className="my-1.5 whitespace-pre-wrap">
                {b.lines.map((l, j) => (
                  <span key={j}>
                    {j ? "\n" : ""}
                    {inline(l, `p${i}-${j}`)}
                  </span>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}

/**
 * Rendered Markdown that turns into a textarea on click. Commits on blur or
 * Cmd/Ctrl+Enter; Escape cancels.
 */
export function EditableMarkdown({ value, onSave, placeholder = "Click to write…", className = "", rows }: { value: string; onSave: (v: string) => void; placeholder?: string; className?: string; rows?: number }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const commit = () => {
    setEditing(false);
    if (draft.trim() !== value) onSave(draft.trim());
  };
  if (editing) {
    return (
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
        }}
        rows={rows ?? Math.min(24, Math.max(4, draft.split("\n").length + 1))}
        className={`w-full bg-bg/80 border border-accent outline-none px-2 py-1 font-mono text-[0.85em] leading-relaxed ${className}`}
      />
    );
  }
  return (
    <div
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      title="Click to edit (Markdown)"
      className={`cursor-text hover:bg-[rgba(139,115,85,0.06)] ${className}`}
    >
      {value.trim() ? <Markdown text={value} /> : <span className="text-fg-ghost">{placeholder}</span>}
    </div>
  );
}
