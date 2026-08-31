"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MatchListsView,
  type SecondaryMatchList,
} from "@/components/matches/match-lists-view";
import type { MatchResult } from "@/types";
import { useTranslation } from "@/lib/i18n/context";

export type { SecondaryMatchList };

interface MatchListsSheetProps {
  open: boolean;
  onClose: () => void;
  activeList: SecondaryMatchList;
  onListChange: (list: SecondaryMatchList) => void;
  shortlist: MatchResult[];
  liked: MatchResult[];
  likedYou: MatchResult[];
  passed: MatchResult[];
  isPremium: boolean;
  onView: (match: MatchResult) => void;
  onAction: (userId: string, action: "like" | "pass" | "shortlist") => void;
  onMessage?: (userId: string) => void;
}

export function MatchListsSheet({
  open,
  onClose,
  activeList,
  onListChange,
  shortlist,
  liked,
  likedYou,
  passed,
  isPremium,
  onView,
  onAction,
  onMessage,
}: MatchListsSheetProps) {
  const { t } = useTranslation();

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            aria-label={t("common.a11yClose")}
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[min(88vh,720px)] flex-col rounded-t-3xl border border-border bg-card shadow-2xl pb-[env(safe-area-inset-bottom)]"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-lg font-semibold">{t("matchesPage.yourLists")}</h2>
              <Button variant="ghost" size="icon" className="rounded-full" onClick={onClose}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <MatchListsView
                activeList={activeList}
                onListChange={onListChange}
                shortlist={shortlist}
                liked={liked}
                likedYou={likedYou}
                passed={passed}
                isPremium={isPremium}
                onView={(match) => {
                  onView(match);
                  onClose();
                }}
                onAction={onAction}
                onMessage={
                  onMessage
                    ? (userId) => {
                        onMessage(userId);
                        onClose();
                      }
                    : undefined
                }
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
