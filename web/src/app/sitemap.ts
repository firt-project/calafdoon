import type { MetadataRoute } from "next";
import { PRODUCTION_SITE_URL } from "@/lib/constants";

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? PRODUCTION_SITE_URL
  );
}

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const lastModified = new Date();

  const publicPaths = [
    "",
    "/about",
    "/how-it-works",
    "/pricing",
    "/faq",
    "/contact",
    "/download",
    "/privacy",
    "/terms",
    "/delete-account",
    "/child-safety",
  ];

  return publicPaths.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.7,
  }));
}
