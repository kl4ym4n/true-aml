/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enable standalone output only for production
  ...(process.env.NODE_ENV === 'production' && { output: 'standalone' }),
  // Enable webpack polling for Docker hot reload
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      config.watchOptions = {
        poll: 1000, // Check for changes every second
        aggregateTimeout: 300, // Delay before reloading
      };
    }
    return config;
  },
}

module.exports = nextConfig

