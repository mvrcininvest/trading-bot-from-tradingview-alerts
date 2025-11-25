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
  // ✅ DISABLED: Custom loader and turbopack to fix Vercel chunk loading errors
  // turbopack: {
  //   rules: {
  //     "*.{jsx,tsx}": {
  //       loaders: [LOADER]
  //     }
  //   }
  // },
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