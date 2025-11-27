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
  // ✅ Mark twilio as external to prevent webpack bundling issues
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Mark twilio as external on server-side builds
      config.externals = config.externals || [];
      config.externals.push('twilio');
    }
    return config;
  },
};

export default nextConfig;
// Orchids restart: 1764152845217