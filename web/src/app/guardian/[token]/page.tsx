import type { Metadata } from "next";
import { GuardianChatView } from "@/components/guardian/guardian-chat-view";

// A private link: never index it and never leak it through the Referer header.
export const metadata: Metadata = {
  title: "Guardian view",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function GuardianPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <GuardianChatView token={token} />;
}
