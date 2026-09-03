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
};

export default nextConfig;
