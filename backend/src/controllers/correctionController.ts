import { Request, Response, NextFunction } from 'express';
import { imageService } from '../services/imageService';
import { advancedImageService } from '../services/advancedImageService';
import { storageService } from '../services/storageService';
import { cacheService } from '../services/cacheService';
import { prisma } from '../models';
import { logger } from '../utils/logger';
import type { AdjustmentParameters } from '../types';
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

      // Redis 캐시에서 프로필 파라미터 조회
      let parameters = await cacheService.get<AdjustmentParameters>(
        `profile:${userId}:${profileId}`
      );

      // 캐시 미스 시 데이터베이스 조회
      if (!parameters) {
        const profile = await prisma.correctionProfile.findUnique({
          where: { id: profileId }
        });

        if (!profile) {
          return res.status(404).json({
            success: false,
            error: {
              code: 'PROFILE_NOT_FOUND',
              message: 'Correction profile not found'
            }
          });
        }

        parameters = profile.parameters as unknown as AdjustmentParameters;

        // 캐시에 저장
        await cacheService.set(
          `profile:${userId}:${profileId}`,
          parameters,
          3600
        );
      }

      // 원본 이미지 업로드 (히스토리 저장용, 보정과 병렬로 처리)
      const [correctedImage, originalUrl] = await Promise.all([
        advancedImageService.applyAdaptiveCorrection(imageFile.buffer, parameters),
        storageService.upload(imageFile.buffer, {
          folder: 'tonecopy/corrections/originals',
          expiresIn: 86400 // 24시간
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

      logger.info('Correction applied', {
        historyId: history.id,
        profileId,
        processingTime
      });

      const expiresAt = new Date(Date.now() + 86400000); // 24시간 후

      return res.status(200).json({
        success: true,
        data: {
          correction_id: history.id,
          original_image_url: originalUrl,
          corrected_image_url: correctedUrl,
          applied_adjustments: parameters,
          processing_time_ms: processingTime,
          download_url: correctedUrl,
          expires_at: expiresAt.toISOString()
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

      // 프로필 파라미터 조회 (캐시 → DB)
      let parameters = await cacheService.get<AdjustmentParameters>(
        `profile:${userId}:${profileId}`
      );

      if (!parameters) {
        const profile = await prisma.correctionProfile.findUnique({
          where: { id: profileId }
        });

        if (!profile) {
          return res.status(404).json({
            success: false,
            error: {
              code: 'PROFILE_NOT_FOUND',
              message: 'Correction profile not found'
            }
          });
        }

        parameters = profile.parameters as unknown as AdjustmentParameters;
        await cacheService.set(`profile:${userId}:${profileId}`, parameters, 3600);
      }

      // 모든 이미지 병렬 보정
      const results = await Promise.all(
        files.images.map(async (imageFile, index) => {
          const [correctedImage, originalUrl] = await Promise.all([
            advancedImageService.applyAdaptiveCorrection(imageFile.buffer, parameters!),
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
