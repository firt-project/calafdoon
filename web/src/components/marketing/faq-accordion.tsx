"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useFaqItems } from "@/lib/i18n/hooks";
import { cn } from "@/lib/utils";

export function FAQAccordion({
  limit,
  viewAllHref,
  viewAllLabel,
}: {
  limit?: number;
  viewAllHref?: string;
  viewAllLabel?: string;
} = {}) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const faqItems = useFaqItems();
  const items = limit ? faqItems.slice(0, limit) : faqItems;

  return (
    <div className="max-w-2xl">
      {items.map((item, index) => {
        const open = openIndex === index;
        return (
          <div key={index} className="border-b border-border">
            <button
              type="button"
              onClick={() => setOpenIndex(open ? null : index)}
              className={cn(
                "flex w-full items-center justify-between gap-4 py-5 text-left font-display text-[1.12rem] font-semibold tracking-tight transition-colors",
                open ? "text-primary" : "hover:text-primary"
              )}
              aria-expanded={open}
            >
              <span>{item.question}</span>
              <Plus
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                  open && "rotate-45"
                )}
              />
            </button>
            {open ? (
              <p className="pb-5 text-[1rem] leading-relaxed text-muted-foreground">
                {item.answer}
              </p>
            ) : null}
          </div>
        );
      })}
      {viewAllHref && viewAllLabel ? (
        <div className="pt-6">
          <Link
            href={viewAllHref}
            className="text-sm font-semibold text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
          >
            {viewAllLabel}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
