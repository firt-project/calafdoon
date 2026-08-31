"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Mail, RefreshCw, UserPlus, XCircle } from "lucide-react";
import {
  useStaffInvitesList,
  useCreateStaffInvite,
  useRevokeStaffInvite,
  useResendStaffInvite,
} from "@/data/admin/hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/lib/i18n/context";
import type { TranslationPath } from "@/lib/i18n/translations";
import { getSafeUserError } from "@/lib/safe-error";

function formatInviteStatus(status: string, t: (key: TranslationPath) => string) {
  switch (status) {
    case "pending":
      return t("adminInvites.statusPending");
    case "accepted":
      return t("adminInvites.statusAccepted");
    case "revoked":
      return t("adminInvites.statusRevoked");
    case "expired":
      return t("adminInvites.statusExpired");
    default:
      return status;
  }
}

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "pending") return "default";
  if (status === "accepted") return "secondary";
  return "outline";
}

type StaffInvite = {
  _id?: string;
  id?: string;
  email: string;
  status: string;
  expiresAt: number | string;
};

export function AdminStaffInvitesPanel({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const { invites: invitesRaw, reload: reloadInvites } = useStaffInvitesList(true);
  const invites = invitesRaw as StaffInvite[] | null | undefined;
  const createInvite = useCreateStaffInvite();
  const revokeInvite = useRevokeStaffInvite();
  const resendInvite = useResendStaffInvite();

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (invites === undefined) {
    return <Skeleton className="h-40 w-full rounded-2xl" />;
  }

  if (invites === null) {
    return null;
  }

  const handleCreate = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error(t("adminInvites.emailRequired"));
      return;
    }

    setSubmitting(true);
    try {
      const result = await createInvite({ email: trimmed });
      setEmail("");
      toast.success(t("adminInvites.sentTo", { email: result.email }));
      reloadInvites();
    } catch (error) {
      toast.error(getSafeUserError(error, t("adminInvites.sendFailed"))
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (inviteId: string) => {
    setBusyId(inviteId);
    try {
      await revokeInvite({ inviteId });
      toast.success(t("adminInvites.revoked"));
      reloadInvites();
    } catch (error) {
      toast.error(getSafeUserError(error, t("adminInvites.revokeFailed"))
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleResend = async (inviteId: string) => {
    setBusyId(inviteId);
    try {
      await resendInvite({ inviteId });
      toast.success(t("adminInvites.resent"));
    } catch (error) {
      toast.error(getSafeUserError(error, t("adminInvites.resendFailed"))
      );
    } finally {
      setBusyId(null);
    }
  };

  const body = (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t("adminInvites.emailHint")}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="admin-invite-email">{t("adminInvites.emailLabel")}</Label>
          <Input
            id="admin-invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("adminInvites.emailPlaceholder")}
            autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreate();
            }}
          />
        </div>
        <div className="flex items-end">
          <Button
            className="w-full sm:w-auto"
            onClick={() => void handleCreate()}
            disabled={submitting}
          >
            {submitting ? t("adminInvites.sending") : t("adminInvites.sendInvite")}
          </Button>
        </div>
      </div>

      {invites.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("adminInvites.recent")}
          </p>
          <ul className="space-y-2">
            {invites.slice(0, 8).map((invite, index) => {
              const id = invite._id || invite.id || "";
              const rowKey = id || `${invite.email}-${index}`;
              return (
              <li
                key={rowKey}
                className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                    <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{invite.email}</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusVariant(invite.status)}>
                      {formatInviteStatus(invite.status, t)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {t("adminInvites.expires", {
                        date: new Date(invite.expiresAt).toLocaleDateString(),
                      })}
                    </span>
                  </div>
                </div>
                {invite.status === "pending" && (
                  <div className="flex flex-wrap gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!id || busyId === id}
                      onClick={() => {
                        if (!id) return;
                        void handleResend(id);
                      }}
                    >
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                      {t("adminInvites.resend")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!id || busyId === id}
                      onClick={() => {
                        if (!id) return;
                        void handleRevoke(id);
                      }}
                    >
                      <XCircle className="mr-1.5 h-3.5 w-3.5" />
                      {t("adminInvites.revoke")}
                    </Button>
                  </div>
                )}
              </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );

  if (embedded) return body;

  return (
    <Card className="border-border shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="h-4 w-4" />
          {t("adminInvites.title")}
        </CardTitle>
        <CardDescription>{t("adminInvites.description")}</CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
