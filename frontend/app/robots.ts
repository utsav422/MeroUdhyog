import type { MetadataRoute } from "next";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.meroudhyog.com";

const privateRoutes = [
  "/api/",
  "/accounting",
  "/audits",
  "/categories",
  "/customers",
  "/dashboard",
  "/deliveries",
  "/finance",
  "/imports",
  "/khata",
  "/orders",
  "/payments",
  "/predictions",
  "/products",
  "/roles",
  "/routes",
  "/settings",
  "/staff",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/login", "/register"],
        disallow: privateRoutes,
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
