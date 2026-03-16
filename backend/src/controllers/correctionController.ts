import { Request, Response, NextFunction } from 'express';
import { imageService } from '../services/imageService';
import { advancedImageService } from '../services/advancedImageService';
import { adaptiveCorrectionService } from '../services/adaptiveCorrectionService';
import { histogramMatchingService } from '../services/histogramMatchingService';
import { storageService } from '../services/storageService';
import { cacheService } from '../services/cacheService';
import { prisma } from '../models';
import { logger } from '../utils/logger';
import type { AdjustmentParameters, StyleProfile, CorrectionMode } from '../types';
import { extractUserId } from '../types';

export class CorrectionController {
  /**
   * POST /api/v1/correction/apply
   * 자동 보정 적용
   */
  async apply(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();

    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      if (!files?.image) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_FILE',
            message: 'Image file is required'
          }
        });
      }

      const imageFile = files.image[0];
      const profileId = req.body.profile_id;

      if (!profileId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_PROFILE_ID',
            message: 'Profile ID is required'
          }
        });
      }

      const userId = extractUserId(req);

      // ─── 프로필 로드 (캐시 → DB) ───
      let cachedData = await cacheService.get<any>(`profile:${userId}:${profileId}`);

      let parameters: AdjustmentParameters;
      let styleProfile: StyleProfile | null = null;
      let referenceThumbnails: string[] = [];

      if (cachedData) {
        // 신규 캐시 구조: { parameters, styleProfile, referenceThumbnails }
        if (cachedData.parameters && cachedData.styleProfile) {
          parameters        = cachedData.parameters;
          styleProfile      = cachedData.styleProfile;
          referenceThumbnails = cachedData.referenceThumbnails || [];
        } else {
          // 구 캐시 구조 (파라미터만 저장된 경우) 호환
          parameters = cachedData as AdjustmentParameters;
        }
      } else {
        // DB 조회
        const dbProfile = await prisma.correctionProfile.findUnique({
          where: { id: profileId }
        });

        if (!dbProfile) {
          return res.status(404).json({
            success: false,
            error: { code: 'PROFILE_NOT_FOUND', message: 'Correction profile not found' }
          });
        }

        parameters          = dbProfile.parameters as unknown as AdjustmentParameters;
        referenceThumbnails = dbProfile.referenceThumbnails || [];

        // styleCharacteristics가 있으면 StyleProfile 복원
        if (dbProfile.styleDescription && dbProfile.styleCharacteristics) {
          styleProfile = {
            description:     dbProfile.styleDescription,
            characteristics: dbProfile.styleCharacteristics as any,
            generatedAt:     dbProfile.updatedAt.toISOString()
          };
        }

        // 캐시 갱신
        await cacheService.set(
          `profile:${userId}:${profileId}`,
          { parameters, styleProfile, referenceThumbnails },
          3600
        );
      }

      // ─── 보정 모드 결정 ───
      // adaptive_ai: 신규 스타일 프로필이 있는 경우 (AI 적응형 보정)
      // lut: 구 프로필 (LUT 방식 fallback)
      const correctionMode: CorrectionMode = styleProfile ? 'adaptive_ai' : 'lut';

      logger.info('보정 모드 결정', { correctionMode, profileId });

      // 전송 프로필 복원 (adaptive_ai 모드에서만 사용)
      let transferProfile = null;
      let segmentedProfile = null;
      if (correctionMode === 'adaptive_ai') {
        const params = parameters as any;
        // HSL 세그먼트 프로필 (우선)
        if (params.segmentedTransfer) {
          try {
            segmentedProfile = histogramMatchingService.deserializeSegmentedProfile(params.segmentedTransfer);
            logger.info('HSL 세그먼트 프로필 복원 완료');
          } catch (err: any) {
            logger.warn('세그먼트 프로필 복원 실패, 글로벌로 폴백', { error: err.message });
          }
        }
        // 글로벌 히스토그램 (폴백)
        if (!segmentedProfile && params.histogramTransfer) {
          try {
            transferProfile = histogramMatchingService.deserializeProfile(params.histogramTransfer);
          } catch (err: any) {
            logger.warn('히스토그램 프로필 복원 실패, 무시', { error: err.message });
          }
        }
      }

      // ─── 보정 실행 ───
      const correctionPromise = correctionMode === 'adaptive_ai' && styleProfile
        ? adaptiveCorrectionService.applyAdaptiveStyle(
            imageFile.buffer,
            styleProfile,
            transferProfile,
            referenceThumbnails,
            segmentedProfile
          )
        : advancedImageService.applyAdaptiveCorrection(imageFile.buffer, parameters);

      // 원본 업로드와 보정을 병렬 처리
      const [correctedImage, originalUrl] = await Promise.all([
        correctionPromise,
        storageService.upload(imageFile.buffer, {
          folder: 'tonecopy/corrections/originals',
          expiresIn: 86400
        })
      ]);

      // 보정된 이미지 Cloudinary 업로드
      const correctedUrl = await storageService.upload(correctedImage, {
        folder: 'tonecopy/corrections',
        expiresIn: 86400 // 24시간
      });

      const processingTime = Date.now() - startTime;

      // 히스토리 저장 (실제 URL로 기록)
      const history = await prisma.correctionHistory.create({
        data: {
          profileId,
          originalImageUrl: originalUrl,
          correctedImageUrl: correctedUrl,
          processingTimeMs: processingTime
        }
      });

      logger.info('보정 완료', {
        historyId: history.id,
        profileId,
        processingTime,
        correctionMode
      });

      const expiresAt = new Date(Date.now() + 86400000);

      return res.status(200).json({
        success: true,
        data: {
          correction_id: history.id,
          original_image_url: originalUrl,
          corrected_image_url: correctedUrl,
          applied_adjustments: parameters,
          processing_time_ms: processingTime,
          download_url: correctedUrl,
          expires_at: expiresAt.toISOString(),
          correction_mode: correctionMode  // 어떤 방식으로 보정됐는지 클라이언트에 노출
        },
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      logger.error('Correction apply failed', {
        error: error.message,
        stack: error.stack
      });
      next(error);
    }
  }

  /**
   * POST /api/v1/correction/batch
   * 여러 이미지를 한 번에 보정 (배치 처리)
   */
  async applyBatch(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();

    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      if (!files?.images || files.images.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_FILES',
            message: 'At least one image file is required'
          }
        });
      }

      const profileId = req.body.profile_id;
      if (!profileId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_PROFILE_ID',
            message: 'Profile ID is required'
          }
        });
      }

      if (files.images.length > 20) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'TOO_MANY_FILES',
            message: 'Maximum 20 images per batch'
          }
        });
      }

      const userId = extractUserId(req);

      // 프로필 로드 (단일 보정과 동일 구조)
      let cachedData = await cacheService.get<any>(`profile:${userId}:${profileId}`);

      let batchParameters: AdjustmentParameters;
      let batchStyleProfile: StyleProfile | null = null;
      let batchReferenceThumbnails: string[] = [];

      if (cachedData) {
        if (cachedData.parameters && cachedData.styleProfile) {
          batchParameters         = cachedData.parameters;
          batchStyleProfile       = cachedData.styleProfile;
          batchReferenceThumbnails = cachedData.referenceThumbnails || [];
        } else {
          batchParameters = cachedData as AdjustmentParameters;
        }
      } else {
        const dbProfile = await prisma.correctionProfile.findUnique({
          where: { id: profileId }
        });

        if (!dbProfile) {
          return res.status(404).json({
            success: false,
            error: { code: 'PROFILE_NOT_FOUND', message: 'Correction profile not found' }
          });
        }

        batchParameters         = dbProfile.parameters as unknown as AdjustmentParameters;
        batchReferenceThumbnails = dbProfile.referenceThumbnails || [];

        if (dbProfile.styleDescription && dbProfile.styleCharacteristics) {
          batchStyleProfile = {
            description:     dbProfile.styleDescription,
            characteristics: dbProfile.styleCharacteristics as any,
            generatedAt:     dbProfile.updatedAt.toISOString()
          };
        }

        await cacheService.set(
          `profile:${userId}:${profileId}`,
          { parameters: batchParameters, styleProfile: batchStyleProfile, referenceThumbnails: batchReferenceThumbnails },
          3600
        );
      }

      const batchCorrectionMode: CorrectionMode = batchStyleProfile ? 'adaptive_ai' : 'lut';

      let batchTransferProfile = null;
      let batchSegmentedProfile = null;
      if (batchCorrectionMode === 'adaptive_ai') {
        const batchParams = batchParameters as any;
        if (batchParams.segmentedTransfer) {
          try {
            batchSegmentedProfile = histogramMatchingService.deserializeSegmentedProfile(batchParams.segmentedTransfer);
          } catch {
            // 복원 실패 시 무시
          }
        }
        if (!batchSegmentedProfile && batchParams.histogramTransfer) {
          try {
            batchTransferProfile = histogramMatchingService.deserializeProfile(batchParams.histogramTransfer);
          } catch {
            // 복원 실패 시 무시
          }
        }
      }

      // 모든 이미지 병렬 보정
      const results = await Promise.all(
        files.images.map(async (imageFile, index) => {
          const correctionPromise = batchCorrectionMode === 'adaptive_ai' && batchStyleProfile
            ? adaptiveCorrectionService.applyAdaptiveStyle(
                imageFile.buffer,
                batchStyleProfile,
                batchTransferProfile,
                batchReferenceThumbnails,
                batchSegmentedProfile
              )
            : advancedImageService.applyAdaptiveCorrection(imageFile.buffer, batchParameters);

          const [correctedImage, originalUrl] = await Promise.all([
            correctionPromise,
            storageService.upload(imageFile.buffer, {
              folder: 'tonecopy/corrections/originals',
              expiresIn: 86400
            })
          ]);

          const correctedUrl = await storageService.upload(correctedImage, {
            folder: 'tonecopy/corrections',
            expiresIn: 86400
          });

          const history = await prisma.correctionHistory.create({
            data: {
              profileId,
              originalImageUrl: originalUrl,
              correctedImageUrl: correctedUrl,
              processingTimeMs: Date.now() - startTime
            }
          });

          return {
            index,
            correction_id: history.id,
            original_image_url: originalUrl,
            corrected_image_url: correctedUrl,
            download_url: correctedUrl
          };
        })
      );

      const processingTime = Date.now() - startTime;
      const expiresAt = new Date(Date.now() + 86400000).toISOString();

      logger.info('Batch correction applied', {
        profileId,
        imageCount: files.images.length,
        processingTime
      });

      return res.status(200).json({
        success: true,
        data: {
          results,
          total: results.length,
          processing_time_ms: processingTime,
          expires_at: expiresAt
        },
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      logger.error('Batch correction failed', {
        error: error.message,
        stack: error.stack
      });
      next(error);
    }
  }
}

export const correctionController = new CorrectionController();
