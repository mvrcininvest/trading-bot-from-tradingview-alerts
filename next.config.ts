// Force Vercel rebuild - 2025-11-27 15:15
// Force Vercel rebuild - 2025-11-27 15:24 - Fixed Twilio import (lowercase)
// Force Vercel rebuild - 2025-11-27 15:30 - Use CommonJS require() for Twilio
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
  // ✅ CRITICAL: Mark twilio as server-only external package (Next.js 15 approach)
  serverExternalPackages: ['twilio'],
  
  // ✅ WEBPACK FALLBACK: Force webpack to externalize twilio completely
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Mark twilio as external for server-side bundles
      config.externals = config.externals || [];
      config.externals.push({
        twilio: 'commonjs twilio',
      });
    }
    
    return config;
  },
};

export default nextConfig;
// Orchids restart: 1764152845217