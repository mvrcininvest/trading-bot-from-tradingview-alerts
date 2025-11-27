import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
  // Force cache invalidation for Vercel deployments
  generateBuildId: async () => {
    return `build-${Date.now()}`;
  },
  // ✅ Optimize production build
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
  },
  // ✅ CRITICAL: Mark twilio as server-only external package (Next.js 15 approach)
  serverExternalPackages: ['twilio'],
};

export default nextConfig;
// Orchids restart: 1764152845217