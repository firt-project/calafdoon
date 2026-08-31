"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Camera, Loader2, User } from "lucide-react";
import { useUploadPhoto } from "@/data/photos/hooks";
import type { Profile } from "@/types";
import { Button } from "@/components/ui/button";
import { ImageFileHitArea } from "@/components/ui/image-file-hit-area";
import { ProfilePhotoPreview } from "@/components/profile/profile-photo-preview";
import { ContactAdminCard } from "@/components/support/contact-admin-card";
import { resetFileInput } from "@/lib/upload-image";
import { useQuestionnaireI18n } from "@/lib/i18n/questionnaire-i18n";
import { getSafeUserError } from "@/lib/safe-error";

interface QuestionnairePhotoStepProps {
  profile: Profile & { imageUrl?: string | null };
  onSubmit: () => void;
}

export function QuestionnairePhotoStep({ profile, onSubmit }: QuestionnairePhotoStepProps) {
  const { ui } = useQuestionnaireI18n();
  const uploadPhoto = useUploadPhoto();
  const [uploading, setUploading] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const displayUrl = localPreview ?? profile.imageUrl ?? null;
  const hasPhoto = !!profile.profileImageId || !!displayUrl;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      setLocalPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
      toast.success(ui("photoUploaded"));
    } catch (error) {
      toast.error(getSafeUserError(error, ui("uploadFailed")));
    } finally {
      setUploading(false);
      resetFileInput(input);
    }
  };

  const handleContinue = () => {
    onSubmit();
  };

  return (
    <div className="flex flex-col items-center text-center pb-40">
      <h2 className="text-[1.625rem] sm:text-3xl font-semibold tracking-tight leading-snug mb-3 w-full text-left">
        {ui("photoTitle")}
      </h2>
      <p className="text-base text-muted-foreground mb-8 w-full text-left leading-relaxed">
        {ui("photoStepDesc")}
      </p>

      {/* Avatar is also a tappable upload target (clip on INNER only). */}
      <ImageFileHitArea
        disabled={uploading}
        aria-label={ui("uploadPhotoAria")}
        onChange={(e) => void handleImageUpload(e)}
        className="relative mb-6 h-40 w-40 sm:h-48 sm:w-48 rounded-full"
      >
        <span className="block h-full w-full overflow-hidden rounded-full border-4 border-background shadow-xl ring-2 ring-border">
          {displayUrl || profile.profileImageId ? (
            <ProfilePhotoPreview
              imageUrl={displayUrl}
              hasStoredPhoto={!!profile.profileImageId}
              alt={profile.name}
              fallbackInitial={profile.name}
              className="h-full w-full rounded-full"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-muted">
              <User className="h-16 w-16 text-muted-foreground" />
            </span>
          )}
          {uploading ? (
            <span className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 className="h-8 w-8 animate-spin text-white" />
            </span>
          ) : (
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-black/45 py-2">
              <Camera className="h-5 w-5 text-white" />
            </span>
          )}
        </span>
      </ImageFileHitArea>

      <p className="text-lg font-medium text-foreground mb-2">{ui("uploadYourPhoto")}</p>
      <p className="text-base text-muted-foreground max-w-sm leading-relaxed mb-6">
        {ui("photoHelp")}
      </p>

      {/* Mid-page CTA — still above the fold on most phones */}
      <ImageFileHitArea
        disabled={uploading}
        aria-label={ui("uploadPhotoAria")}
        onChange={(e) => void handleImageUpload(e)}
        className="mb-8 w-full max-w-sm rounded-2xl bg-primary text-primary-foreground shadow-md"
      >
        <span className="flex h-14 w-full items-center justify-center gap-2 px-6 text-base font-semibold">
          {uploading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              {ui("uploading")}
            </>
          ) : (
            <>
              <Camera className="h-5 w-5" />
              {hasPhoto ? ui("changePhoto") : ui("choosePhoto")}
            </>
          )}
        </span>
      </ImageFileHitArea>

      <div className="w-full max-w-md">
        <ContactAdminCard source="questionnaire" defaultTopic="photo_upload" compact />
      </div>

      {/*
        Sticky bottom: the upload control lives HERE so nothing can cover the tap
        (previous bug: fixed “Continue” bar stole taps from Choose Photo).
      */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/80 bg-background/95 backdrop-blur-md px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-xl space-y-3">
          <Button
            onClick={handleContinue}
            className="w-full h-14 min-h-14 rounded-2xl text-lg font-semibold"
            size="lg"
            disabled={uploading}
          >
            {hasPhoto ? ui("submitAndReview") : ui("continueWithoutPhoto")}
          </Button>
          <ImageFileHitArea
            disabled={uploading}
            aria-label={ui("uploadPhotoAria")}
            onChange={(e) => void handleImageUpload(e)}
            className={
              hasPhoto
                ? "w-full rounded-2xl border border-input bg-background"
                : "w-full rounded-2xl bg-primary text-primary-foreground shadow-md"
            }
          >
            <span
              className={
                hasPhoto
                  ? "flex h-12 w-full items-center justify-center gap-2 px-6 text-sm font-medium"
                  : "flex h-14 w-full items-center justify-center gap-2 px-6 text-lg font-semibold"
              }
            >
              {uploading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {ui("uploading")}
                </>
              ) : (
                <>
                  <Camera className={hasPhoto ? "h-4 w-4" : "h-5 w-5"} />
                  {hasPhoto ? ui("changePhoto") : ui("choosePhoto")}
                </>
              )}
            </span>
          </ImageFileHitArea>
        </div>
      </div>
    </div>
  );
}
