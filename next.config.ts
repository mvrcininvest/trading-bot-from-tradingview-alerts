import type { NextConfig } from "next";
import path from "node:path";

const LOADER = path.resolve(__dirname, 'src/visual-edits/component-tagger-loader.js');

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
  turbopack: {
    rules: {
      "*.{jsx,tsx}": {
        loaders: [LOADER]
      }
    }
  },
  // Force cache invalidation - Vercel rebuild v2
  generateBuildId: async () => {
    return `build-v2-${Date.now()}`;
  },
};

export default nextConfig;
// Orchids rebuild: 2025-11-23T21:00:00.000Z