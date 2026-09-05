"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Camera,
  Crown,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Pencil,
  Save,
  Shield,
  Users,
} from "lucide-react";
import { useUpdateProfile } from "@/data/profile/hooks";
import {
  useUploadPhoto,
  useRemoveAdditionalPhoto,
  useMyPhotos,
} from "@/data/photos/hooks";
import type { CurrentUser, Profile } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneNumberInput } from "@/components/ui/phone-number-input";
import { FormField } from "@/components/ui/form-field";
import { Badge } from "@/components/ui/badge";
import { LazyImage } from "@/components/ui/lazy-image";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfilePhotoPreview } from "@/components/profile/profile-photo-preview";
import { PhotoGalleryLightbox } from "@/components/ui/photo-gallery-lightbox";
import { TrustBadges } from "@/components/profile/trust-badges";
import { ChangePasswordCard } from "@/components/profile/change-password-card";
import { MfaSettingsCard } from "@/components/profile/mfa-settings-card";
import { DeleteAccountCard } from "@/components/profile/delete-account-card";
import { BlockedUsersCard } from "@/components/safety/blocked-users-card";
import { PremiumWaliCard } from "@/components/premium/premium-wali-card";
import { AdminStaffInvitesPanel } from "@/components/admin/admin-staff-invites-panel";
import { ContactAdminCard } from "@/components/support/contact-admin-card";
import { ImageFileHitArea } from "@/components/ui/image-file-hit-area";
import { isOwnerRole, isPremiumMember } from "@/lib/access";
import { MAX_PROFILE_PHOTOS } from "@/lib/constants";
import { isValidContactPhone } from "@/lib/phone";
import { useTranslation } from "@/lib/i18n/context";
import { resetFileInput } from "@/lib/upload-image";
import { cn } from "@/lib/utils";
import { getSafeUserError } from "@/lib/safe-error";

const MAX_PRIVATE_PHOTOS = 2;

const profileSchema = z.object({
  name: z.string().min(2),
  phone: z
    .string()
    .optional()
    .refine((value) => !value || isValidContactPhone(value), "invalid"),
});

type ProfileForm = z.infer<typeof profileSchema>;

interface ProfileEditScreenProps {
  profile: Profile & {
    imageUrl?: string | null;
    additionalImageUrls?: string[];
    additionalImageIds?: string[];
  };
  currentUser: CurrentUser;
  isStaff: boolean;
  roleLabel: string;
  /** Refresh profile after API-mode photo mutations (Nest confirm already persists). */
  onProfileRefresh?: () => Promise<void>;
}

export function ProfileEditScreen({
  profile,
  currentUser,
  isStaff,
  roleLabel,
  onProfileRefresh,
}: ProfileEditScreenProps) {
  const { t } = useTranslation();
  const updateProfile = useUpdateProfile();
  const uploadPhoto = useUploadPhoto();
  const removeAdditionalPhoto = useRemoveAdditionalPhoto();
  const { data: myPhotosRaw, refresh: refreshMyPhotos } = useMyPhotos(!isStaff);
  const [uploading, setUploading] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [savingPrivacy, setSavingPrivacy] = useState(false);

  const isPremium = isPremiumMember(profile);
  const isOwner = isOwnerRole(profile.role);
  const photoVisibility = profile.photoVisibility ?? "everyone";
  const extraUrls = profile.additionalImageUrls ?? [];
  const extraIds = profile.additionalImageIds ?? [];
  const allPhotoUrls = [profile.imageUrl, ...extraUrls].filter(
    (url): url is string => !!url
  );
  const totalPhotos = (profile.profileImageId ? 1 : 0) + extraIds.length;
  const canAddMore = totalPhotos < MAX_PROFILE_PHOTOS;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    values: { name: profile.name, phone: profile.phone ?? "" },
  });
  const phoneValue = watch("phone") ?? "";

  const openGallery = (index: number) => {
    if (!allPhotoUrls.length) return;
    setGalleryIndex(index);
    setGalleryOpen(true);
  };

  const handlePrimaryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadPhoto(file, { slot: "main" });
      const storageId = String(
        (uploaded as { storageId?: string; mediaId?: string }).storageId ??
          (uploaded as { mediaId?: string }).mediaId ??
          ""
      );
      if (!storageId) throw new Error("upload failed");
      // Nest confirm-upload already sets the main photo.
      await onProfileRefresh?.();
      toast.success(t("profilePage.photoUpdated"));
    } catch (error) {
      toast.error(getSafeUserError(error, t("profilePage.photoFailed")));
    } finally {
      setUploading(false);
      resetFileInput(input);
    }
  };

  const handleExtraUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadPhoto(file, { slot: "additional" });
      const storageId = String(
        (uploaded as { storageId?: string; mediaId?: string }).storageId ??
          (uploaded as { mediaId?: string }).mediaId ??
          ""
      );
      if (!storageId) throw new Error("upload failed");
      // Nest confirm-upload already attaches additional photos.
      await onProfileRefresh?.();
      toast.success(t("premium.photoAdded"));
    } catch (error) {
      toast.error(getSafeUserError(error, t("profilePage.photoFailed")));
    } finally {
      setUploading(false);
      resetFileInput(input);
    }
  };

  const privatePhotos = (
    (myPhotosRaw as { photos?: Array<{ role?: string; mediaId?: string; url?: string | null }> } | null)
      ?.photos ?? []
  ).filter((p) => p.role === "private" && p.url);

  const handlePrivateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadPhoto(file, { slot: "private" });
      await refreshMyPhotos();
      toast.success(t("privateReveal.privateUploaded"));
    } catch (error) {
      toast.error(getSafeUserError(error, t("profilePage.photoFailed")));
    } finally {
      setUploading(false);
      resetFileInput(input);
    }
  };

  const handlePrivateRemove = async (mediaId: string) => {
    try {
      await removeAdditionalPhoto(mediaId);
      await refreshMyPhotos();
      toast.success(t("premium.photoRemoved"));
    } catch (error) {
      toast.error(getSafeUserError(error, t("profilePage.photoFailed")));
    }
  };

  const onSubmit = async (data: ProfileForm) => {
    try {
      await updateProfile(data);
      toast.success(t("profilePage.updated"));
    } catch {
      toast.error(t("profilePage.updateFailed"));
    }
  };

  const setPhotoVisibility = async (
    value: "everyone" | "matches" | "private"
  ) => {
    setSavingPrivacy(true);
    try {
      await updateProfile({ photoVisibility: value });
      toast.success(t("profilePage.privacyUpdated"));
    } catch {
      toast.error(t("profilePage.updateFailed"));
    } finally {
      setSavingPrivacy(false);
    }
  };

  const privacyOptions = [
    {
      value: "everyone" as const,
      icon: Eye,
      title: t("profilePage.photoEveryone"),
      desc: t("profilePage.photoEveryoneDesc"),
    },
    {
      value: "matches" as const,
      icon: Users,
      title: t("profilePage.photoMatches"),
      desc: t("profilePage.photoMatchesDesc"),
    },
    {
      value: "private" as const,
      icon: EyeOff,
      title: t("profilePage.photoPrivate"),
      desc: t("profilePage.photoPrivateDesc"),
    },
  ];

  return (
    <>
      <Card className="overflow-hidden">
        <div className="relative bg-gradient-to-br from-primary/10 via-accent/30 to-transparent px-5 pt-8 pb-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5">
            <div className="relative shrink-0">
              {profile.imageUrl || profile.profileImageId ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => openGallery(0)}
                    className="block h-28 w-28 rounded-2xl overflow-hidden ring-4 ring-card shadow-lg"
                  >
                    <ProfilePhotoPreview
                      imageUrl={profile.imageUrl}
                      hasStoredPhoto={!!profile.profileImageId}
                      alt={profile.name}
                      fallbackInitial={profile.name}
                      className="h-full w-full"
                    />
                  </button>
                  {!isStaff && (
                    <ImageFileHitArea
                      disabled={uploading}
                      aria-label={t("profilePage.changePhoto")}
                      onChange={(e) => void handlePrimaryUpload(e)}
                      className="absolute -bottom-1 -right-1 z-40 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg"
                    >
                      <span className="flex h-full w-full items-center justify-center">
                        <Camera className="h-5 w-5" />
                      </span>
                    </ImageFileHitArea>
                  )}
                </div>
              ) : !isStaff ? (
                <ImageFileHitArea
                  disabled={uploading}
                  aria-label={t("profilePage.uploadPhoto")}
                  onChange={(e) => void handlePrimaryUpload(e)}
                  className={`block h-28 w-28 rounded-2xl ring-4 ring-card shadow-lg ${
                    uploading ? "opacity-70" : ""
                  }`}
                >
                  <span className="block h-full w-full overflow-hidden rounded-2xl">
                    <ProfilePhotoPreview
                      imageUrl={profile.imageUrl}
                      hasStoredPhoto={!!profile.profileImageId}
                      alt={profile.name}
                      fallbackInitial={profile.name}
                      className="h-full w-full"
                    />
                  </span>
                </ImageFileHitArea>
              ) : (
                <div className="block h-28 w-28 rounded-2xl overflow-hidden ring-4 ring-card shadow-lg">
                  <ProfilePhotoPreview
                    imageUrl={profile.imageUrl}
                    hasStoredPhoto={!!profile.profileImageId}
                    alt={profile.name}
                    fallbackInitial={profile.name}
                    className="h-full w-full"
                  />
                </div>
              )}
            </div>
            <div className="text-center sm:text-left flex-1 min-w-0">
              <h1 className="truncate font-display text-2xl font-semibold">{profile.name}</h1>
              {isStaff ? (
                <div className="mt-2 space-y-1">
                  {currentUser.email && (
                    <p className="text-sm text-muted-foreground flex items-center justify-center sm:justify-start gap-1.5">
                      <Mail className="h-3.5 w-3.5" />
                      {currentUser.email}
                    </p>
                  )}
                  <Badge
                    className={
                      isOwnerRole(profile.role)
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                        : "bg-primary/10 text-primary"
                    }
                  >
                    {isOwnerRole(profile.role) ? (
                      <Crown className="h-3 w-3 mr-1" />
                    ) : (
                      <Shield className="h-3 w-3 mr-1" />
                    )}
                    {roleLabel}
                  </Badge>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-center sm:justify-start gap-2 mt-1">
                    <p className="text-muted-foreground capitalize">{profile.gender}</p>
                    {!profile.hasPaid && !profile.genderLocked ? (
                      <Link
                        href="/register/details?editGender=1"
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        {t("common.edit")}
                      </Link>
                    ) : null}
                  </div>
                  <TrustBadges profile={profile} className="mt-2 justify-center sm:justify-start" />
                </>
              )}
            </div>
          </div>
          {allPhotoUrls.length > 1 && (
            <div className="flex gap-2 mt-5 overflow-x-auto pb-1">
              {allPhotoUrls.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => openGallery(i)}
                  className="h-14 w-14 shrink-0 rounded-xl overflow-hidden ring-2 ring-border hover:ring-primary/50"
                >
                  <LazyImage src={url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <CardContent className="p-4 sm:p-5">
          <Tabs defaultValue="profile" className="w-full">
            <TabsList className="w-full grid grid-cols-2 sm:grid-cols-4 h-auto gap-1">
              <TabsTrigger value="profile">{t("profilePage.tabProfile")}</TabsTrigger>
              <TabsTrigger value="photos">{t("profilePage.tabPhotos")}</TabsTrigger>
              <TabsTrigger value="privacy">{t("profilePage.tabPrivacy")}</TabsTrigger>
              <TabsTrigger value="account">{t("profilePage.tabAccount")}</TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="mt-5 space-y-5">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <FormField label={t("profilePage.name")} htmlFor="name" error={errors.name?.message} required>
                  <Input id="name" {...register("name")} />
                </FormField>
                <FormField
                  label={t("profilePage.phone")}
                  htmlFor="phone"
                  hint={t("profilePage.phoneHint")}
                  error={errors.phone ? t("validation.phoneInvalid") : undefined}
                >
                  <PhoneNumberInput
                    value={phoneValue}
                    profileCountry={profile.country}
                    placeholder={t("profilePage.phonePlaceholder")}
                    large={false}
                    onChange={(value) =>
                      setValue("phone", value, { shouldDirty: true, shouldValidate: true })
                    }
                  />
                </FormField>
                <Button type="submit" disabled={isSubmitting} size="sm">
                  <Save className="h-4 w-4 mr-2" />
                  {isSubmitting ? t("profilePage.saving") : t("profilePage.saveChanges")}
                </Button>
              </form>

              {!isStaff && profile.questionnaireComplete && (
                <div className="rounded-2xl border border-border p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{t("profilePage.profileDetails")}</h3>
                      <p className="text-sm text-muted-foreground">
                        {t("profilePage.detailsSectionDesc")}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link href="/questionnaire?edit=1">
                        <Pencil className="h-4 w-4 mr-2" />
                        {t("profilePage.editDetails")}
                      </Link>
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-muted-foreground">{t("profilePage.age")}</span><p className="font-medium">{profile.age}</p></div>
                    <div><span className="text-muted-foreground">{t("profilePage.height")}</span><p className="font-medium">{profile.height} cm</p></div>
                    <div><span className="text-muted-foreground">{t("profilePage.country")}</span><p className="font-medium">{profile.country}</p></div>
                    <div><span className="text-muted-foreground">{t("profilePage.city")}</span><p className="font-medium">{profile.city}</p></div>
                    <div><span className="text-muted-foreground">{t("profilePage.education")}</span><p className="font-medium">{profile.education}</p></div>
                    <div><span className="text-muted-foreground">{t("profilePage.occupation")}</span><p className="font-medium">{profile.occupation}</p></div>
                  </div>
                </div>
              )}

              {!isStaff && profile.questionnaireComplete && (
                <>
                  <PremiumWaliCard profile={profile} />
                </>
              )}
            </TabsContent>

            <TabsContent value="photos" className="mt-5 space-y-4">
              {!isStaff && (
                <div className="rounded-2xl border border-border p-4 space-y-3">
                  <div>
                    <h3 className="font-semibold">{t("profilePage.primaryPhoto")}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t("profilePage.primaryPhotoDesc")}
                    </p>
                  </div>
                  <ImageFileHitArea
                    disabled={uploading}
                    aria-label={t("profilePage.changePhoto")}
                    onChange={(e) => void handlePrimaryUpload(e)}
                    className="block w-full rounded-2xl bg-primary text-primary-foreground"
                  >
                    <span className="flex h-12 w-full items-center justify-center gap-2 px-4 text-sm font-semibold">
                      <Camera className="h-4 w-4" />
                      {uploading
                        ? t("profilePage.uploading")
                        : profile.profileImageId
                          ? t("profilePage.changePhoto")
                          : t("profilePage.uploadPhoto")}
                    </span>
                  </ImageFileHitArea>
                </div>
              )}
              {!isStaff && profile.questionnaireComplete ? (
                <>
                  <div className="grid grid-cols-4 gap-2">
                    {extraUrls.map((url, index) => (
                      <div key={url} className="relative aspect-square rounded-xl overflow-hidden">
                        <button
                          type="button"
                          className="h-full w-full"
                          onClick={() => openGallery(index + 1)}
                        >
                          <LazyImage src={url} alt="" className="h-full w-full object-cover" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void removeAdditionalPhoto(String(extraIds[index]))
                              .then(async () => {
                                await onProfileRefresh?.();
                                toast.success(t("premium.photoRemoved"));
                              })
                          }
                          className="absolute top-1 right-1 text-[10px] px-1.5 py-0.5 rounded bg-black/50 text-white"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {canAddMore && (
                      <ImageFileHitArea
                        disabled={uploading}
                        aria-label={t("premium.addPhoto")}
                        onChange={(e) => void handleExtraUpload(e)}
                        className={`aspect-square rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground hover:border-primary/40 hover:text-primary text-[10px] gap-1 ${
                          uploading ? "opacity-60" : ""
                        }`}
                      >
                        <span className="flex flex-col items-center gap-1">
                          <Camera className="h-4 w-4" />
                          {t("premium.addPhoto")}
                        </span>
                      </ImageFileHitArea>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("premium.photosCount", { count: totalPhotos, max: MAX_PROFILE_PHOTOS })}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{t("profilePage.photosNeedProfile")}</p>
              )}
              {!isStaff && (
                <ContactAdminCard source="profile" defaultTopic="photo_upload" compact />
              )}
            </TabsContent>

            <TabsContent value="privacy" className="mt-5 space-y-4">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <Lock className="h-4 w-4 text-primary" />
                  {t("profilePage.photoPrivacyTitle")}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("profilePage.photoPrivacyDesc")}
                </p>
              </div>
              <div className="space-y-2">
                {privacyOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    disabled={savingPrivacy || isStaff}
                    onClick={() => void setPhotoVisibility(option.value)}
                    className={cn(
                      "w-full flex items-start gap-3 rounded-2xl border p-4 text-left transition-colors",
                      photoVisibility === option.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    )}
                  >
                    <option.icon className="h-5 w-5 shrink-0 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">{option.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        {option.desc}
                      </p>
                    </div>
                  </button>
                ))}
              </div>

              {!isStaff && profile.questionnaireComplete && (
                <div className="rounded-2xl border border-border p-4 space-y-3">
                  <div>
                    <h3 className="font-semibold flex items-center gap-2 text-sm">
                      <EyeOff className="h-4 w-4 text-primary" />
                      {t("privateReveal.ownerTitle")}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {t("privateReveal.ownerDesc")}
                    </p>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {privatePhotos.map((photo) => (
                      <div
                        key={photo.mediaId}
                        className="relative aspect-square rounded-xl overflow-hidden"
                      >
                        <LazyImage
                          src={photo.url!}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            void handlePrivateRemove(String(photo.mediaId))
                          }
                          className="absolute top-1 right-1 text-[10px] px-1.5 py-0.5 rounded bg-black/50 text-white"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {privatePhotos.length < MAX_PRIVATE_PHOTOS && (
                      <ImageFileHitArea
                        disabled={uploading}
                        aria-label={t("privateReveal.addPrivate")}
                        onChange={(e) => void handlePrivateUpload(e)}
                        className={`aspect-square rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground hover:border-primary/40 hover:text-primary text-[10px] gap-1 ${
                          uploading ? "opacity-60" : ""
                        }`}
                      >
                        <span className="flex flex-col items-center gap-1">
                          <Lock className="h-4 w-4" />
                          {t("privateReveal.addPrivate")}
                        </span>
                      </ImageFileHitArea>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {t("privateReveal.ownerCount", {
                      count: privatePhotos.length,
                      max: MAX_PRIVATE_PHOTOS,
                    })}
                  </p>
                </div>
              )}

              {!isStaff && (
                <div className="pt-2">
                  <h3 className="font-semibold mb-3">{t("profilePage.safetySection")}</h3>
                  <BlockedUsersCard embedded />
                </div>
              )}
            </TabsContent>

            <TabsContent value="account" className="mt-5 space-y-5">
              {currentUser.email && (
                <div className="rounded-2xl border border-border p-4">
                  <p className="text-xs text-muted-foreground">{t("profilePage.email")}</p>
                  <p className="font-medium mt-1">{currentUser.email}</p>
                </div>
              )}
              <ChangePasswordCard embedded />
              {isStaff && <MfaSettingsCard embedded />}
              {!isStaff && <DeleteAccountCard embedded />}
              {isOwner && <AdminStaffInvitesPanel embedded />}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <PhotoGalleryLightbox
        images={allPhotoUrls}
        initialIndex={galleryIndex}
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        alt={profile.name}
      />
    </>
  );
}
