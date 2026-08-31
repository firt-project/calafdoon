"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Camera, X } from "lucide-react";
import {
  useUploadPhoto,
  useAddAdditionalPhoto,
  useRemoveAdditionalPhoto,
} from "@/data/photos/hooks";
import type { Profile } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LazyImage } from "@/components/ui/lazy-image";
import { ImageFileHitArea } from "@/components/ui/image-file-hit-area";
import { MAX_PROFILE_PHOTOS } from "@/lib/constants";
import { useTranslation } from "@/lib/i18n/context";
import { resetFileInput } from "@/lib/upload-image";
import { getSafeUserError } from "@/lib/safe-error";

interface PremiumPhotosCardProps {
  profile: Profile & {
    imageUrl?: string | null;
    additionalImageUrls?: string[];
  };
}

export function PremiumPhotosCard({ profile }: PremiumPhotosCardProps) {
  const { t } = useTranslation();
  const uploadPhoto = useUploadPhoto();
  const addAdditionalPhoto = useAddAdditionalPhoto();
  const removeAdditionalPhoto = useRemoveAdditionalPhoto();
  const [uploading, setUploading] = useState(false);

  const extraUrls = profile.additionalImageUrls ?? [];
  const extraIds = profile.additionalImageIds ?? [];
  const totalPhotos = (profile.profileImageId ? 1 : 0) + extraIds.length;
  const canAddMore = totalPhotos < MAX_PROFILE_PHOTOS;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      await addAdditionalPhoto({ storageId });
      toast.success(t("premium.photoAdded"));
    } catch (error) {
      toast.error(getSafeUserError(error, t("profilePage.photoFailed"))
      );
    } finally {
      setUploading(false);
      resetFileInput(input);
    }
  };

  const handleRemove = async (storageId: string) => {
    try {
      await removeAdditionalPhoto(storageId);
      toast.success(t("premium.photoRemoved"));
    } catch {
      toast.error(t("premium.photoRemoveFailed"));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("premium.photosTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t("premium.photosDesc", { max: MAX_PROFILE_PHOTOS })}
        </p>

        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {extraUrls.map((url, index) => (
            <div key={url} className="relative aspect-square rounded-xl overflow-hidden bg-muted">
              <LazyImage src={url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => void handleRemove(extraIds[index])}
                className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white"
                aria-label={t("common.a11yClose")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {canAddMore && (
            <ImageFileHitArea
              disabled={uploading}
              aria-label={t("premium.addPhoto")}
              onChange={(e) => void handleUpload(e)}
              className={`aspect-square rounded-xl border-2 border-dashed border-border ${
                uploading ? "opacity-60" : ""
              }`}
            >
              <span className="flex h-full min-h-[5.5rem] w-full flex-col items-center justify-center gap-1 text-muted-foreground">
                <Camera className="h-5 w-5" />
                <span className="text-[10px] font-medium">{t("premium.addPhoto")}</span>
              </span>
            </ImageFileHitArea>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {t("premium.photosCount", { count: totalPhotos, max: MAX_PROFILE_PHOTOS })}
        </p>
      </CardContent>
    </Card>
  );
}
