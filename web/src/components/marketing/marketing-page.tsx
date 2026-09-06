import { ReactNode } from "react";

interface MarketingPageProps {
  title: string;
  subtitle: string;
  /** Optional mono eyebrow above the title (Rummaan system). */
  eyebrow?: string;
  children: ReactNode;
}

export function MarketingPage({
  title,
  subtitle,
  eyebrow,
  children,
}: MarketingPageProps) {
  return (
    <div className="gradient-hero">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <header className="mb-12 max-w-2xl sm:mb-16">
          {eyebrow ? (
            <p className="mb-3 text-sm font-semibold text-primary">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="font-display text-4xl font-medium leading-[1.06] tracking-tight text-balance sm:text-5xl">
            {title}
          </h1>
          <p className="mt-4 text-[1.0625rem] leading-relaxed text-muted-foreground sm:text-lg">
            {subtitle}
          </p>
        </header>
        {children}
      </div>
    </div>
  );
}
