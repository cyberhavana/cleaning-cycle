import type { NextConfig } from "next";

const isCloudflarePagesBuild = process.env.CLOUDFLARE_PAGES_BUILD === "1";

const nextConfig: NextConfig = {
  output: isCloudflarePagesBuild ? "export" : undefined,
  trailingSlash: isCloudflarePagesBuild,
  images: isCloudflarePagesBuild ? { unoptimized: true } : undefined,
};

export default nextConfig;
