import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only. Another machine on the LAN reaches the dev server by IP or mDNS
  // name, which Next treats as a cross-origin request to /_next assets and
  // blocks unless the origin is listed here. LAN_DEV_ORIGIN overrides the IP
  // when DHCP hands out a different one.
  allowedDevOrigins: [
    process.env.LAN_DEV_ORIGIN ?? "192.168.0.54",
    "Ivans-MacBook-Pro.local",
  ],
  images: {
    // Allow Clerk-hosted avatar images (used for user / collaborator avatars).
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.clerk.com",
      },
    ],
  },
};

export default nextConfig;
