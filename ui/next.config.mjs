/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // When TAURI_BUILD=1, produce a fully static export (ui/out/) so the Tauri
  // desktop shell can serve it directly without a running Next.js server.
  // The app is a pure SPA — all data fetching hits the Express API on port 3000
  // via NEXT_PUBLIC_API_URL (defaults to http://localhost:3000), so static
  // export works without any server-side rendering.
  ...(process.env.TAURI_BUILD === "1" && {
    output: "export",
    trailingSlash: true,
  }),
};

export default nextConfig;
