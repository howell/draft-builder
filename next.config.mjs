/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Suppress webpack warnings about dynamic imports in @supabase/realtime-js
    config.ignoreWarnings = [
      /Critical dependency: the request of a dependency is an expression/
    ];
    return config;
  }
};

export default nextConfig;
