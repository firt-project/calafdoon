import type { PrismaService } from "../prisma/prisma.service";
import type { MediaAccessService } from "./media-access.service";

type Viewer = {
  userId: string;
  roles: Array<"user" | "admin" | "owner">;
};

type ProfileImageRefs = {
  profileImageMediaId: string | null;
  profileImageConvexId: string | null;
};

export async function resolveProfileMainMediaId(
  prisma: PrismaService,
  profile: ProfileImageRefs
): Promise<string | null> {
  if (profile.profileImageMediaId) return profile.profileImageMediaId;
  if (!profile.profileImageConvexId) return null;
  const media = await prisma.mediaObject.findUnique({
    where: { convexStorageId: profile.profileImageConvexId },
    select: { id: true },
  });
  return media?.id ?? null;
}

export async function resolveProfileMainImageUrl(
  prisma: PrismaService,
  mediaAccess: MediaAccessService,
  profile: ProfileImageRefs,
  viewer: Viewer
): Promise<string | null> {
  const mediaId = await resolveProfileMainMediaId(prisma, profile);
  if (!mediaId) return null;
  try {
    const signed = await mediaAccess.createSignedDownloadUrl(mediaId, viewer);
    return signed.url;
  } catch {
    return null;
  }
}

export async function resolveAdditionalImageUrls(
  prisma: PrismaService,
  mediaAccess: MediaAccessService,
  profile: {
    additionalImageMediaIds: string[];
    additionalImageConvexIds: string[];
  },
  viewer: Viewer
): Promise<string[]> {
  const mediaIds =
    profile.additionalImageMediaIds.length > 0
      ? profile.additionalImageMediaIds
      : (
          await Promise.all(
            profile.additionalImageConvexIds.map((convexId) =>
              prisma.mediaObject.findUnique({
                where: { convexStorageId: convexId },
                select: { id: true },
              })
            )
          )
        )
          .map((m) => m?.id)
          .filter((id): id is string => !!id);

  const urls: string[] = [];
  for (const mediaId of mediaIds) {
    try {
      const signed = await mediaAccess.createSignedDownloadUrl(mediaId, viewer);
      urls.push(signed.url);
    } catch {
      // skip broken objects
    }
  }
  return urls;
}
