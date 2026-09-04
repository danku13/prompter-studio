import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Явный корень воркспейса: в репозитории есть apk/ со своим package.json,
  // иначе Turbopack может неверно определить корень.
  turbopack: {
    root: path.resolve(__dirname),
  },
  allowedDevOrigins: ["*.space-z.ai", "localhost"],
  // Скромные security-заголовки (аудит 2026-09): без X-Frame-Options/CSP
  // frame-ancestors — превью-панель песочницы встраивает приложение в iframe.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
