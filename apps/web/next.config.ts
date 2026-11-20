import type { NextConfig } from "next";

const security = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Referrer-Policy", value: "no-referrer" },
];

const nextConfig: NextConfig = {
  transpilePackages: ["ncrypted"],
  // @x402/next loads "@x402/extensions/bazaar" with a runtime import() that bundlers skip. Bundled, the
  // package never reaches the function's node_modules and that import fails on every paid request
  // ("Failed to load bazaar extension"). Kept external, it is traced into the function with its deps.
  serverExternalPackages: ["@x402/extensions"],
  async headers() {
    return [
      { source: "/:path*", headers: security },
      {
        source: "/:kind(s|r)/:id",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cache-Control", value: "no-store" },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
          },
        ],
      },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
