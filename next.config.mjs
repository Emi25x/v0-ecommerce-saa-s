/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ["node-forge", "puppeteer-core", "@sparticuz/chromium-min"],
}

export default nextConfig
