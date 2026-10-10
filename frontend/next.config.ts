import type { NextConfig } from "next";

// Old 2D photo-room links were /rooms/<style>[/<room>]; send them home. New
// /rooms/<room id> pages (each 3D room's featured catalogue) are left alone.
const OLD_ROOM_STYLES = "sleek-masculine|warm-minimal|dark-academia|gaming-minimal|modern-luxury";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/rooms", destination: "/", permanent: false },
      { source: `/rooms/:style(${OLD_ROOM_STYLES})`, destination: "/", permanent: false },
      { source: `/rooms/:style(${OLD_ROOM_STYLES})/:path*`, destination: "/", permanent: false },
      // Lamps became Lighting.
      { source: "/catalogue/lamps", destination: "/catalogue/lighting", permanent: true },
      { source: "/catalogue/lamps/:collection", destination: "/catalogue/lighting/:collection", permanent: true },
    ];
  },
};

export default nextConfig;
