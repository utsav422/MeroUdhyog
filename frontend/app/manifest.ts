import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mero Udhyog — Factory management workspace",
    short_name: "Mero Udhyog",
    description:
      "Run your factory with clarity — products, orders, deliveries, khata and payments in one tidy workspace, with smart forecasts for what happens next. A product of Factoryze Tech.",
    start_url: "/login",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f7f5ef",
    theme_color: "#27675c",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
