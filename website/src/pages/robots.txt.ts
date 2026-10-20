import type { APIRoute } from "astro";

export const GET: APIRoute = ({ site }) => {
  const url = site?.toString() ?? "https://mero-udhyog.vercel.app";
  const body = `User-agent: *
Allow: /

Sitemap: ${new URL("sitemap.xml", url).toString()}
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
