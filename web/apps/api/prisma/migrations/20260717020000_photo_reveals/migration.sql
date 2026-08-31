-- One-time private photo reveals within active mutual matches
CREATE TABLE "photo_reveals" (
    "id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "viewer_user_id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "revealed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "photo_reveals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "photo_reveals_match_id_viewer_user_id_media_id_key" ON "photo_reveals"("match_id", "viewer_user_id", "media_id");
CREATE INDEX "photo_reveals_match_id_viewer_user_id_idx" ON "photo_reveals"("match_id", "viewer_user_id");
CREATE INDEX "photo_reveals_owner_user_id_idx" ON "photo_reveals"("owner_user_id");

ALTER TABLE "photo_reveals" ADD CONSTRAINT "photo_reveals_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "photo_reveals" ADD CONSTRAINT "photo_reveals_viewer_user_id_fkey" FOREIGN KEY ("viewer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "photo_reveals" ADD CONSTRAINT "photo_reveals_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
