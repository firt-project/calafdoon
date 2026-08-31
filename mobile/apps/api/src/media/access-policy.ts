/**
 * Access policy documentation for Phase 3 media (local MinIO).
 *
 * Buckets are private. Clients never receive permanent public URLs.
 * Use MediaAccessService.createSignedDownloadUrl() with short TTL.
 *
 * Uploads (H3): purpose-specific max sizes and MIME allowlists live in
 * `upload-policy.ts`. Presigned PUTs bind Content-Type + Content-Length;
 * finalize/confirm HEADs the object and rejects/deletes mismatches.
 * Default signed URL TTL: S3_SIGNED_URL_TTL_SECONDS (300s).
 *
 * Deleted members: media rows are orphaned (`orphaned_media_objects`,
 * `ownerUserId` nulled). Application access is denied for everyone
 * (including staff) before any signed URL is issued. Physical R2 purge
 * is separate / retention-based and must not gate authorization.
 *
 * | Purpose              | Bucket                 | Who may receive a signed URL                          |
 * |----------------------|------------------------|--------------------------------------------------------|
 * | profile_main         | hel-profile            | Owner, staff, or visibility-authorized viewers         |
 * | profile_additional   | hel-profile            | Owner, staff, or visibility-authorized viewers         |
 * | profile_private      | hel-profile-private    | Owner, explicit match peers, admin/owner staff         |
 * | chat_image           | hel-chat               | Conversation participants, admin/owner staff           |
 * | support_attachment   | hel-support            | Thread owner member, admin/owner staff                 |
 * | evc_screenshot       | hel-evc                | Owner, admin/owner staff only                          |
 * | unknown              | hel-profile            | Owner, admin/owner staff                               |
 */
export const MEDIA_ACCESS_POLICY_VERSION = "phase3-local-minio-v1";
