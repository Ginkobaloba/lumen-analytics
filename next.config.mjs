/** @type {import('next').NextConfig} */
const nextConfig = {
  // Single-container deploy via Phase 0's deploy-demo.ps1.
  output: "standalone",
  experimental: {
    // Native module; must not be bundled by webpack.
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
};

export default nextConfig;
