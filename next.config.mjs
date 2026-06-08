/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 16 uses Turbopack by default. The previous `webpack()` config
  // only suppressed a webpack-specific "Critical dependency" warning from
  // @supabase/realtime-js, which Turbopack does not emit, so no equivalent
  // config is needed here.
  turbopack: {},
};

export default nextConfig;
