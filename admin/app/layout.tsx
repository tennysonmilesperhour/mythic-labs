import type { Metadata } from "next";
import "./globals.css";
import Sidebar, { MobileNav } from "@/components/Sidebar";
import LivingCanvas from "@/components/LivingCanvas";
import CommandLayer from "@/components/CommandLayer";
import { ToastProvider } from "@/components/Toast";
import { ThemeScript } from "@/components/Theme";

export const metadata: Metadata = {
  title: "Mythic Labs · Brain Admin",
  description:
    "Mythic Labs: the roadmap for everything you're building, and the shared brain of skills and tools your coding agents use.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,400&family=Space+Grotesk:wght@300;400;500;600&family=JetBrains+Mono:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ToastProvider>
          <CommandLayer>
            <LivingCanvas />
            <div className="page-stack flex min-h-screen">
              <Sidebar />
              <main className="flex-1 min-w-0 md:ml-64">
                <MobileNav />
                <div className="max-w-6xl mx-auto px-4 py-8 md:px-12 md:py-20">{children}</div>
              </main>
            </div>
          </CommandLayer>
        </ToastProvider>
      </body>
    </html>
  );
}
