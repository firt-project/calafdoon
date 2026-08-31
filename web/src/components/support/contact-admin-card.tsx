"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Headphones, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { WHATSAPP_URL } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { getSafeUserError } from "@/lib/safe-error";
import {
  useMySupportMessages,
  useReplyAsMember,
  useSendSupportMessage,
} from "@/data/support/hooks";

type Topic = "photo_upload" | "account" | "payment" | "other";
type Source = "profile" | "questionnaire" | "other";

interface ContactAdminCardProps {
  source: Source;
  defaultTopic?: Topic;
  className?: string;
  compact?: boolean;
}

type SupportRow = {
  _id: string;
  topic?: string;
  subject?: string;
  status?: string;
  thread?: Array<{
    id?: string;
    body?: string;
    authorRole?: string;
    createdAt?: number;
  }>;
};

export function ContactAdminCard({
  source,
  defaultTopic = "photo_upload",
  className,
  compact = false,
}: ContactAdminCardProps) {
  const { t } = useTranslation();
  const sendSupport = useSendSupportMessage();
  const replyAsMember = useReplyAsMember();
  const { messages: myMessagesRaw, reload } = useMySupportMessages();
  const myMessages = Array.isArray(myMessagesRaw)
    ? (myMessagesRaw as SupportRow[])
    : undefined;
  const [topic, setTopic] = useState<Topic>(defaultTopic);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(!compact);
  const [followUps, setFollowUps] = useState<Record<string, string>>({});
  const [replyingId, setReplyingId] = useState<string | null>(null);

  const topics: { value: Topic; label: string }[] = [
    { value: "photo_upload", label: t("support.topicPhoto") },
    { value: "account", label: t("support.topicAccount") },
    { value: "payment", label: t("support.topicPayment") },
    { value: "other", label: t("support.topicOther") },
  ];

  const onSubmit = async () => {
    const trimmed = message.trim();
    if (trimmed.length < 10) {
      toast.error(t("support.messageTooShort"));
      return;
    }
    setSending(true);
    try {
      await sendSupport({ topic, message: trimmed, source });
      toast.success(t("support.sent"));
      setMessage("");
      reload();
      if (compact) setOpen(false);
    } catch (error) {
      toast.error(getSafeUserError(error, t("support.sendFailed")));
    } finally {
      setSending(false);
    }
  };

  const onFollowUp = async (contactId: string) => {
    const body = (followUps[contactId] ?? "").trim();
    if (body.length < 2) {
      toast.error(t("support.replyTooShort"));
      return;
    }
    setReplyingId(contactId);
    try {
      await replyAsMember({ contactId, message: body });
      toast.success(t("support.replySent"));
      setFollowUps((prev) => ({ ...prev, [contactId]: "" }));
      reload();
    } catch (error) {
      toast.error(getSafeUserError(error, t("support.replyFailed")));
    } finally {
      setReplyingId(null);
    }
  };

  const recent = (myMessages ?? []).slice(0, 5);

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-4 text-left shadow-sm",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Headphones className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t("support.title")}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t("support.desc")}
          </p>
          {compact && !open && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 rounded-xl"
              onClick={() => setOpen(true)}
            >
              {t("support.openForm")}
            </Button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {topics.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setTopic(item.value)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  topic === item.value
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`support-msg-${source}`}>{t("support.messageLabel")}</Label>
            <Textarea
              id={`support-msg-${source}`}
              rows={compact ? 3 : 4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                topic === "photo_upload"
                  ? t("support.photoPlaceholder")
                  : t("support.messagePlaceholder")
              }
              className="rounded-xl text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="rounded-xl"
              disabled={sending}
              onClick={() => void onSubmit()}
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />
              {sending ? t("support.sending") : t("support.send")}
            </Button>
            <Button type="button" size="sm" variant="ghost" className="rounded-xl" asChild>
              <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
                {t("support.whatsapp")}
              </a>
            </Button>
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div className="mt-4 space-y-3 border-t border-border/70 pt-3">
          <p className="text-xs font-medium text-muted-foreground">{t("support.recent")}</p>
          <p className="text-[11px] text-muted-foreground">{t("support.retentionHint")}</p>
          {recent.map((row) => (
            <div
              key={row._id}
              className="space-y-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="truncate text-xs font-medium">{row.subject}</p>
                <Badge
                  variant={row.status === "open" ? "default" : "outline"}
                  className="shrink-0"
                >
                  {row.status === "open"
                    ? t("support.statusOpen")
                    : row.status === "reviewed"
                      ? t("support.statusReviewed")
                      : t("support.statusClosed")}
                </Badge>
              </div>

              <div className="space-y-1.5">
                {(row.thread ?? []).map((msg) => (
                  <div
                    key={msg.id ?? `${msg.createdAt}-${msg.body}`}
                    className={cn(
                      "rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed",
                      msg.authorRole === "admin"
                        ? "border border-primary/10 bg-primary/5"
                        : "bg-background"
                    )}
                  >
                    <span className="font-semibold">
                      {msg.authorRole === "admin"
                        ? t("support.fromAdmin")
                        : t("support.fromYou")}
                      :{" "}
                    </span>
                    {msg.body}
                  </div>
                ))}
              </div>

              {row.status === "open" && (
                <div className="space-y-2 pt-1">
                  <Textarea
                    rows={2}
                    className="rounded-xl text-xs"
                    placeholder={t("support.replyPlaceholder")}
                    value={followUps[row._id] ?? ""}
                    onChange={(e) =>
                      setFollowUps((prev) => ({
                        ...prev,
                        [row._id]: e.target.value,
                      }))
                    }
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-xl text-xs"
                    disabled={replyingId === row._id}
                    onClick={() => void onFollowUp(row._id)}
                  >
                    <Send className="mr-1.5 h-3 w-3" />
                    {replyingId === row._id ? t("support.sending") : t("support.reply")}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
