/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: false,
  experimental: {
    instrumentationHook: true,
  },
};

export default nextConfig;
