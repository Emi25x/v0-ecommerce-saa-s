/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enforce build-time checks — never set these to true
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },

  images: {
    unoptimized: true,
  },

  serverExternalPackages: ["node-forge", "puppeteer-core", "@sparticuz/chromium-min"],
}

export default nextConfig
