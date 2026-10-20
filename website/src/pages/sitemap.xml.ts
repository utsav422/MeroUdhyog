import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

export const GET: APIRoute = async ({ site }) => {
  const url = site?.toString() ?? "https://mero-udhyog.vercel.app";

  const staticPages = ["/", "/about/", "/blog/", "/contact/"];
  const posts = await getCollection("blog");
  const paths = [...staticPages, ...posts.map((p) => `/blog/${p.id}/`)];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths
  .map(
    (p) => `  <url>
    <loc>${new URL(p, url).toString()}</loc>
    <changefreq>weekly</changefreq>
  </url>`,
  )
  .join("\n")}
</urlset>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
