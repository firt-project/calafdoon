"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, MessageCircle, Search, UserRound } from "lucide-react";
import { getAdminAdapter } from "@/data/admin";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/context";

interface AdminMessagesInboxProps {
  onOpenUser: (profileId: string) => void;
}

type MemberCard = {
  userId: string;
  name: string;
  profileId: string | null;
  imageUrl: string | null;
  gender: string | null;
};

type ConversationRow = {
  conversationId: string;
  lastMessageAt: number;
  lastMessage: {
    body: string;
    hasImage: boolean;
    senderId: string;
    createdAt: number;
  } | null;
  memberA: MemberCard;
  memberB: MemberCard;
};

type ThreadPayload = {
  conversationId: string;
  truncated: boolean;
  memberA: MemberCard;
  memberB: MemberCard;
  messages: Array<{
    _id?: string;
    id: string;
    body: string;
    hasImage: boolean;
    senderId: string;
    createdAt: number;
  }>;
};

function formatListTime(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatBubbleTime(ts: number) {
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ApiAdminMessagesInbox({ onOpenUser }: AdminMessagesInboxProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [conversations, setConversations] = useState<
    ConversationRow[] | undefined
  >(undefined);
  const [thread, setThread] = useState<ThreadPayload | null | undefined>(
    undefined
  );
  const [search, setSearch] = useState("");
  const chatParam = searchParams.get("chat");
  const activeId = chatParam || null;
  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let c = false;
    void getAdminAdapter()
      .conversations.list({ limit: 50 })
      .then((d) => {
        if (!c) setConversations(Array.isArray(d) ? (d as ConversationRow[]) : []);
      })
      .catch(() => {
        if (!c) setConversations([]);
      });
    return () => {
      c = true;
    };
  }, []);

  useEffect(() => {
    if (!activeId) {
      setThread(undefined);
      return;
    }
    let c = false;
    setThread(undefined);
    void getAdminAdapter()
      .conversations.thread(activeId, { limit: 500 })
      .then((d) => {
        if (!c) setThread((d as ThreadPayload) ?? null);
      })
      .catch(() => {
        if (!c) setThread(null);
      });
    return () => {
      c = true;
    };
  }, [activeId]);

  const filtered = useMemo(() => {
    if (!conversations) return [];
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((conv) => {
      const hay = `${conv.memberA.name} ${conv.memberB.name} ${conv.lastMessage?.body ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [conversations, search]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages.length, activeId]);

  const activeConversation =
    conversations?.find((conv) => conv.conversationId === activeId) ?? null;
  const showThread = Boolean(activeId);

  const openConversation = (conversationId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "messages");
    params.set("chat", conversationId);
    params.delete("profile");
    router.push(`/admin?${params.toString()}`, { scroll: false });
  };

  const closeConversation = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "messages");
    params.delete("chat");
    params.delete("profile");
    router.push(`/admin?${params.toString()}`, { scroll: false });
  };

  return (
    <div
      className={cn(
        "overflow-hidden bg-card shadow-[var(--shadow-sm)]",
        "rounded-none border-0 sm:rounded-2xl sm:border sm:border-border",
        "-mx-4 sm:mx-0"
      )}
    >
      <div className="flex h-[min(78dvh,720px)] min-h-[480px] flex-col sm:h-[min(72vh,720px)] sm:min-h-[420px] sm:flex-row">
        <div
          className={cn(
            "flex w-full flex-col border-border sm:w-[340px] sm:border-r lg:w-[380px]",
            showThread ? "hidden sm:flex" : "flex"
          )}
        >
          <div className="space-y-3 border-b border-border px-4 py-3.5">
            <div>
              <h3 className="text-sm font-bold tracking-tight">
                {t("adminPage.inboxTitle")}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {conversations === undefined
                  ? t("common.loading")
                  : t("adminPage.inboxCount", { count: filtered.length })}
              </p>
            </div>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("adminPage.inboxSearch")}
                className="h-10 w-full rounded-xl border border-border bg-muted/40 pl-9 pr-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {conversations === undefined ? (
              <div className="space-y-2 p-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-14 text-center">
                <MessageCircle className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  {t("adminPage.noPlatformMessages")}
                </p>
              </div>
            ) : (
              <ul className="space-y-1">
                {filtered.map((conv) => {
                  const active = conv.conversationId === activeId;
                  const lastFromA =
                    conv.lastMessage?.senderId === conv.memberA.userId;
                  const previewName = lastFromA
                    ? conv.memberA.name
                    : conv.memberB.name;
                  return (
                    <li key={conv.conversationId}>
                      <button
                        type="button"
                        onClick={() => openConversation(conv.conversationId)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors",
                          active
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-muted"
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate text-sm font-semibold">
                              {conv.memberA.name}
                              <span className="mx-1 font-normal text-muted-foreground">
                                ·
                              </span>
                              {conv.memberB.name}
                            </p>
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {formatListTime(conv.lastMessageAt)}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {conv.lastMessage
                              ? `${previewName.split(" ")[0]}: ${
                                  conv.lastMessage.hasImage &&
                                  !conv.lastMessage.body
                                    ? t("adminDetail.imageMessage")
                                    : conv.lastMessage.body
                                }`
                              : t("adminPage.inboxNoPreview")}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col bg-background",
            showThread ? "flex" : "hidden sm:flex"
          )}
        >
          {!activeId || !activeConversation ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                <MessageCircle className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold">
                {t("adminPage.inboxSelectTitle")}
              </p>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                {t("adminPage.inboxSelectHint")}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-border bg-card/95 px-3 py-3 backdrop-blur-sm sm:px-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 rounded-xl sm:hidden"
                  onClick={closeConversation}
                  aria-label={t("common.back")}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">
                    {activeConversation.memberA.name} &{" "}
                    {activeConversation.memberB.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {t("adminPage.inboxModerationView")}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {activeConversation.memberA.profileId && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-lg px-2 text-xs"
                      onClick={() =>
                        onOpenUser(
                          activeConversation.memberA.profileId as string
                        )
                      }
                    >
                      <UserRound className="mr-1 h-3.5 w-3.5" />
                      {activeConversation.memberA.name.split(" ")[0]}
                    </Button>
                  )}
                  {activeConversation.memberB.profileId && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-lg px-2 text-xs"
                      onClick={() =>
                        onOpenUser(
                          activeConversation.memberB.profileId as string
                        )
                      }
                    >
                      <UserRound className="mr-1 h-3.5 w-3.5" />
                      {activeConversation.memberB.name.split(" ")[0]}
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-5">
                {thread === undefined ? (
                  <div className="space-y-3 py-6">
                    <Skeleton className="ml-auto h-12 w-2/3 rounded-2xl" />
                    <Skeleton className="h-12 w-2/3 rounded-2xl" />
                  </div>
                ) : thread === null || thread.messages.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    {t("adminPage.inboxEmptyThread")}
                  </p>
                ) : (
                  <>
                    {thread.messages.map((msg) => {
                      const isMemberA = msg.senderId === thread.memberA.userId;
                      const sender = isMemberA
                        ? thread.memberA
                        : thread.memberB;
                      return (
                        <div
                          key={msg._id || msg.id}
                          className={cn(
                            "flex gap-2",
                            isMemberA ? "justify-start" : "justify-end"
                          )}
                        >
                          {isMemberA && (
                            <Avatar className="mt-1 h-8 w-8 shrink-0">
                              <AvatarImage
                                src={sender.imageUrl ?? undefined}
                              />
                              <AvatarFallback className="text-[10px]">
                                {sender.name.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                          )}
                          <div
                            className={cn(
                              "max-w-[78%] rounded-2xl px-3.5 py-2 shadow-sm",
                              isMemberA
                                ? "rounded-bl-md border border-border bg-card"
                                : "rounded-br-md bg-primary text-primary-foreground"
                            )}
                          >
                            <p className="text-sm whitespace-pre-wrap break-words">
                              {msg.hasImage && !msg.body
                                ? t("adminDetail.imageMessage")
                                : msg.body}
                            </p>
                            <p
                              className={cn(
                                "mt-1 text-[10px]",
                                isMemberA
                                  ? "text-muted-foreground"
                                  : "text-primary-foreground/70"
                              )}
                            >
                              {formatBubbleTime(msg.createdAt)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={threadEndRef} />
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
