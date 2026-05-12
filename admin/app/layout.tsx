import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import LivingCanvas from "@/components/LivingCanvas";

export const metadata: Metadata = {
  title: "Mythic Labs · Brain Admin",
  description:
    "Central brain admin — manage skills, plugins, and consuming repos.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,400&family=Space+Grotesk:wght@300;400;500;600&family=JetBrains+Mono:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <LivingCanvas />
        <div className="page-stack flex min-h-screen">
          <Sidebar />
          <main className="flex-1 ml-64">
            <div className="max-w-6xl mx-auto px-12 py-20">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
