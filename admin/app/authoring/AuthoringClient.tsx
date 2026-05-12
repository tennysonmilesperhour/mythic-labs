"use client";

import { useState } from "react";
import type { Marketplace } from "@/lib/brain";

type Tab = "mcp" | "command" | "verify";

export default function AuthoringClient({
  marketplace,
}: {
  marketplace: Marketplace;
}) {
  const [tab, setTab] = useState<Tab>("mcp");

  return (
    <div>
      <div className="flex border border-line bg-line gap-px">
        {(
          [
            ["mcp", "Add MCP server"],
            ["command", "Create command"],
            ["verify", "Verify wiring"],
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            data-active={tab === key}
            className={`accent-sweep relative flex-1 py-4 px-6 font-mono text-[0.7rem] tracking-[0.25em] uppercase ease-mythic ${
              tab === key
                ? "bg-[rgba(139,115,85,0.08)] text-accent"
                : "bg-bg/70 text-fg-ghost hover:text-fg"
            }`}
            style={{
              transition:
                "color var(--motion-base) var(--ease-mythic), background-color var(--motion-base) var(--ease-mythic)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="border border-t-0 border-line bg-bg-warm/80 p-9">
        {tab === "mcp" ? <McpForm marketplace={marketplace} /> : null}
        {tab === "command" ? <CommandForm marketplace={marketplace} /> : null}
        {tab === "verify" ? <VerifyForm /> : null}
      </div>
    </div>
  );
}

// ─────────────── MCP form ───────────────

function McpForm({ marketplace }: { marketplace: Marketplace }) {
  const [plugin, setPlugin] = useState(marketplace.plugins[0]?.name || "");
  const [serverName, setServerName] = useState("");
  const [command, setCommand] = useState("npx");
  const [argsText, setArgsText] = useState("");
  const [envText, setEnvText] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setResult(null);
    const args = argsText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const env: Record<string, string> = {};
    for (const line of envText.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.+)$/);
      if (m) env[m[1]] = m[2].trim();
    }
    try {
      const res = await fetch("/api/authoring/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plugin_slug: plugin,
          server_name: serverName,
          command,
          args,
          env: Object.keys(env).length ? env : undefined,
        }),
      });
      const json = await res.json();
      if (json.error) setResult(`✗ ${json.error}`);
      else
        setResult(
          `✓ committed ${json.path} · sha ${json.commit_sha.slice(0, 7)}`
        );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="bg-bg/70 border border-line p-5 mb-8 max-w-3xl">
        <div className="mono-label mb-2">What this does</div>
        <p className="text-fg-dim text-sm leading-relaxed">
          Picks a plugin in the brain repo, opens its{" "}
          <code className="font-mono text-fg text-sm">.mcp.json</code>, and adds
          (or updates) the MCP server you describe below. Every consuming repo
          that has this plugin enabled inherits the server on its next session —
          no need to commit anything to those repos.
        </p>
        <p className="text-fg-ghost text-xs leading-relaxed mt-3 font-mono">
          Example · plugin: comms · name: gmail · command: npx · args:
          @gongrzhe/server-gmail-autoauth-mcp
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <Field label="Plugin">
          <select
            value={plugin}
            onChange={(e) => setPlugin(e.target.value)}
            className="w-full bg-bg/70 border border-line focus:outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-glow)] px-4 py-3 font-mono text-sm text-fg"
          >
            {marketplace.plugins.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Server name">
          <input
            value={serverName}
            onChange={(e) => setServerName(e.target.value)}
            placeholder="e.g. github"
            className="w-full bg-bg/70 border border-line focus:outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-glow)] px-4 py-3 font-mono text-sm text-fg placeholder:text-fg-ghost"
          />
        </Field>
      </div>

      <Field label="Command">
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          className="w-full bg-bg/70 border border-line focus:outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-glow)] px-4 py-3 font-mono text-sm text-fg"
        />
      </Field>

      <div className="mt-6">
        <Field label="Args (one per line)">
          <textarea
            value={argsText}
            onChange={(e) => setArgsText(e.target.value)}
            rows={3}
            placeholder={"@anthropic-ai/github-mcp-server"}
            className="w-full bg-bg/70 border border-line focus:outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-glow)] px-4 py-3 font-mono text-sm text-fg placeholder:text-fg-ghost"
          />
        </Field>
      </div>

      <div className="mt-6">
        <Field label="Env (KEY=value per line, optional)">
          <textarea
            value={envText}
            onChange={(e) => setEnvText(e.target.value)}
            rows={3}
            placeholder={"GITHUB_TOKEN=${env:GITHUB_TOKEN}"}
            className="w-full bg-bg/70 border border-line focus:outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-glow)] px-4 py-3 font-mono text-sm text-fg placeholder:text-fg-ghost"
          />
        </Field>
      </div>

      <div className="flex justify-between items-center mt-8 pt-6 border-t border-line">
        <div className="font-mono text-xs text-fg-ghost">{result}</div>
        <button
          onClick={submit}
          disabled={busy || !plugin || !serverName || !command}
          className="lift-on-hover font-mono text-[0.7rem] tracking-[0.25em] uppercase px-8 py-3 bg-accent text-bg disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? "Committing…" : "Commit to brain"}
        </button>
      </div>
    </div>
  );
}

// ─────────────── Command form ───────────────

function CommandForm({ marketplace }: { marketplace: Marketplace }) {
  const [plugin, setPlugin] = useState(marketplace.plugins[0]?.name || "");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [argHint, setArgHint] = useState("");
  const [body, setBody] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/authoring/command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plugin_slug: plugin,
          command_name: name,
          description,
          argument_hint: argHint || undefined,
          body,
        }),
      });
      const json = await res.json();
      if (json.error) setResult(`✗ ${json.error}`);
      else
        setResult(
          `✓ ${json.invocation} · committed ${json.path} · ${json.commit_sha.slice(0, 7)}`
        );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="bg-bg/70 border border-line p-5 mb-8 max-w-3xl">
        <div className="mono-label mb-2">What this does</div>
        <p className="text-fg-dim text-sm leading-relaxed">
          Writes a new <code className="font-mono text-fg text-sm">.md</code>{" "}
          file under{" "}
          <code className="font-mono text-fg text-sm">
            &lt;plugin&gt;/commands/
          </code>{" "}
          in the brain repo with the frontmatter Claude Code needs. After commit
          it becomes invocable as{" "}
          <code className="font-mono text-fg text-sm">
            /&lt;plugin&gt;:&lt;name&gt;
          </code>{" "}
          in every consuming repo that has this plugin enabled.
        </p>
        <p className="text-fg-ghost text-xs leading-relaxed mt-3 font-mono">
          Example · plugin: brand-systems · name: diagnose · description: Run
          archetypal analysis on the provided artifact.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <Field label="Plugin">
          <select
            value={plugin}
            onChange={(e) => setPlugin(e.target.value)}
            className="w-full bg-bg/70 border border-line focus:outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-glow)] px-4 py-3 font-mono text-sm text-fg"
          >
            {marketplace.plugins.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Command name (slug)">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. diagnose"
            className="w-full bg-bg/70 border border-line focus:outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-glow)] px-4 py-3 font-mono text-sm text-fg placeholder:text-fg-ghost"
          />
        </Field>
      </div>

      <Field label="Description (what + when to use)">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Run an archetypal diagnosis on the provided artifact."
          className="w-full bg-bg/70 border border-line focus:outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-glow)] px-4 py-3 font-mono text-sm text-fg placeholder:text-fg-ghost"
        />
      </Field>

      <div className="mt-6">
        <Field label="Argument hint (optional)">
          <input
            value={argHint}
            onChange={(e) => setArgHint(e.target.value)}
            placeholder="<brand-name | URL | paste artifact>"
            className="w-full bg-bg/70 border border-line focus:outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-glow)] px-4 py-3 font-mono text-sm text-fg placeholder:text-fg-ghost"
          />
        </Field>
      </div>

      <div className="mt-6">
        <Field label="Body (markdown)">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            placeholder={
              "Steps:\n\n1. Do X with $ARGUMENTS\n2. Then Y\n3. Report in the format …"
            }
            className="w-full bg-bg/70 border border-line focus:outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-glow)] px-4 py-3 font-mono text-sm text-fg leading-relaxed placeholder:text-fg-ghost"
          />
        </Field>
      </div>

      <div className="flex justify-between items-center mt-8 pt-6 border-t border-line">
        <div className="font-mono text-xs text-fg-ghost">{result}</div>
        <button
          onClick={submit}
          disabled={busy || !plugin || !name || !description || !body}
          className="lift-on-hover font-mono text-[0.7rem] tracking-[0.25em] uppercase px-8 py-3 bg-accent text-bg disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? "Committing…" : "Create command"}
        </button>
      </div>
    </div>
  );
}

// ─────────────── Verify form ───────────────

type VerifyResult = {
  ok: boolean;
  marketplace_declared?: boolean;
  enabled?: string[];
  unknown_plugins?: string[];
  missing_plugins?: string[];
  reason?: string;
  message?: string;
  error?: string;
};

function VerifyForm() {
  const [target, setTarget] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setResult(null);
    const cleaned = target
      .replace(/^https?:\/\/github\.com\//i, "")
      .replace(/\.git$/i, "");
    const [owner, repo] = cleaned.split("/").filter(Boolean);
    if (!owner || !repo) {
      setResult({ ok: false, error: "Use owner/repo format" });
      setBusy(false);
      return;
    }
    try {
      const res = await fetch(
        `/api/verify/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
      );
      const json = await res.json();
      setResult(json);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="bg-bg/70 border border-line p-5 mb-8 max-w-3xl">
        <div className="mono-label mb-2">What this does</div>
        <p className="text-fg-dim text-sm leading-relaxed">
          Fetches a repo's{" "}
          <code className="font-mono text-fg text-sm">
            .claude/settings.json
          </code>{" "}
          directly from GitHub and audits it: is the brain marketplace declared,
          which plugins does the repo claim to enable, are any of them unknown
          (typos or removed), and which are missing from its config. Catches
          drift between what this dashboard thinks is on a repo and what's
          actually committed.
        </p>
      </div>

      <div className="flex gap-3 mb-8">
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="owner/repo"
          className="flex-1 bg-bg border border-line px-4 py-3 font-mono text-sm text-fg placeholder:text-fg-ghost"
        />
        <button
          onClick={submit}
          disabled={busy || !target.trim()}
          className="lift-on-hover font-mono text-[0.7rem] tracking-[0.25em] uppercase px-8 bg-accent text-bg disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? "Checking…" : "Verify"}
        </button>
      </div>

      {result ? (
        <div
          className={`border p-6 ${
            result.ok
              ? "border-accent bg-[rgba(139,115,85,0.06)]"
              : "border-line bg-bg"
          }`}
        >
          <div className="mono-label mb-4">
            {result.ok ? "✓ Wired" : "✗ Not wired"}
          </div>
          {result.error ? (
            <div className="font-mono text-sm text-fg">{result.error}</div>
          ) : null}
          {result.message ? (
            <div className="font-mono text-sm text-fg-dim">{result.message}</div>
          ) : null}
          {result.enabled?.length ? (
            <div className="mt-3">
              <div className="font-mono text-xs text-fg-ghost mb-1">Enabled:</div>
              <div className="font-mono text-sm text-fg">
                {result.enabled.join(", ")}
              </div>
            </div>
          ) : null}
          {result.unknown_plugins?.length ? (
            <div className="mt-3">
              <div className="font-mono text-xs text-fg-ghost mb-1">
                Unknown plugins (typo or removed?):
              </div>
              <div className="font-mono text-sm text-fg">
                {result.unknown_plugins.join(", ")}
              </div>
            </div>
          ) : null}
          {result.missing_plugins?.length ? (
            <div className="mt-3">
              <div className="font-mono text-xs text-fg-ghost mb-1">
                Plugins not yet declared (default false):
              </div>
              <div className="font-mono text-sm text-fg-dim">
                {result.missing_plugins.join(", ")}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ─────────────── shared ───────────────

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="font-mono text-[0.6rem] tracking-[0.25em] uppercase text-accent mb-2">
        {label}
      </div>
      {children}
    </div>
  );
}
