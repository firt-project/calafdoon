import { Metadata } from "next";
import { AboutPageContent } from "@/components/marketing/about-page-content";
import { pageMetadata } from "@/lib/seo/metadata";

export const revalidate = 3600;

export const metadata: Metadata = pageMetadata("about", "/about");

export default function AboutPage() {
  return <AboutPageContent />;
}
