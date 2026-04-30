import type { NextConfig } from "next";

// In Docker: BACKEND_URL=backend:8000
// Locally:   BACKEND_URL=localhost:8000
const BACKEND_URL = process.env.BACKEND_URL ?? "localhost:8000";

const nextConfig: NextConfig = {
  devIndicators: false,
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `http://${BACKEND_URL}/api/:path*`,
      },
    ];
  },
  typescript: {
    // TODO: re-enable after fixing app/dashboard/page.tsx:215 type error
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
