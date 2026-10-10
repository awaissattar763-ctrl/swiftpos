/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: '/swiftpos',
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
