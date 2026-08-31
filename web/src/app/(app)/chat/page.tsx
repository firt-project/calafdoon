"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useUnifiedAuth } from "@/data/auth/hooks";
import { useProfile, usePreferencesQuery } from "@/data/profile/hooks";
import {
  useConversations,
  useMessages,
  useSendMessage,
  useMarkAsRead,
  useSetTyping,
  useTypingStatus,
  useUploadChatImage,
} from "@/data/chat/hooks";
import { useMarkMatchSeen, useArchiveMatch } from "@/data/matching/hooks";
import { toast } from "sonner";
import {
  Send,
  Image as ImageIcon,
  Lock,
  MessageCircle,
  Heart,
  ArrowLeft,
  Check,
  CheckCheck,
  Archive,
  Loader2,
} from "lucide-react";
import { ChatSafetyBanner } from "@/components/chat/chat-safety-banner";
import { ChatPartnerProfileModal } from "@/components/chat/chat-partner-profile-modal";
import { PrivatePhotoRevealCard } from "@/components/matches/private-photo-reveal-card";
import { ProfileLockedGate } from "@/components/profile/profile-locked-gate";
import { PendingApprovalGate } from "@/components/profile/pending-approval-gate";
import { AccountLockedGate } from "@/components/profile/account-locked-gate";
import { PaymentGate } from "@/components/payment/payment-gate";
import type { Conversation, ChatMessage, Profile } from "@/types";
import type { Preferences } from "@/lib/profile-progress";
import { hasPaidAccess, isPremiumMember } from "@/lib/access";
import {
  needsApprovalGate,
  isInteractionLocked,
  resolveReviewStatus,
} from "@/lib/review-status";
import { useStaffRedirect } from "@/hooks/use-staff-redirect";
import { isMemberProfileReady, isProfileQueriesLoading } from "@/lib/profile-progress";
import { isTrialExpired } from "@/lib/trial";
import { formatMoney, planPricesForGender } from "@/lib/constants";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { MemberDataLoading } from "@/components/auth/member-data-loading";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { OnlineDot } from "@/components/ui/online-status";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DataLoadError } from "@/components/ui/data-load-error";
import { formatTime } from "@/lib/utils";
import { LazyImage } from "@/components/ui/lazy-image";
import { ImageFileHitArea } from "@/components/ui/image-file-hit-area";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/context";
import { usePresence } from "@/data/presence/hooks";
import { resetFileInput } from "@/lib/upload-image";
import { useMarkNotificationsRead } from "@/hooks/use-mark-notifications-read";
import { ReportBlockMenu } from "@/components/safety/report-block-menu";
import { TrustBadges } from "@/components/profile/trust-badges";

type MatchList = "active" | "new" | "archived";

function isMatchList(value: string | null): value is MatchList {
  return value === "active" || value === "new" || value === "archived";
}

function MessagesEmptyState() {
  const { t } = useTranslation();

  return (
    <Card className="border-border">
      <CardContent className="py-16 px-6 text-center max-w-md mx-auto">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-accent-foreground mx-auto mb-5">
          <MessageCircle className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold mb-2">{t("chatPage.noMessages")}</h2>
        <p className="text-muted-foreground text-sm leading-relaxed mb-6">
          {t("chatPage.noMessagesDesc")}
        </p>
        <Button asChild>
          <Link href="/matches">
            <Heart className="h-4 w-4 mr-2" />
            {t("chatPage.browseMatches")}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ChatShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "-mx-4 -mt-6 sm:mx-0 sm:mt-0 flex min-h-0 flex-col overflow-hidden",
        // Mobile: fill space between sticky header and fixed tab bar so the thread can scroll inside.
        "h-[calc(100dvh-var(--app-header)-var(--app-tabbar)-env(safe-area-inset-bottom,0px)-0.75rem)]",
        "lg:h-[min(calc(100dvh-10rem),42rem)]"
      )}
    >
      {children}
    </div>
  );
}

export default function ChatPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const listParam = searchParams.get("list");
  const matchList: MatchList = isMatchList(listParam) ? listParam : "active";
  const conversationParam = searchParams.get("c");
  const { isStaff, isLoading: staffLoading } = useStaffRedirect();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [partnerProfileOpen, setPartnerProfileOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingStartRef = useRef<NodeJS.Timeout | null>(null);
  const markedReadRef = useRef<string | null>(null);

  const { user: currentUser } = useUnifiedAuth();
  const {
    profile: profileRaw,
    error: profileError,
    refresh: refreshProfile,
  } = useProfile();
  const profile = (
    staffLoading || isStaff ? undefined : profileRaw
  ) as Profile | null | undefined;
  const preferencesRaw = usePreferencesQuery();
  const preferences = (
    staffLoading || isStaff ? undefined : preferencesRaw
  ) as Preferences | null | undefined;
  const queriesLoading =
    !isStaff && isProfileQueriesLoading(profile, preferences);
  const profileReady =
    !!profile &&
    !queriesLoading &&
    (profile.questionnaireComplete || isMemberProfileReady(profile, preferences));
  const canQueryChat =
    profileReady &&
    hasPaidAccess(profile) &&
    !needsApprovalGate(profile) &&
    !isInteractionLocked(profile);

  const {
    conversations: conversationsRaw,
    error: conversationsError,
    refresh: refreshConversations,
  } = useConversations({
    list: matchList,
    enabled: canQueryChat,
  });
  const conversations = Array.isArray(conversationsRaw)
    ? (conversationsRaw as Conversation[])
    : undefined;
  const { isOnline, seed: seedPresence } = usePresence();

  useEffect(() => {
    if (!conversations?.length) return;
    seedPresence(
      conversations
        .map((c) => c.profile)
        .filter((p): p is NonNullable<typeof p> => !!p?.userId)
        .map((p) => ({ userId: p.userId, isOnline: p.isOnline }))
    );
  }, [conversations, seedPresence]);

  // Drive the open thread from the URL so phone/browser Back closes chat first.
  const activeConversation = conversationParam
    ? (conversationParam as string)
    : null;

  const {
    messages: messagesRaw,
    error: messagesError,
    refresh: refreshMessages,
  } = useMessages(activeConversation ?? undefined);
  const messages = Array.isArray(messagesRaw)
    ? (messagesRaw as ChatMessage[])
    : undefined;

  const isTyping = useTypingStatus(activeConversation ?? undefined);

  const sendMessage = useSendMessage();
  const markAsRead = useMarkAsRead();
  const setTyping = useSetTyping();
  const uploadChatImage = useUploadChatImage();
  const markMatchSeen = useMarkMatchSeen();
  const archiveMatch = useArchiveMatch();

  const activeConv = conversations?.find((c) => c.conversationId === activeConversation);
  const myUserId =
    (currentUser as { userId?: string; id?: string } | null | undefined)?.userId ??
    (currentUser as { id?: string } | null | undefined)?.id;
  const showMobileChat = Boolean(activeConversation);

  const chatListHref = `/chat?list=${matchList}`;

  const setMatchList = (list: MatchList) => {
    router.replace(`/chat?list=${list}`, { scroll: false });
  };

  const openConversation = (conv: Conversation) => {
    if (!conv.conversationId) return;
    // push so phone/browser Back returns to the conversation list (not home).
    router.push(`/chat?list=${matchList}&c=${conv.conversationId}`, { scroll: false });
    if (conv.isNew) {
      void markMatchSeen({ matchId: conv.matchId });
    }
  };

  const closeConversation = () => {
    router.push(chatListHref, { scroll: false });
  };

  useMarkNotificationsRead(
    ["message"],
    profileReady,
    activeConv?.profile?.userId
  );

  useEffect(() => {
    setPartnerProfileOpen(false);
  }, [activeConversation]);

  useEffect(() => {
    if (!activeConversation) return;
    if (markedReadRef.current === activeConversation) return;
    markAsRead({ conversationId: activeConversation });
    markedReadRef.current = activeConversation;
  }, [activeConversation, markAsRead]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!message.trim() || !activeConversation || sending) return;
    setSending(true);
    try {
      await sendMessage({ conversationId: activeConversation, message: message.trim() });
      setMessage("");
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      void setTyping({ conversationId: activeConversation, isTyping: false });
    } catch (error) {
      if (error instanceof Error && error.message.includes("payment")) {
        toast.error(t("chatPage.paymentRequired", { price: formatMoney(planPricesForGender(profile?.gender).basic) }));
      } else {
        toast.error(t("chatPage.sendFailed"));
      }
    } finally {
      setSending(false);
    }
  };

  const handleTyping = (value: string) => {
    setMessage(value);
    if (!activeConversation) return;
    clearTimeout(typingStartRef.current ?? undefined);
    typingStartRef.current = setTimeout(() => {
      void setTyping({ conversationId: activeConversation, isTyping: true });
    }, 300);
    clearTimeout(typingTimeoutRef.current ?? undefined);
    typingTimeoutRef.current = setTimeout(() => {
      void setTyping({ conversationId: activeConversation, isTyping: false });
    }, 2000);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file || !activeConversation || uploading) return;
    setUploading(true);
    try {
      const uploaded = await uploadChatImage(activeConversation, file);
      if (!uploaded.mediaId) throw new Error("upload failed");
      await sendMessage({
        conversationId: activeConversation,
        message: t("chatPage.imageMessage"),
        imageId: uploaded.mediaId,
      });
    } catch {
      toast.error(t("chatPage.uploadFailed"));
    } finally {
      resetFileInput(input);
      setUploading(false);
    }
  };

  if (staffLoading || isStaff) {
    return (
      <DashboardLayout>
        <ChatShell>
          <div className="flex flex-1 flex-col gap-4" role="status" aria-busy>
            <Skeleton className="flex-1 w-full rounded-none sm:rounded-2xl" aria-hidden />
          </div>
        </ChatShell>
      </DashboardLayout>
    );
  }

  if (queriesLoading) {
    return (
      <DashboardLayout>
        <ChatShell>
          <MemberDataLoading pending />
        </ChatShell>
      </DashboardLayout>
    );
  }

  if (!isStaff && profileError && !profile) {
    return (
      <DashboardLayout>
        <DataLoadError
          message={profileError}
          onRetry={() => void refreshProfile()}
        />
      </DashboardLayout>
    );
  }

  if (profile && !profileReady) {
    return (
      <DashboardLayout>
        <ProfileLockedGate
          profile={profile}
          preferences={preferences}
          title={t("chatPage.completeProfileTitle")}
          description={t("chatPage.completeProfileDesc")}
        />
      </DashboardLayout>
    );
  }

  if (profile && !hasPaidAccess(profile)) {
    return (
      <DashboardLayout>
        <PaymentGate
          gender={profile.gender === "female" || profile.gender === "male" ? profile.gender : undefined}
          title={
            isTrialExpired(profile)
              ? t("payment.trialEndedTitle")
              : t("payment.profileReadyTitle")
          }
          description={
            isTrialExpired(profile)
              ? t("payment.trialEndedDesc", {
                  basic: formatMoney(planPricesForGender(profile.gender).basic),
                  premium: formatMoney(planPricesForGender(profile.gender).premium),
                })
              : t("payment.profileReadyDesc", {
                  basic: formatMoney(planPricesForGender(profile.gender).basic),
                  premium: formatMoney(planPricesForGender(profile.gender).premium),
                })
          }
        />
      </DashboardLayout>
    );
  }

  if (profile && isInteractionLocked(profile)) {
    const status = profile.banned
      ? "banned"
      : resolveReviewStatus(profile) === "paused"
        ? "paused"
        : "suspended";
    return (
      <DashboardLayout>
        <AccountLockedGate status={status} />
      </DashboardLayout>
    );
  }

  if (profile && needsApprovalGate(profile)) {
    return (
      <DashboardLayout>
        <PendingApprovalGate isPremium={isPremiumMember(profile)} />
      </DashboardLayout>
    );
  }

  if (canQueryChat && conversationsError && conversations === undefined) {
    return (
      <DashboardLayout>
        <ChatShell>
          <DataLoadError
            message={conversationsError}
            onRetry={() => void refreshConversations()}
          />
        </ChatShell>
      </DashboardLayout>
    );
  }

  if (conversations === undefined) {
    return (
      <DashboardLayout>
        <ChatShell>
          <Skeleton className="flex-1 w-full rounded-none sm:rounded-2xl" />
        </ChatShell>
      </DashboardLayout>
    );
  }

  const listTabs: { id: MatchList; label: string }[] = [
    { id: "active", label: t("chatPage.listActive") },
    { id: "new", label: t("chatPage.listNew") },
    { id: "archived", label: t("chatPage.listArchived") },
  ];

  const emptyMessage =
    matchList === "new"
      ? t("chatPage.newEmpty")
      : matchList === "archived"
        ? t("chatPage.archivedEmpty")
        : null;

  return (
    <DashboardLayout>
      <ChatShell>
        <div className="flex flex-1 min-h-0 rounded-none sm:rounded-2xl border-y sm:border border-border overflow-hidden bg-card shadow-sm">
          {/* Conversation list */}
          <div
            className={cn(
              "w-full sm:w-80 lg:w-96 border-r border-border flex flex-col min-h-0 bg-card",
              showMobileChat ? "hidden sm:flex" : "flex"
            )}
          >
            <div className="px-4 py-3.5 border-b border-border space-y-3 shrink-0">
              <div>
                <h2 className="text-sm font-bold">{t("chatPage.messages")}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {conversations.length}{" "}
                  {conversations.length === 1
                    ? t("chatPage.conversation")
                    : t("chatPage.conversations")}
                </p>
              </div>
              <div className="flex gap-1 rounded-xl bg-muted p-1">
                {listTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMatchList(tab.id)}
                    className={cn(
                      "flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors",
                      matchList === tab.id
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2 space-y-1">
              {conversations.length === 0 ? (
                <div className="px-3 py-10 text-center">
                  {emptyMessage ? (
                    <p className="text-sm text-muted-foreground">{emptyMessage}</p>
                  ) : (
                    <MessagesEmptyState />
                  )}
                </div>
              ) : (
                conversations.map((conv) => {
                  const isActive = activeConversation === conv.conversationId;
                  return (
                    <button
                      key={conv.matchId}
                      type="button"
                      onClick={() => openConversation(conv)}
                      disabled={!conv.conversationId}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left",
                        isActive
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-muted"
                      )}
                    >
                      <span className="relative h-11 w-11 shrink-0">
                        <Avatar className="h-11 w-11">
                          <AvatarImage src={conv.profile?.imageUrl ?? undefined} />
                          <AvatarFallback className="bg-muted text-foreground font-medium">
                            {conv.profile?.name?.charAt(0) ?? "?"}
                          </AvatarFallback>
                        </Avatar>
                        <OnlineDot
                          online={isOnline(
                            conv.profile?.userId,
                            !!conv.profile?.isOnline
                          )}
                        />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold truncate text-sm flex items-center gap-1.5">
                            {conv.profile?.name ?? t("chatPage.match")}
                            {conv.isNew && (
                              <Badge variant="success" className="text-[9px] px-1.5 py-0">
                                {t("notificationsPage.new")}
                              </Badge>
                            )}
                          </p>
                          <div className="flex items-center gap-1 shrink-0">
                            {conv.unreadCount > 0 && (
                              <Badge className="text-[10px] h-5 min-w-5 px-1.5">
                                {conv.unreadCount}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {conv.lastMessage ?? t("chatPage.sayHello")}
                        </p>
                      </div>
                      {!conv.chatUnlocked && (
                        <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Chat panel */}
          <div
            className={cn(
              "flex-1 flex flex-col min-h-0 min-w-0 bg-background",
              showMobileChat ? "flex" : "hidden sm:flex"
            )}
          >
            {activeConversation && activeConv ? (
              <>
                <div className="px-4 py-3 border-b border-border flex items-center gap-3 bg-card/95 backdrop-blur-sm shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="sm:hidden shrink-0 rounded-xl h-9 w-9"
                    onClick={closeConversation}
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      if (activeConv.profile?.userId) setPartnerProfileOpen(true);
                    }}
                    disabled={!activeConv.profile?.userId}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:hover:bg-transparent -m-1 p-1"
                    aria-label={t("chatPage.viewProfile", {
                      name: activeConv.profile?.name ?? t("chatPage.match"),
                    })}
                  >
                    <span className="relative h-10 w-10 shrink-0">
                      <Avatar className="h-10 w-10 ring-2 ring-border/60">
                        <AvatarImage src={activeConv.profile?.imageUrl ?? undefined} />
                        <AvatarFallback className="bg-muted font-medium">
                          {activeConv.profile?.name?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <OnlineDot
                        online={isOnline(
                          activeConv.profile?.userId,
                          !!activeConv.profile?.isOnline
                        )}
                        size="sm"
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="font-bold text-sm truncate underline-offset-2 group-hover:underline">
                          {activeConv.profile?.name}
                        </p>
                        {typeof activeConv.score === "number" ? (
                          <Badge
                            variant="secondary"
                            className="shrink-0 text-[10px] font-semibold px-1.5 py-0"
                          >
                            {Math.round(activeConv.score)}%
                          </Badge>
                        ) : null}
                      </div>
                      {activeConv.profile && (
                        <TrustBadges profile={activeConv.profile} size="sm" className="mt-1" />
                      )}
                      {!activeConv.chatUnlocked ? (
                        <p className="text-xs text-muted-foreground mt-1">{t("chatPage.locked")}</p>
                      ) : isTyping ? (
                        <p className="text-xs text-primary mt-1">{t("chatPage.typing")}</p>
                      ) : isOnline(
                          activeConv.profile?.userId,
                          !!activeConv.profile?.isOnline
                        ) ? (
                        <p className="text-xs font-medium text-emerald-600 mt-1 flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                          {t("chatPage.online")}
                        </p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {t("chatPage.tapForProfile")}
                        </p>
                      )}
                    </div>
                  </button>
                  {activeConv.profile?.userId && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-xl"
                        aria-label={
                          matchList === "archived"
                            ? t("chatPage.unarchive")
                            : t("chatPage.archive")
                        }
                        disabled={archiving}
                        onClick={async () => {
                          if (archiving) return;
                          setArchiving(true);
                          try {
                            await archiveMatch({
                              matchId: activeConv.matchId,
                              archived: matchList !== "archived",
                            });
                            closeConversation();
                            toast.success(
                              matchList === "archived"
                                ? t("chatPage.unarchive")
                                : t("chatPage.archive")
                            );
                          } catch {
                            toast.error(t("chatPage.sendFailed"));
                          } finally {
                            setArchiving(false);
                          }
                        }}
                      >
                        {archiving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Archive className="h-4 w-4" />
                        )}
                      </Button>
                      <ReportBlockMenu
                        compact
                        userId={activeConv.profile.userId}
                        userName={activeConv.profile.name}
                        reportContext={t("safety.reportFromChat", {
                          name: activeConv.profile.name,
                        })}
                        onDone={closeConversation}
                      />
                    </div>
                  )}
                </div>

                {activeConv.profile ? (
                  <ChatPartnerProfileModal
                    open={partnerProfileOpen}
                    onClose={() => setPartnerProfileOpen(false)}
                    profile={activeConv.profile}
                    conversationId={activeConv.conversationId}
                    score={activeConv.score}
                  />
                ) : null}

                {!activeConv.chatUnlocked ? (
                  <div className="flex-1 flex items-center justify-center p-8">
                    <div className="text-center max-w-xs">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground mx-auto mb-4">
                        <Lock className="h-7 w-7" />
                      </div>
                      <h3 className="text-lg font-bold mb-2">{t("chatPage.unlockChat")}</h3>
                      <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
                        {t("chatPage.unlockChatDesc", {
                          price: formatMoney(planPricesForGender(profile?.gender).basic),
                          name: activeConv.profile?.name?.split(" ")[0] ?? t("chatPage.match"),
                        })}
                      </p>
                      <Button asChild>
                        <Link href="/payment">
                          {t("chatPage.pay", { price: formatMoney(planPricesForGender(profile?.gender).basic) })}
                        </Link>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col">
                    <div className="shrink-0">
                      <ChatSafetyBanner />
                    </div>
                    {activeConv.chatUnlocked && (
                      <div className="shrink-0 px-4 pt-3">
                        <PrivatePhotoRevealCard
                          matchId={String(activeConv.matchId)}
                          partnerName={activeConv.profile?.name}
                        />
                      </div>
                    )}
                    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y px-4 py-4 space-y-3">
                      {messagesError && messages === undefined ? (
                        <DataLoadError
                          message={messagesError}
                          onRetry={() => void refreshMessages()}
                        />
                      ) : null}
                      {messages?.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted mb-3">
                            <MessageCircle className="h-6 w-6 text-muted-foreground" />
                          </div>
                          <p className="text-sm font-medium">{t("chatPage.startConversation")}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {t("chatPage.sayHelloTo", {
                              name: activeConv.profile?.name?.split(" ")[0] ?? "",
                            })}
                          </p>
                          <p className="text-xs text-muted-foreground mt-4 max-w-xs leading-relaxed">
                            {t("chatPage.safetyReminder")}
                          </p>
                        </div>
                      )}
                      {messages?.map((msg) => {
                        const isMine = msg.senderId === myUserId;
                        return (
                          <div
                            key={msg._id}
                            className={cn("flex", isMine ? "justify-end" : "justify-start")}
                          >
                            <div
                              className={cn(
                                "max-w-[80%] rounded-2xl px-3.5 py-2 shadow-sm",
                                isMine
                                  ? "bg-primary text-primary-foreground rounded-br-md"
                                  : "bg-card border border-border rounded-bl-md"
                              )}
                            >
                              {msg.imageUrl && (
                                <LazyImage
                                  src={msg.imageUrl}
                                  alt={t("chatPage.sharedImage")}
                                  className="rounded-xl max-w-full mb-1.5"
                                />
                              )}
                              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                                {msg.message}
                              </p>
                              <div className="flex items-center justify-end gap-1 mt-1">
                                <p
                                  className={cn(
                                    "text-[10px]",
                                    isMine ? "text-primary-foreground/70" : "text-muted-foreground"
                                  )}
                                >
                                  {formatTime(msg.createdAt)}
                                </p>
                                {isMine && (
                                  <span className="inline-flex" title={msg.read ? t("chatPage.read") : t("chatPage.sent")}>
                                    {msg.read ? (
                                      <CheckCheck className="h-3.5 w-3.5 text-primary-foreground/85" />
                                    ) : (
                                      <Check className="h-3.5 w-3.5 text-primary-foreground/60" />
                                    )}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>

                    <div className="shrink-0 p-3 sm:p-4 border-t border-border bg-card pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:pb-4">
                      <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted/40 p-1.5">
                        <ImageFileHitArea
                          aria-label={t("chatPage.sharedImage")}
                          onChange={(e) => void handleImageUpload(e)}
                          className="shrink-0 h-9 w-9 rounded-xl"
                          disabled={uploading || sending}
                        >
                          <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                            <ImageIcon className="h-5 w-5" />
                          </span>
                        </ImageFileHitArea>
                        <Input
                          value={message}
                          onChange={(e) => handleTyping(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void handleSend()}
                          placeholder={t("chatPage.typeMessage")}
                          disabled={sending || uploading}
                          className="flex-1 h-10 border-0 bg-transparent shadow-none focus-visible:ring-0 px-2"
                        />
                        <Button
                          size="icon"
                          type="button"
                          onClick={() => void handleSend()}
                          disabled={!message.trim() || sending || uploading}
                          className="shrink-0 rounded-xl h-9 w-9"
                        >
                          {sending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : activeConversation ? (
              <div className="flex flex-1 flex-col">
                <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="sm:hidden shrink-0 rounded-xl h-9 w-9"
                    onClick={closeConversation}
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                  <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
                  <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                </div>
                <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
                  {t("common.loading")}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center max-w-xs">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground mx-auto mb-4">
                    <MessageCircle className="h-7 w-7" />
                  </div>
                  <p className="font-bold mb-1">{t("chatPage.selectConversation")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("chatPage.selectConversationDesc")}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </ChatShell>
    </DashboardLayout>
  );
}
