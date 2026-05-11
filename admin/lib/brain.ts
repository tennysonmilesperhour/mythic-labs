import matter from "gray-matter";
import { readFile, readDir, BRAIN_OWNER, BRAIN_REPO } from "./github";

export type Marketplace = {
  name: string;
  displayName?: string;
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

/**
 * Read marketplace.json from the brain repo.
 */
export async function fetchMarketplace(): Promise<Marketplace> {
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
export async function fetchPluginDetail(slug: string): Promise<PluginDetail> {
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
  const out: Array<{ name: string; description: string; path: string }> = [];

  for (const entry of entries) {
    if (nested) {
      if (entry.type !== "dir") continue;
      const file = await readFile(
        BRAIN_OWNER,
        BRAIN_REPO,
        `${entry.path}/SKILL.md`
      );
      if (!file) continue;
      const fm = matter(file.content).data as {
        name?: string;
        description?: string;
      };
      out.push({
        name: fm.name || entry.name,
        description: fm.description || "",
        path: `${entry.path}/SKILL.md`,
      });
    } else {
      if (entry.type !== "file" || !entry.name.endsWith(".md")) continue;
      const file = await readFile(BRAIN_OWNER, BRAIN_REPO, entry.path);
      if (!file) continue;
      const fm = matter(file.content).data as {
        name?: string;
        description?: string;
      };
      out.push({
        name: fm.name || entry.name.replace(/\.md$/, ""),
        description: fm.description || "",
        path: entry.path,
      });
    }
  }

  return out;
}

/**
 * Build the contents of a consuming repo's .claude/settings.json.
 */
export function renderSettingsJson(
  brainOwner: string,
  brainRepo: string,
  marketplaceName: string,
  enabled: Record<string, boolean>
): string {
  const obj = {
    _comment:
      "Auto-managed by Mythic Labs · Brain Admin. Edit via the dashboard.",
    extraKnownMarketplaces: {
      [marketplaceName]: {
        source: { source: "github", repo: `${brainOwner}/${brainRepo}` },
      },
    },
    enabledPlugins: Object.fromEntries(
      Object.entries(enabled).map(([slug, on]) => [
        `${slug}@${marketplaceName}`,
        on,
      ])
    ),
  };
  return JSON.stringify(obj, null, 2) + "\n";
}
