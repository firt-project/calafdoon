"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Headphones,
  Mail,
  Phone,
  Send,
  XCircle,
} from "lucide-react";
import { useAdminSupportContacts } from "@/data/admin/hooks";
import {
  useAdminReplySupport,
  useAdminUpdateSupportStatus,
} from "@/data/support/hooks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { LazyImage } from "@/components/ui/lazy-image";
import { useTranslation } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { getSafeUserError } from "@/lib/safe-error";

type StatusFilter = "open" | "reviewed" | "closed" | "all";

interface AdminContactsInboxProps {
  onOpenUser?: (profileId: string) => void;
}

type SupportContact = {
  _id: string;
  status: string;
  topic: string;
  source: string;
  profileId?: string | null;
  name: string;
  subject: string;
  thread: Array<{
    id: string;
    authorRole: string;
    body: string;
    createdAt: number;
  }>;
  imageUrl?: string | null;
  email?: string | null;
  phone?: string | null;
  createdAt: number;
  canReply?: boolean;
};

export function AdminContactsInbox({ onOpenUser }: AdminContactsInboxProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<StatusFilter>("open");
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const {
    contacts: contactsRaw,
    reload,
    removeContact,
    patchContact,
  } = useAdminSupportContacts(true, {
    status: filter === "all" ? undefined : filter,
  });
  const contacts = contactsRaw as SupportContact[] | undefined;
  const updateStatus = useAdminUpdateSupportStatus();
  const replyAsAdmin = useAdminReplySupport();

  const filters: { value: StatusFilter; label: string }[] = [
    { value: "open", label: t("adminPage.contactsFilterOpen") },
    { value: "reviewed", label: t("adminPage.contactsFilterReviewed") },
    { value: "closed", label: t("adminPage.contactsFilterClosed") },
    { value: "all", label: t("adminPage.contactsFilterAll") },
  ];

  const topicLabel = useMemo(
    () =>
      ({
        photo_upload: t("adminPage.contactTopicPhoto"),
        account: t("adminPage.contactTopicAccount"),
        payment: t("adminPage.contactTopicPayment"),
        other: t("adminPage.contactTopicOther"),
        contact_form: t("adminPage.contactTopicForm"),
      }) as Record<string, string>,
    [t]
  );

  const sendReply = async (contact: SupportContact) => {
    const body = (replies[contact._id] ?? "").trim();
    if (body.length < 2) {
      toast.error(t("adminPage.contactReplyTooShort"));
      return;
    }
    setBusyId(contact._id);
    try {
      await replyAsAdmin({ contactId: contact._id, message: body });
      toast.success(t("adminPage.contactReplySent"));
      setReplies((prev) => ({ ...prev, [contact._id]: "" }));
      if (filter === "open") {
        removeContact(contact._id);
      } else {
        patchContact(contact._id, {
          status: "reviewed",
          thread: [
            ...contact.thread,
            {
              id: `local-${Date.now()}`,
              authorRole: "admin",
              body,
              createdAt: Date.now(),
            },
          ],
        });
      }
      reload();
    } catch (error) {
      toast.error(getSafeUserError(error, t("adminPage.contactReplyFailed")));
    } finally {
      setBusyId(null);
    }
  };

  const setStatus = async (
    contact: SupportContact,
    status: "reviewed" | "closed"
  ) => {
    setBusyId(contact._id);
    try {
      await updateStatus({ contactId: contact._id, status });
      toast.success(
        status === "closed"
          ? t("adminPage.contactClosed")
          : t("adminPage.contactUpdated")
      );
      if (filter === "open" || (filter === "reviewed" && status === "closed")) {
        removeContact(contact._id);
      } else {
        patchContact(contact._id, { status });
      }
      reload();
    } catch (error) {
      toast.error(getSafeUserError(error, t("adminPage.actionFailed")));
    } finally {
      setBusyId(null);
    }
  };

  if (contacts === undefined) {
    return <Skeleton className="h-48 w-full rounded-2xl" />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            {t("adminPage.contactsTitle")}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("adminPage.contactsHint")}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setFilter(item.value)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              filter === item.value
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {contacts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-16 text-center">
          <Headphones className="mx-auto mb-3 h-8 w-8 text-muted-foreground/35" />
          <p className="text-sm text-muted-foreground">{t("adminPage.noContacts")}</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {contacts.map((contact) => {
            const busy = busyId === contact._id;
            return (
              <li
                key={contact._id}
                className="overflow-hidden rounded-2xl border border-border bg-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
                  <div className="min-w-0 space-y-1">
                    {contact.profileId && onOpenUser ? (
                      <button
                        type="button"
                        className="truncate text-base font-semibold underline-offset-2 hover:underline"
                        onClick={() => onOpenUser(contact.profileId!)}
                      >
                        {contact.name}
                      </button>
                    ) : (
                      <p className="truncate text-base font-semibold">{contact.name}</p>
                    )}
                    <p className="text-sm text-muted-foreground">{contact.subject}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={contact.status === "open" ? "default" : "outline"}
                      className="capitalize"
                    >
                      {contact.status === "open"
                        ? t("adminPage.reportOpen")
                        : contact.status === "reviewed"
                          ? t("adminPage.reportReviewed")
                          : t("adminPage.contactsClosed")}
                    </Badge>
                    <Badge variant="outline">
                      {topicLabel[contact.topic] ?? contact.topic}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-4 px-4 py-4 sm:px-5">
                  <div className="space-y-2">
                    {contact.thread.map((msg) => (
                      <div
                        key={msg.id}
                        className={cn(
                          "rounded-xl px-3.5 py-2.5 text-sm",
                          msg.authorRole === "admin"
                            ? "ml-6 border border-primary/15 bg-primary/5"
                            : "mr-6 border border-border bg-muted/30"
                        )}
                      >
                        <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                          {msg.authorRole === "admin"
                            ? t("adminPage.contactRoleAdmin")
                            : msg.authorRole === "visitor"
                              ? t("adminPage.contactRoleVisitor")
                              : t("adminPage.contactRoleMember")}
                          {" · "}
                          {new Date(msg.createdAt).toLocaleString()}
                        </p>
                        <p className="whitespace-pre-wrap leading-relaxed text-foreground">
                          {msg.body}
                        </p>
                      </div>
                    ))}
                  </div>

                  {contact.imageUrl && (
                    <div className="h-24 w-24 overflow-hidden rounded-xl border border-border">
                      <LazyImage
                        src={contact.imageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}

                  <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                    {contact.email && (
                      <a
                        href={`mailto:${contact.email}`}
                        className="inline-flex items-center gap-1.5 hover:text-foreground"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        {contact.email}
                      </a>
                    )}
                    {contact.phone && (
                      <a
                        href={`tel:${contact.phone}`}
                        className="inline-flex items-center gap-1.5 hover:text-foreground"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        {contact.phone}
                      </a>
                    )}
                    <span>{new Date(contact.createdAt).toLocaleString()}</span>
                  </div>

                  {contact.canReply && contact.status === "open" && (
                    <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
                      <Textarea
                        className="rounded-xl border-border/80 bg-background text-sm"
                        rows={3}
                        placeholder={t("adminPage.contactReplyPh")}
                        value={replies[contact._id] ?? ""}
                        disabled={busy}
                        onChange={(e) =>
                          setReplies((prev) => ({
                            ...prev,
                            [contact._id]: e.target.value,
                          }))
                        }
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          className="rounded-lg"
                          disabled={busy}
                          onClick={() => void sendReply(contact)}
                        >
                          <Send className="mr-1.5 h-3.5 w-3.5" />
                          {busy
                            ? t("adminPage.contactReplySending")
                            : t("adminPage.contactReplySend")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-lg"
                          disabled={busy}
                          onClick={() => void setStatus(contact, "closed")}
                        >
                          <XCircle className="mr-1.5 h-3.5 w-3.5" />
                          {t("adminPage.contactsMarkClosed")}
                        </Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {t("adminPage.contactRetentionHint")}
                      </p>
                    </div>
                  )}

                  {!contact.canReply && contact.status === "open" && (
                    <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">
                        {t("adminPage.contactReplyEmailOnly")}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-lg"
                          disabled={busy}
                          onClick={() => void setStatus(contact, "reviewed")}
                        >
                          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                          {t("adminPage.markReviewed")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="rounded-lg"
                          disabled={busy}
                          onClick={() => void setStatus(contact, "closed")}
                        >
                          <XCircle className="mr-1.5 h-3.5 w-3.5" />
                          {t("adminPage.contactsMarkClosed")}
                        </Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {t("adminPage.contactRetentionHint")}
                      </p>
                    </div>
                  )}

                  {contact.status !== "open" && contact.status !== "closed" && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-lg"
                        disabled={busy}
                        onClick={() => void setStatus(contact, "closed")}
                      >
                        <XCircle className="mr-1.5 h-3.5 w-3.5" />
                        {t("adminPage.contactsMarkClosed")}
                      </Button>
                      <p className="w-full text-[11px] text-muted-foreground">
                        {t("adminPage.contactRetentionHint")}
                      </p>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
