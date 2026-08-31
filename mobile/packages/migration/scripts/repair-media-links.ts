/**
 * Repair migrated media links after bucket layout changes.
 *
 * Usage:
 *   set -a && source ../../TEL-CALAFKAAGA-1.env && set +a
 *   DATABASE_URL='postgresql://...@dpg-....render.com/hel_calafkaaga?sslmode=require' \
 *     npx tsx scripts/repair-media-links.ts
 */
import { PrismaClient } from "@prisma/client";

async function main() {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL is required");

  const url =
    base +
    (base.includes("?") ? "&" : "?") +
    "connection_limit=5&pool_timeout=60&connect_timeout=30";

  const prisma = new PrismaClient({ datasources: { db: { url } } });

  const helProfileBucket = process.env.S3_BUCKET_PROFILE ?? "hel-profile";
  const helEvcBucket = process.env.S3_BUCKET_EVC ?? "hel-evc";

  const bucketFix = await prisma.$executeRawUnsafe(`
    UPDATE media_objects
    SET bucket = CASE
      WHEN purpose = 'evc_screenshot' THEN '${helEvcBucket}'
      WHEN purpose IN ('profile_main', 'profile_additional', 'profile_private', 'unknown') THEN '${helProfileBucket}'
      WHEN purpose = 'chat_image' THEN '${process.env.S3_BUCKET_CHAT ?? "hel-chat"}'
      WHEN purpose = 'support_attachment' THEN '${process.env.S3_BUCKET_SUPPORT ?? "hel-support"}'
      ELSE bucket
    END
    WHERE bucket IS NULL OR bucket = 'helcalafkaaga'
  `);

  const profiles = await prisma.profile.findMany({
    where: {
      profileImageMediaId: null,
      profileImageConvexId: { not: null },
    },
    select: { id: true, profileImageConvexId: true },
  });
  let profileLinks = 0;
  for (const profile of profiles) {
    const media = await prisma.mediaObject.findUnique({
      where: { convexStorageId: profile.profileImageConvexId! },
      select: { id: true },
    });
    if (!media) continue;
    await prisma.profile.update({
      where: { id: profile.id },
      data: { profileImageMediaId: media.id },
    });
    profileLinks++;
  }

  const proofs = await prisma.evcPaymentProof.findMany({
    where: {
      screenshotMediaId: null,
      screenshotConvexId: { not: "" },
    },
    select: { id: true, screenshotConvexId: true },
  });
  let evcLinks = 0;
  for (const proof of proofs) {
    const media = await prisma.mediaObject.findUnique({
      where: { convexStorageId: proof.screenshotConvexId },
      select: { id: true },
    });
    if (!media) continue;
    await prisma.evcPaymentProof.update({
      where: { id: proof.id },
      data: { screenshotMediaId: media.id },
    });
    evcLinks++;
  }

  const additionalProfiles = await prisma.profile.findMany({
    where: {
      additionalImageMediaIds: { isEmpty: true },
      NOT: { additionalImageConvexIds: { equals: [] } },
    },
    select: { id: true, additionalImageConvexIds: true },
  });
  let additionalLinks = 0;
  for (const profile of additionalProfiles) {
    const mediaIds: string[] = [];
    for (const convexId of profile.additionalImageConvexIds) {
      const media = await prisma.mediaObject.findUnique({
        where: { convexStorageId: convexId },
        select: { id: true },
      });
      if (media) mediaIds.push(media.id);
    }
    if (mediaIds.length === 0) continue;
    await prisma.profile.update({
      where: { id: profile.id },
      data: { additionalImageMediaIds: mediaIds },
    });
    additionalLinks++;
  }

  console.log(
    JSON.stringify(
      {
        bucketRowsUpdated: Number(bucketFix),
        profileLinks,
        evcLinks,
        additionalLinks,
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
