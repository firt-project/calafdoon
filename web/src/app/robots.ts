import type { MetadataRoute } from "next";
import { PRODUCTION_SITE_URL } from "@/lib/constants";

function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? PRODUCTION_SITE_URL
  );
}

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/admin",
        "/profile",
        "/matches",
        "/likes",
        "/chat",
        "/questionnaire",
        "/payment",
        "/notifications",
        "/register",
        "/login",
        "/forgot-password",
        "/api/",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
