import type { MetadataRoute } from "next";

// Lets Chrome, Edge and Safari install the dashboard as its own desktop app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mythic Labs",
    short_name: "Mythic Labs",
    description: "Your projects, approvals and messages with your agents.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#1c1a17",
    theme_color: "#1c1a17",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      { name: "Messages", url: "/messages" },
      { name: "Approvals", url: "/approvals" },
      { name: "Today", url: "/today" },
    ],
  };
}
