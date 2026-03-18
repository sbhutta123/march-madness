/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",         // Static HTML export for GitHub Pages
  trailingSlash: true,      // Needed for GitHub Pages routing
  images: { unoptimized: true },

  // If your repo is github.com/USERNAME/march-madness, set basePath:
  // basePath: "/march-madness",
  // assetPrefix: "/march-madness/",
  // Uncomment the two lines above and replace "march-madness" with your repo name.
};

module.exports = nextConfig;
