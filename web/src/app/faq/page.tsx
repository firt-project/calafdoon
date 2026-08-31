import { Metadata } from "next";
import { FaqPageContent } from "@/components/marketing/faq-page-content";
import { pageMetadata } from "@/lib/seo/metadata";

export const revalidate = 3600;

export const metadata: Metadata = pageMetadata("faq", "/faq");

export default function FAQPage() {
  return <FaqPageContent />;
}
