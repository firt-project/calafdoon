"use client";

import Link from "next/link";
import type { CurrentUser, Profile } from "@/types";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { MemberDataLoading } from "@/components/auth/member-data-loading";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ProfileCompletionCard } from "@/components/profile/profile-completion-card";
import { ProfileEditScreen } from "@/components/profile/profile-edit-screen";
import type { Preferences } from "@/lib/profile-progress";
import { isOwnerRole, isStaffRole } from "@/lib/access";
import { useTranslation } from "@/lib/i18n/context";
import { useUnifiedAuth } from "@/data/auth/hooks";
import { useProfile, usePreferencesQuery } from "@/data/profile/hooks";

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user: currentUser } = useUnifiedAuth() as {
    user: CurrentUser | null | undefined;
  };
  const { profile, refresh: refreshProfile } = useProfile() as {
    profile:
      | (Profile & { imageUrl?: string | null; additionalImageUrls?: string[] })
      | null
      | undefined;
    refresh: () => Promise<void>;
  };
  const preferences = usePreferencesQuery() as Preferences | null | undefined;

  if (profile === undefined || currentUser === undefined) {
    return (
      <DashboardLayout>
        <MemberDataLoading pending />
      </DashboardLayout>
    );
  }

  if (!profile || !currentUser) {
    return (
      <DashboardLayout>
        <Skeleton className="h-96 w-full max-w-2xl mx-auto" />
      </DashboardLayout>
    );
  }

  const isStaff = isStaffRole(profile.role);
  const roleLabel = isOwnerRole(profile.role)
    ? t("profilePage.roleOwner")
    : profile.role === "admin"
      ? t("profilePage.roleAdmin")
      : t("profilePage.roleMember");

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {profile && !profile.questionnaireComplete && !isStaff && (
          <ProfileCompletionCard profile={profile} preferences={preferences} />
        )}

        {!isStaff && (
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/account-status">{t("accountStatus.title")}</Link>
          </Button>
        )}

        <ProfileEditScreen
          profile={profile}
          currentUser={currentUser}
          isStaff={isStaff}
          roleLabel={roleLabel}
          onProfileRefresh={refreshProfile}
        />
      </div>
    </DashboardLayout>
  );
}
