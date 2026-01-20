-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'PREMIUM', 'ENTERPRISE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "preferences" JSONB,
    "subscription_tier" "SubscriptionTier" NOT NULL DEFAULT 'FREE',

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correction_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "profile_name" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "original_image_url" TEXT NOT NULL,
    "adjusted_image_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "correction_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correction_history" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "original_image_url" TEXT NOT NULL,
    "corrected_image_url" TEXT NOT NULL,
    "processing_time_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "correction_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "correction_profiles_user_id_created_at_idx" ON "correction_profiles"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "correction_history_profile_id_created_at_idx" ON "correction_history"("profile_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_token_idx" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- AddForeignKey
ALTER TABLE "correction_profiles" ADD CONSTRAINT "correction_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_history" ADD CONSTRAINT "correction_history_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "correction_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
