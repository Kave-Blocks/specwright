import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
