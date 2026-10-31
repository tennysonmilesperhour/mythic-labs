import Link from "next/link";
import CopyBlock from "@/components/CopyBlock";

type Step = { text: string; url?: string; copy?: string };

const VERCEL_ENV_STEPS: Step[] = [
  { text: "Open the dashboard's project on Vercel, then Settings → Environment Variables.", url: "https://vercel.com/dashboard" },
];
const REDEPLOY: Step = {
  text: "Redeploy so the new values load: Deployments → latest → ⋯ → Redeploy. Then reload this dashboard.",
  url: "https://vercel.com/dashboard",
};

export default function SourceFix({ source, brain }: { source: string; brain: string }) {
  const map: Record<string, { title: string; why: React.ReactNode; done: string; steps: Step[]; links: Array<[string, string]> }> = {
    store: {
      title: "Connect the project store",
      why: "Projects, tasks and logs live as files in a private GitHub repo. Without it, every project section is empty.",
      done: "Overview shows Project store ● Connected with your project count.",
      steps: [
        { text: "Create a private repo for the data (or pick an existing private one). It needs one existing branch, e.g. main.", url: "https://github.com/new" },
        {
          text: "Create a fine-grained token with Contents: Read and write on that private repo and on the brain repo.",
          url: "https://github.com/settings/personal-access-tokens/new",
        },
        ...VERCEL_ENV_STEPS,
        {
          text: "Add these four variables (Production), with your values in place of the placeholders.",
          copy: `PM_DATA_OWNER=<your-github-user>\nPM_DATA_REPO=<private-data-repo>\nPM_DATA_BRANCH=main\nGITHUB_TOKEN=<token from step 2>`,
        },
        REDEPLOY,
      ],
      links: [
        ["Your repositories", "https://github.com/settings/repositories"],
        ["Fine-grained tokens", "https://github.com/settings/personal-access-tokens"],
        ["Vercel dashboard", "https://vercel.com/dashboard"],
      ],
    },
    market: {
      title: "Connect the plugin marketplace",
      why: (
        <>
          The dashboard reads .claude-plugin/marketplace.json from{" "}
          <a href={`https://github.com/${brain}`} target="_blank" rel="noreferrer" className="text-accent hover:text-fg">{brain} ↗</a>.
          Plugins, Brain and Authoring depend on it.
        </>
      ),
      done: "Overview shows Plugin marketplace ● Connected with the plugin count.",
      steps: [
        { text: `Check the file exists on the default branch of ${brain}.`, url: `https://github.com/${brain}/blob/main/.claude-plugin/marketplace.json` },
        {
          text: "Make sure GITHUB_TOKEN can read that repo. Edit the token and add it under Repository access.",
          url: "https://github.com/settings/personal-access-tokens",
        },
        ...VERCEL_ENV_STEPS,
        { text: "Confirm these values (only needed if the brain moved).", copy: `BRAIN_OWNER=${brain.split("/")[0]}\nBRAIN_REPO=${brain.split("/")[1]}` },
        REDEPLOY,
      ],
      links: [
        ["Brain repo", `https://github.com/${brain}`],
        ["marketplace.json", `https://github.com/${brain}/blob/main/.claude-plugin/marketplace.json`],
      ],
    },
    agent: {
      title: "Turn on the agent API",
      why: "With it on, agents read the roadmap and claim and report tasks themselves. The README asks for a separate approval before enabling it: the token is shared and the agent label is not identity.",
      done: "Overview shows Agent API ● On, and the curl below returns Markdown.",
      steps: [
        { text: "Decide it's OK to enable (read the security note first).", url: `https://github.com/${brain}/blob/main/admin/README.md` },
        { text: "Generate a long random token in a terminal.", copy: "openssl rand -hex 32" },
        ...VERCEL_ENV_STEPS,
        { text: "Add both variables (Production).", copy: "PM_AGENT_API_ENABLED=true\nPM_AGENT_TOKEN=<output of step 2>" },
        REDEPLOY,
        {
          text: "Test it (replace the URL with this dashboard's address).",
          copy: `curl -s -H "Authorization: Bearer <PM_AGENT_TOKEN>" "https://<dashboard>/api/agent/roadmap?agent=me"`,
        },
      ],
      links: [
        ["Admin README", `https://github.com/${brain}/blob/main/admin/README.md`],
        ["roadmap skill", `https://github.com/${brain}/tree/main/dev-workflows/skills/roadmap`],
      ],
    },
  };
  const m = map[source];
  if (!m) {
    return (
      <p className="text-fg-dim text-sm">
        Unknown source. <Link href="/" className="text-accent underline">Back to Overview</Link>
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_18rem] gap-12">
      <div>
        <h1 className="serif-display text-[2.2rem] md:text-[2.8rem] leading-[1.05] mb-3">{m.title}</h1>
        <p className="text-fg-dim text-[0.95rem] leading-relaxed mb-6 max-w-2xl">{m.why}</p>
        <div className="border border-accent bg-[rgba(139,115,85,0.04)] px-4 py-3 mb-8 text-[0.9rem]">
          <span className="mono-label mr-2">Done when</span>
          {m.done}
        </div>
        <ol className="flex flex-col gap-6">
          {m.steps.map((s, i) => (
            <li key={i} className="flex gap-4">
              <span className="font-mono text-[0.7rem] text-accent w-5 shrink-0 pt-0.5">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[0.92rem] text-fg leading-relaxed">
                  {s.text}
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer" className="ml-2 font-mono text-[0.62rem] text-accent hover:text-fg">open ↗</a>
                  ) : null}
                </p>
                {s.copy ? <div className="mt-2"><CopyBlock text={s.copy} /></div> : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
      <aside>
        <div className="hairline-accent-sm mb-3"><span className="mono-label">Links</span></div>
        <ul className="flex flex-col">
          {m.links.map(([label, url]) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noreferrer" className="block py-1 text-[0.85rem] text-fg hover:text-accent">{label} ↗</a>
            </li>
          ))}
          <li>
            <Link href="/" className="block py-1 text-[0.85rem] text-fg hover:text-accent">Check status on Overview →</Link>
          </li>
        </ul>
      </aside>
    </div>
  );
}
