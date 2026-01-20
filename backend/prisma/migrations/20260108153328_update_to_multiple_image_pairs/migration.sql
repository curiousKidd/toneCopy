-- Migration to convert single image URLs to arrays
-- This allows storing multiple training image pairs per profile

-- Step 1: Add new array columns
ALTER TABLE "correction_profiles" ADD COLUMN "original_image_urls" TEXT[];
ALTER TABLE "correction_profiles" ADD COLUMN "adjusted_image_urls" TEXT[];

-- Step 2: Migrate existing data (wrap single URLs in arrays)
UPDATE "correction_profiles"
SET "original_image_urls" = ARRAY["original_image_url"],
    "adjusted_image_urls" = ARRAY["adjusted_image_url"];

-- Step 3: Set NOT NULL constraint on new columns
ALTER TABLE "correction_profiles" ALTER COLUMN "original_image_urls" SET NOT NULL;
ALTER TABLE "correction_profiles" ALTER COLUMN "adjusted_image_urls" SET NOT NULL;

-- Step 4: Drop old columns
ALTER TABLE "correction_profiles" DROP COLUMN "original_image_url";
ALTER TABLE "correction_profiles" DROP COLUMN "adjusted_image_url";
