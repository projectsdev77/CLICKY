import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@clicky/db", "@clicky/shared"],
  experimental: {
    // Knowledge-base uploads (PDFs, docs) go through a server action.
    serverActions: { bodySizeLimit: "12mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
