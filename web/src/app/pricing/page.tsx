import { Metadata } from "next";
import { PricingPageContent } from "@/components/marketing/pricing-page-content";
import { pageMetadata } from "@/lib/seo/metadata";

export const revalidate = 3600;

export const metadata: Metadata = pageMetadata("pricing", "/pricing");

export default function PricingPage() {
  return <PricingPageContent />;
}
