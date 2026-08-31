import { Metadata } from "next";
import { TermsPageContent } from "@/components/marketing/terms-page-content";
import { pageMetadata } from "@/lib/seo/metadata";

export const revalidate = 3600;

export const metadata: Metadata = pageMetadata("terms", "/terms");

export default function TermsPage() {
  return <TermsPageContent />;
}
