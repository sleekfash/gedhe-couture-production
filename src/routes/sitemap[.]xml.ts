import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const { createPublicClient } = await import("@/lib/supabase-public.server");
        const { data, error } = await createPublicClient()
          .from("products")
          .select("id,updated_at")
          .eq("published", true);
        if (error) return new Response("Sitemap temporarily unavailable", { status: 503 });
        const origin = new URL(
          process.env["PUBLIC_SITE_URL"] ?? "https://gedhe-couture-production.vercel.app",
        ).origin;
        const urls = [
          `<url><loc>${origin}/</loc></url>`,
          ...(data ?? []).map(
            (p) =>
              `<url><loc>${origin}/product/${p.id}</loc><lastmod>${p.updated_at}</lastmod></url>`,
          ),
        ];
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`,
          {
            headers: {
              "Content-Type": "application/xml; charset=utf-8",
              "Cache-Control": "public, max-age=300",
            },
          },
        );
      },
    },
  },
});
