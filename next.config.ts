// Force Vercel rebuild - 2025-11-27 15:15
// Force Vercel rebuild - 2025-11-27 15:24 - Fixed Twilio import (lowercase)
// Force Vercel rebuild - 2025-11-27 15:30 - Use CommonJS require() for Twilio
// Force Vercel rebuild - 2025-11-27 15:35 - Use Twilio REST API (no package dependency!)
import type { NextConfig } from 'next';

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
};

export default nextConfig;
// Orchids restart: 1764152845217