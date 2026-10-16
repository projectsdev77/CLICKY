import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@clicky/db", "@clicky/shared"],
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
