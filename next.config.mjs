/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  /**
   * Handwriting marking POSTs carry multi-page PNG data URLs — default limits can break JSON parsing.
   * @see https://nextjs.org/docs/app/api-reference/next-config-js/serverActions
   */
  experimental: {
    serverActions: {
      bodySizeLimit: "32mb",
    },
  },
};

export default nextConfig;
