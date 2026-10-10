import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/rooms", destination: "/", permanent: false },
      { source: "/rooms/:path*", destination: "/", permanent: false },
      // Lamps became Lighting.
      { source: "/catalogue/lamps", destination: "/catalogue/lighting", permanent: true },
      { source: "/catalogue/lamps/:collection", destination: "/catalogue/lighting/:collection", permanent: true },
    ];
  },
};

export default nextConfig;
