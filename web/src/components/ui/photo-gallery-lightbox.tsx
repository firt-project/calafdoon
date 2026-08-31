"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { LazyImage } from "@/components/ui/lazy-image";
import { useTranslation } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

const SWIPE_THRESHOLD = 56;

interface PhotoGalleryLightboxProps {
  images: string[];
  initialIndex?: number;
  open: boolean;
  onClose: () => void;
  alt?: string;
}

export function PhotoGalleryLightbox({
  images,
  initialIndex = 0,
  open,
  onClose,
  alt = "",
}: PhotoGalleryLightboxProps) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [open, initialIndex]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIndex((i) => Math.min(images.length - 1, i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, images.length]);

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  const goNext = useCallback(() => {
    setIndex((i) => Math.min(images.length - 1, i + 1));
  }, [images.length]);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > SWIPE_THRESHOLD) goPrev();
    else if (info.offset.x < -SWIPE_THRESHOLD) goNext();
  };

  if (!images.length) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex flex-col bg-black/95"
          role="dialog"
          aria-modal
          aria-label={t("gallery.title")}
        >
          <div className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
            <p className="text-sm text-white/80 font-medium">
              {images.length > 1
                ? t("gallery.counter", { current: index + 1, total: images.length })
                : t("gallery.title")}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
              aria-label={t("common.a11yClose")}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="relative flex-1 flex items-center justify-center overflow-hidden px-2">
            {images.length > 1 && index > 0 && (
              <button
                type="button"
                onClick={goPrev}
                className="absolute left-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white hidden sm:flex"
                aria-label={t("gallery.prev")}
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}

            <motion.div
              key={images[index]}
              className="w-full h-full max-w-lg mx-auto flex items-center justify-center touch-pan-y"
              drag={images.length > 1 ? "x" : false}
              dragElastic={0.2}
              dragConstraints={{ left: 0, right: 0 }}
              onDragEnd={handleDragEnd}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <LazyImage
                src={images[index] ?? images[0]!}
                alt={alt}
                className="max-h-[min(72vh,640px)] w-full object-contain rounded-lg"
              />
            </motion.div>

            {images.length > 1 && index < images.length - 1 && (
              <button
                type="button"
                onClick={goNext}
                className="absolute right-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white hidden sm:flex"
                aria-label={t("gallery.next")}
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </div>

          {images.length > 1 && (
            <div className="flex justify-center gap-1.5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
              {images.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setIndex(i)}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === index ? "w-6 bg-primary" : "w-1.5 bg-white/40"
                  )}
                  aria-label={t("gallery.goTo", { n: i + 1 })}
                />
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
