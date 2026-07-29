/** @type {import('next').NextConfig} */
const nextConfig = {
  // Single-container deploy via Phase 0's deploy-demo.ps1.
  output: "standalone",
  // Native module; must not be bundled by webpack.
  // Next 15 graduated this out of `experimental`.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
