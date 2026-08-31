import { Metadata } from "next";
import { DownloadPageContent } from "@/components/marketing/download-page-content";
import { pageMetadata } from "@/lib/seo/metadata";

export const revalidate = 3600;

export const metadata: Metadata = pageMetadata("download", "/download");

export default function DownloadPage() {
  return <DownloadPageContent />;
}
