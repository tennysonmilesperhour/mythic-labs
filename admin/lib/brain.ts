import matter from "gray-matter";
import { readFile, readDir, BRAIN_OWNER, BRAIN_REPO } from "./github";

export type Marketplace = {
  name: string;
  version?: string;
  description?: string;
  plugins: Array<{ name: string; source: string; description?: string }>;
};

export type SkillSummary = {
  name: string;
  description: string;
  path: string;
};

export type AgentSummary = {
  name: string;
  description: string;
  path: string;
};

export type CommandSummary = {
  name: string;
  description: string;
  path: string;
};

export type PluginDetail = {
  slug: string;
  name: string;
  version: string;
  description: string;
  skills: SkillSummary[];
  agents: AgentSummary[];
  commands: CommandSummary[];
  hasHooks: boolean;
  hasMcp: boolean;
};

// The brain repo changes rarely; keep reads for a minute so every page
// doesn't wait on a dozen GitHub calls.
const TTL_MS = 60_000;
const memo = new Map<string, { at: number; value: Promise<unknown> }>();
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as Promise<T>;
  const value = load();
  memo.set(key, { at: Date.now(), value });
  value.catch(() => memo.delete(key));
  return value;
}

/** Forget cached brain reads, e.g. after Authoring writes a file. */
export function clearBrainCache() {
  memo.clear();
}

/**
 * Read marketplace.json from the brain repo.
 */
export function fetchMarketplace(): Promise<Marketplace> {
  return cached("marketplace", loadMarketplace);
}

async function loadMarketplace(): Promise<Marketplace> {
  const file = await readFile(
    BRAIN_OWNER,
    BRAIN_REPO,
    ".claude-plugin/marketplace.json"
  );
  if (!file) {
    throw new Error("marketplace.json not found in brain repo");
  }
  return JSON.parse(file.content) as Marketplace;
}

/**
 * Build a detailed inventory of a single plugin: its skills, agents, commands.
 */
export function fetchPluginDetail(slug: string): Promise<PluginDetail> {
  return cached(`plugin:${slug}`, () => loadPluginDetail(slug));
}

async function loadPluginDetail(slug: string): Promise<PluginDetail> {
  const manifest = await readFile(
    BRAIN_OWNER,
    BRAIN_REPO,
    `${slug}/.claude-plugin/plugin.json`
  );
  if (!manifest) throw new Error(`plugin.json not found for ${slug}`);
  const parsed = JSON.parse(manifest.content) as {
    name: string;
    version: string;
    description: string;
  };

  const [skills, agents, commands, root] = await Promise.all([
    listMarkdownInDir(slug, "skills", true),
    listMarkdownInDir(slug, "agents", false),
    listMarkdownInDir(slug, "commands", false),
    readDir(BRAIN_OWNER, BRAIN_REPO, slug),
  ]);

  const hasHooks = root.some((e) => e.name === "hooks");
  const hasMcp = root.some((e) => e.name === ".mcp.json");

  return {
    slug,
    name: parsed.name,
    version: parsed.version,
    description: parsed.description,
    skills,
    agents,
    commands,
    hasHooks,
    hasMcp,
  };
}

/**
 * List markdown items under a plugin subdirectory and parse their frontmatter.
 * Skills sit in <slug>/skills/<name>/SKILL.md (nested).
 * Agents/commands sit directly in <slug>/agents/<name>.md.
 */
async function listMarkdownInDir(
  slug: string,
  subdir: string,
  nested: boolean
): Promise<Array<{ name: string; description: string; path: string }>> {
  const entries = await readDir(BRAIN_OWNER, BRAIN_REPO, `${slug}/${subdir}`);
  const items = await Promise.all(
    entries.map(async (entry) => {
      if (nested ? entry.type !== "dir" : entry.type !== "file" || !entry.name.endsWith(".md")) return null;
      const path = nested ? `${entry.path}/SKILL.md` : entry.path;
      const file = await readFile(BRAIN_OWNER, BRAIN_REPO, path);
      if (!file) return null;
      const fm = matter(file.content).data as {
        name?: string;
        description?: string;
      };
      return {
        name: fm.name || (nested ? entry.name : entry.name.replace(/\.md$/, "")),
        description: fm.description || "",
        path,
      };
    })
  );
  return items.filter((x): x is { name: string; description: string; path: string } => x !== null);
}
