import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/rooms", destination: "/", permanent: false },
      { source: "/rooms/:path*", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
