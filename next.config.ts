import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

// Covers are hotlinked from the lookup services, so images may come from any https host.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  // The embedded database ships its own WebAssembly files; keep it out of the bundle.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Dev only: other devices allowed to load the dev server (a phone on your private network, say).
  // Comma-separated host names or addresses in DEV_ORIGINS, kept in .env.local.
  allowedDevOrigins: process.env.DEV_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean),
  // The sign-in check reads every request first and keeps only this much of the body. An import file
  // carries every capture image, so the 10 MB default would cut a big backup short and refuse it.
  // Raised only off Vercel: that body is read before the sign-in check, so a hosted copy keeps the
  // default (Vercel refuses anything over about 4.5 MB anyway). Big imports run from a computer instead.
  ...(process.env.VERCEL ? {} : { experimental: { proxyClientMaxBodySize: "512mb" } }),
  poweredByHeader: false,
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
