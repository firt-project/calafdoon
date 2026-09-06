import {
  PRODUCTION_SITE_URL,
  SITE_BRAND_NAME,
  SUPPORT_EMAIL,
  WHATSAPP_DISPLAY,
} from "@/lib/constants";
import { HOME_OG_DESCRIPTION } from "@/lib/seo/metadata";

function getCanonicalSiteUrl() {
  const base = (
    process.env.NEXT_PUBLIC_APP_URL ?? PRODUCTION_SITE_URL
  ).replace(/\/$/, "");
  return `${base}/`;
}

/**
 * Google Search "site name" preference (the brand line above the URL).
 * Goal: show "Hel Calafkaaga", NOT "web.example.com".
 *
 * Google treats this as a suggestion — if confidence is low it falls back
 * to the domain. Follow official order: preferred name first, domain last.
 * @see https://developers.google.com/search/docs/appearance/site-names
 */
export function SiteJsonLd() {
  const siteUrl = getCanonicalSiteUrl();
  const siteOrigin = siteUrl.replace(/\/$/, "");
  const logoUrl = `${siteOrigin}/logo`;
  // Bare host of the configured site URL — the domain-name variant Google may
  // fall back to when its confidence in the preferred site name is low.
  const domainFallback = (() => {
    try {
      return new URL(siteUrl).hostname;
    } catch {
      return siteOrigin;
    }
  })();

  // WebSite block matches Google's site-name example closely (not only @graph).
  const websiteLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_BRAND_NAME,
    alternateName: [domainFallback],
    url: siteUrl,
    description: HOME_OG_DESCRIPTION,
    inLanguage: ["so", "en"],
    publisher: {
      "@type": "Organization",
      name: SITE_BRAND_NAME,
      url: siteUrl,
      logo: logoUrl,
    },
  };

  const organizationLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_BRAND_NAME,
    alternateName: [domainFallback],
    url: siteUrl,
    logo: {
      "@type": "ImageObject",
      url: logoUrl,
      width: 512,
      height: 512,
    },
    image: logoUrl,
    email: SUPPORT_EMAIL,
    description: HOME_OG_DESCRIPTION,
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      telephone: WHATSAPP_DISPLAY,
      availableLanguage: ["Somali", "English"],
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationLd) }}
      />
    </>
  );
}
