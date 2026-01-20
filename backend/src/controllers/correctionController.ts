import { Request, Response, NextFunction } from 'express';
import { imageService } from '../services/imageService';
import { advancedImageService } from '../services/advancedImageService';
import { storageService } from '../services/storageService';
import { cacheService } from '../services/cacheService';
import { prisma } from '../models';
import { logger } from '../utils/logger';
import type { AdjustmentParameters } from '../types';

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

      const userId = req.ip || 'anonymous';

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

      // 고급 보정 적용 (적응형 알고리즘 사용)
      const correctedImage = await advancedImageService.applyAdaptiveCorrection(
        imageFile.buffer,
        parameters
      );

      // Cloudinary 업로드
      const correctedUrl = await storageService.upload(correctedImage, {
        folder: 'tonecopy/corrections',
        expiresIn: 86400 // 24시간
      });

      const processingTime = Date.now() - startTime;

      // 히스토리 저장
      await prisma.correctionHistory.create({
        data: {
          profileId,
          originalImageUrl: 'temp', // 임시
          correctedImageUrl: correctedUrl,
          processingTimeMs: processingTime
        }
      });

      logger.info('Correction applied', {
        profileId,
        processingTime
      });

      const expiresAt = new Date(Date.now() + 86400000); // 24시간 후

      return res.status(200).json({
        success: true,
        data: {
          correction_id: Date.now().toString(),
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
}

export const correctionController = new CorrectionController();
