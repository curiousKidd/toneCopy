-- 스타일 프로필 필드 추가 (AI 자율 보정 시스템)
ALTER TABLE "correction_profiles"
  ADD COLUMN IF NOT EXISTS "style_description"     TEXT,
  ADD COLUMN IF NOT EXISTS "style_characteristics" JSONB,
  ADD COLUMN IF NOT EXISTS "reference_thumbnails"  TEXT[] NOT NULL DEFAULT '{}';
