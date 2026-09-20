import type { NextConfig } from "next";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.196", "localhost","192.168.0.199","https://mero-udhyog.vercel.app/"],
  webpack: (config) => {
    config.resolve.alias.canvas = require.resolve("./lib/vendor/canvas-stub.js");
    return config;
  },
  turbopack: {
    resolveAlias: {
      canvas: "./lib/vendor/canvas-stub.js", 
    },
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
      {
        source: "/health",
        destination: `${BACKEND_URL}/health`,
      },
      {
        source: "/docs",
        destination: `${BACKEND_URL}/docs`,
      },
      {
        source: "/redoc",
        destination: `${BACKEND_URL}/redoc`,
      },
      {
        source: "/openapi.json",
        destination: `${BACKEND_URL}/openapi.json`,
      },
    ];
  },
};

export default nextConfig;
