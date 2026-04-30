import type { NextConfig } from "next";

const BACKEND_URL = process.env.BACKEND_URL ?? "localhost:8000";

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `http://${BACKEND_URL}/api/:path*`,
      },
    ];
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
