"use client";

import { ErrorPageContent } from "@/components/marketing/error-page-content";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorPageContent error={error} reset={reset} />;
}
