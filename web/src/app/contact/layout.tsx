import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata("contact", "/contact");

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
