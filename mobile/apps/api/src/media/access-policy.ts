/**
 * Access policy documentation for Phase 3 media (local MinIO).
 *
 * Buckets are private. Clients never receive permanent public URLs.
 * Use MediaAccessService.createSignedDownloadUrl() with short TTL.
 *
 * | Purpose              | Bucket                 | Who may receive a signed URL                          |
 * |----------------------|------------------------|--------------------------------------------------------|
 * | profile_main         | hel-profile            | Any authenticated user (subject to profile visibility) |
 * | profile_additional   | hel-profile            | Any authenticated user (subject to profile visibility) |
 * | profile_private      | hel-profile-private    | Owner, explicit match peers, admin/owner staff         |
 * | chat_image           | hel-chat               | Conversation participants, admin/owner staff           |
 * | support_attachment   | hel-support            | Thread owner member, admin/owner staff                 |
 * | evc_screenshot       | hel-evc                | Owner, admin/owner staff only                          |
 * | unknown              | hel-profile            | Owner, admin/owner staff                               |
 */
export const MEDIA_ACCESS_POLICY_VERSION = "phase3-local-minio-v1";
