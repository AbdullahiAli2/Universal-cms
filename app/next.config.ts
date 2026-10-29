import type { NextConfig } from "next";

const config: NextConfig = {
  // Produces a self-contained server in .next/standalone for the Docker image.
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Keeps query strings out of the Referer header sent to other sites.
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
      { source: "/login", headers: [{ key: "Cache-Control", value: "no-store" }] },
      { source: "/setup", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default config;
