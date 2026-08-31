import { Metadata } from "next";
import { ChildSafetyPageContent } from "@/components/marketing/child-safety-page-content";
import { pageMetadata } from "@/lib/seo/metadata";

export const revalidate = 3600;

export const metadata: Metadata = pageMetadata("childSafety", "/child-safety");

export default function ChildSafetyPage() {
  return <ChildSafetyPageContent />;
}
