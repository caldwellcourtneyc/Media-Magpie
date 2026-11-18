import type { Metadata, Viewport } from "next";
import { Figtree, Jost, Schibsted_Grotesk } from "next/font/google";
import { APP_NAME } from "@/lib/config";
import "./globals.css";

// One pairing for both modes: B's Schibsted Grotesk for display, Figtree for body.
const display = Schibsted_Grotesk({ subsets: ["latin"], weight: ["500", "700", "900"], variable: "--font-display" });
const bodyFont = Figtree({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-body" });
// The wordmark only (components/Logo.tsx): thin "Media" over heavy "Magpie".
const brandFont = Jost({ subsets: ["latin"], weight: ["200", "900"], variable: "--font-brand" });

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Everything watched, heard and read, in one diary.",
  // Logo sources and the export script: design/logo-options/final (owner-only, not in git).
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-icon.png",
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#040f22" },
    { media: "(prefers-color-scheme: light)", color: "#eef0f6" },
  ],
};

// Applies a saved light/dark override before first paint, so there is no flash.
const themeScript = `try{var t=localStorage.getItem('ml-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${bodyFont.variable} ${brandFont.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
