import { Metadata } from "next";
import { DeleteAccountPageContent } from "@/components/marketing/delete-account-page-content";
import { pageMetadata } from "@/lib/seo/metadata";

export const revalidate = 3600;

export const metadata: Metadata = pageMetadata("deleteAccount", "/delete-account");

export default function DeleteAccountPage() {
  return <DeleteAccountPageContent />;
}
