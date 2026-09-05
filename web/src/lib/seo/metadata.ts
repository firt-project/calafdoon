import type { Metadata } from "next";
import { PRODUCTION_SITE_URL, SITE_BRAND_NAME } from "@/lib/constants";

/**
 * Homepage / Google blue-link title — short brand only.
 * Slogan stays in the meta description (not the title).
 * @see https://developers.google.com/search/docs/appearance/title-link
 */
export const HOME_SEO_TITLE = SITE_BRAND_NAME;

/** Full meta description (search snippets) — slogan + pricing. */
export const HOME_SEO_DESCRIPTION =
  "Hel Calafkaaga — barta guurka Soomaalida. Waxaa lagugu barbardhigaa waafaqid: diin, qoys iyo hadafyada nolosha — ma aha 'swipe'. Profile kasta qof dhab ah ayaa eega. $4.99 hal mar, ka dibna $1 bishii. Bixi M-Pesa, EVC Plus ama Hormuud.";

/** Shorter social / OG description (no pricing line). */
export const HOME_OG_DESCRIPTION =
  "Hel Calafkaaga — barta guurka Soomaalida. Loo barbardhigay guur, ma aha 'swipe'. Profile kasta qof dhab ah ayaa eega.";

/** Primary SEO copy — Somali first (default site language). */
export const SEO_SO = {
  siteTitle: HOME_SEO_TITLE,
  siteDescription: HOME_SEO_DESCRIPTION,
  keywords: [
    "guur",
    "guurka",
    "isbarbardhig",
    "xalaal",
    "muslim",
    "islaam",
    "web",
    "lammaane",
    "lamaanahaaga",
    "guurdoon",
    "calafdoon",
    "sahan",
    "soomaali",
  ],
  pages: {
    home: {
      title: HOME_SEO_TITLE,
      description: HOME_SEO_DESCRIPTION,
      ogDescription: HOME_OG_DESCRIPTION,
    },
    about: {
      title: "Naga Saabsan",
      description:
        "Hel Calafkaaga waxay ka caawisaa Soomaalida inay helaan lammaane xalaal ah iyadoo lagu saleynayo waafaqid, qoys iyo qiyamka Islaamka.",
    },
    howItWorks: {
      title: "Sida Uu U Shaqeeyo",
      description:
        "Buuxi su'aalaha, hel qiimaha waafaqidda, kana kulan kuwa lagugu barbardhigay Hel Calafkaaga.",
    },
    pricing: {
      title: "Qiimaha",
      description:
        "Hal qorshe: $4.99 hal mar, ka dibna $1 bishii. Wax walba waa ku jira. Bixi M-Pesa, EVC Plus, Hormuud ama kaadhka.",
    },
    faq: {
      title: "Su'aalaha Inta Badan La Isweydiiyo",
      description:
        "Jawaabo ku saabsan Hel Calafkaaga — guur xalaal, qiimaha ($4.99 hal mar, $1 bishii), qarsoodiga, iyo sida barbardhigga waafaqiddu u shaqeeyo.",
    },
    contact: {
      title: "Nala Soo Xiriir",
      description:
        "La xiriir Hel Calafkaaga — email ama WhatsApp caawinta diiwaangelinta iyo taageerada shakhsi ahaaneed.",
    },
    privacy: {
      title: "Siyaasadda Qarsoodiga",
      description:
        "Sida Hel Calafkaaga u ilaaliso xogtaada shakhsi ahaaneed iyo sida aan u maamulno macluumaadka xubnaha.",
    },
    terms: {
      title: "Shuruudaha Adeegga",
      description:
        "Shuruudaha isticmaalka Hel Calafkaaga — diiwaangelinta, dhaqanka xubnaha, iyo mabaadi'da guurka xalaal ah.",
    },
    download: {
      title: "Soo Deg App-ka Android",
      description:
        "Soo deg oo rakib Hel Calafkaaga Android APK — guur xalaal, isbarbardhig, iyo sheekaysi ammaan ah telefoonkaaga.",
    },
    deleteAccount: {
      title: "Tirtir Akoonka",
      description:
        "Sida loo tirtiro akoonkaaga Hel Calafkaaga — website, app, waxa la tirtirayo, iyo sida nala soo xiriirayo.",
    },
    childSafety: {
      title: "Child Safety Standards (CSAE)",
      description:
        "Hel Calafkaaga child safety standards — adults 18+ only, CSAE prohibition, reporting, and compliance contacts.",
    },
  },
} as const;

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? PRODUCTION_SITE_URL).replace(/\/$/, "");
}

export function rootMetadata(): Metadata {
  const base = siteUrl();
  const { siteTitle, siteDescription, keywords } = SEO_SO;

  return {
    applicationName: SITE_BRAND_NAME,
    title: {
      default: siteTitle,
      template: `%s | ${SITE_BRAND_NAME}`,
    },
    description: siteDescription,
    keywords: [...keywords],
    metadataBase: new URL(base),
    creator: SITE_BRAND_NAME,
    publisher: SITE_BRAND_NAME,
    category: "lifestyle",
    alternates: {
      canonical: "/",
      languages: {
        so: `${base}/`,
        en: `${base}/`,
      },
    },
    icons: {
      icon: [{ url: "/icon", type: "image/png", sizes: "48x48" }],
      apple: [{ url: "/apple-icon", type: "image/png", sizes: "180x180" }],
    },
    openGraph: {
      type: "website",
      locale: "so_SO",
      alternateLocale: ["en_US"],
      url: `${base}/`,
      siteName: SITE_BRAND_NAME,
      title: HOME_SEO_TITLE,
      description: HOME_OG_DESCRIPTION,
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: SITE_BRAND_NAME,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: HOME_SEO_TITLE,
      description: HOME_OG_DESCRIPTION,
      images: ["/opengraph-image"],
    },
    appleWebApp: {
      title: SITE_BRAND_NAME,
    },
    robots: { index: true, follow: true },
    formatDetection: { telephone: false },
  };
}

export function pageMetadata(
  page: keyof typeof SEO_SO.pages,
  path: string
): Metadata {
  const pageSeo = SEO_SO.pages[page];
  const { title, description } = pageSeo;
  const ogDescription =
    "ogDescription" in pageSeo ? pageSeo.ogDescription : description;
  const canonical = path === "/" ? `${siteUrl()}/` : `${siteUrl()}${path}`;
  const isHome = path === "/";
  const socialTitle = isHome ? HOME_SEO_TITLE : title;

  return {
    title: isHome ? { absolute: HOME_SEO_TITLE } : title,
    description,
    applicationName: SITE_BRAND_NAME,
    alternates: {
      canonical,
      languages: { so: canonical, en: canonical },
    },
    openGraph: {
      title: socialTitle,
      description: ogDescription,
      url: canonical,
      locale: "so_SO",
      alternateLocale: ["en_US"],
      siteName: SITE_BRAND_NAME,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description: ogDescription,
    },
  };
}
