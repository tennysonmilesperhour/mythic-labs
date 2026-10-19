// Kept free of server-only imports so client components can render snippets.

export function renderSettingsJson(
  brainRepo: string,
  marketplaceName: string,
  enabled: Record<string, boolean>
): string {
  const obj = {
    extraKnownMarketplaces: {
      [marketplaceName]: {
        source: { source: "github", repo: brainRepo },
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
