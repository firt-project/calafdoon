export const dynamic = "force-dynamic";

import { ReactNode, Suspense } from "react";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <Suspense>{children}</Suspense>;
}
