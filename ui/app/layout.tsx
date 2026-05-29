import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Providers } from "./providers";
import { themeInitScript } from "@/components/theme-provider";
import { TopNav } from "@/components/top-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "openzigs-social",
  description: "Focused, agentic, local-first social media manager."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          // No-FOUC: apply persisted theme before first paint.
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>
          <TopNav />
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
