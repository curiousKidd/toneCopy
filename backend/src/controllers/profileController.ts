import { Request, Response, NextFunction } from 'express';
import { prisma } from '../models';
import { cacheService } from '../services/cacheService';
import { imageService } from '../services/imageService';
import { storageService } from '../services/storageService';
import { aiService } from '../services/aiService';
import { lutService } from '../services/lutService';
import { logger } from '../utils/logger';
import { extractUserId } from '../types';
import type { AdjustmentParameters } from '../types';

export class ProfileController {
  /**
   * GET /api/v1/profiles
   * 프로필 목록 조회
   */
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = extractUserId(req);
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
      const skip = (page - 1) * limit;

      const [profiles, total] = await Promise.all([
        prisma.correctionProfile.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          select: {
            id: true,
            profileName: true,
            createdAt: true,
            adjustedImageUrls: true,
            _count: {
              select: { history: true }
            }
          }
        }),
        prisma.correctionProfile.count({ where: { userId } })
      ]);

      return res.status(200).json({
        success: true,
        data: {
          profiles: profiles.map(p => ({
            id: p.id,
            profile_name: p.profileName,
            created_at: p.createdAt.toISOString(),
            usage_count: p._count.history,
            preview_image_url: p.adjustedImageUrls[0] || ''
          })),
          pagination: {
            total,
            page,
            limit,
            total_pages: Math.ceil(total / limit)
          }
        },
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      logger.error('Profile list failed', {
        error: error.message
      });
      next(error);
    }
  }

  /**
   * GET /api/v1/profiles/:id
   * 프로필 상세 조회
   */
  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const userId = extractUserId(req);

      const profile = await prisma.correctionProfile.findFirst({
        where: { id, userId },
        include: {
          _count: {
            select: { history: true }
          }
        }
      });

      if (!profile) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'PROFILE_NOT_FOUND',
            message: 'Profile not found'
          }
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          id: profile.id,
          profile_name: profile.profileName,
          parameters: profile.parameters,
          original_image_urls: profile.originalImageUrls,
          adjusted_image_urls: profile.adjustedImageUrls,
          created_at: profile.createdAt.toISOString(),
          updated_at: profile.updatedAt.toISOString(),
          usage_count: profile._count.history
        },
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      logger.error('Profile get failed', {
        error: error.message
      });
      next(error);
    }
  }

  /**
   * DELETE /api/v1/profiles/:id
   * 프로필 삭제
   */
  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const userId = extractUserId(req);

      const profile = await prisma.correctionProfile.findFirst({
        where: { id, userId }
      });

      if (!profile) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'PROFILE_NOT_FOUND',
            message: 'Profile not found'
          }
        });
      }

      await prisma.correctionProfile.delete({
        where: { id }
      });

      // 캐시 삭제
      await cacheService.delete(`profile:${userId}:${id}`);

      logger.info('Profile deleted', { profileId: id, userId });

      return res.status(200).json({
        success: true,
        data: {
          message: 'Profile deleted successfully'
        },
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      logger.error('Profile delete failed', {
        error: error.message
      });
      next(error);
    }
  }

  /**
   * PATCH /api/v1/profiles/:id
   * 프로필 수정
   */
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const userId = extractUserId(req);
      const { profile_name } = req.body;

      if (!profile_name || profile_name.length > 50) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PROFILE_NAME',
            message: 'Profile name must be 1-50 characters'
          }
        });
      }

      const profile = await prisma.correctionProfile.findFirst({
        where: { id, userId }
      });

      if (!profile) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'PROFILE_NOT_FOUND',
            message: 'Profile not found'
          }
        });
      }

      const updated = await prisma.correctionProfile.update({
        where: { id },
        data: { profileName: profile_name }
      });

      logger.info('Profile updated', { profileId: id, userId });

      return res.status(200).json({
        success: true,
        data: {
          id: updated.id,
          profile_name: updated.profileName,
          updated_at: updated.updatedAt.toISOString()
        },
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      logger.error('Profile update failed', {
        error: error.message
      });
      next(error);
    }
  }

  /**
   * POST /api/v1/profiles/:id/retrain
   * 기존 프로필에 새 이미지 쌍 추가 학습 (LUT 병합)
   */
  async retrain(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();

    try {
      const { id } = req.params;
      const userId = extractUserId(req);
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      if (!files?.original_images || !files?.adjusted_images) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_FILES',
            message: 'Both original and adjusted images are required'
          }
        });
      }

      if (files.original_images.length !== files.adjusted_images.length) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISMATCHED_FILES',
            message: 'Number of original and adjusted images must match'
          }
        });
      }

      // 기존 프로필 조회
      const profile = await prisma.correctionProfile.findFirst({
        where: { id, userId }
      });

      if (!profile) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'PROFILE_NOT_FOUND',
            message: 'Profile not found'
          }
        });
      }

      const existingParams = profile.parameters as unknown as AdjustmentParameters;

      // 새 이미지 쌍 처리
      const processedPairs = await Promise.all(
        files.original_images.map(async (originalFile, index) => {
          const adjustedFile = files.adjusted_images[index];
          const [originalOptimized, adjustedOptimized] = await Promise.all([
            imageService.optimizeImage(originalFile.buffer),
            imageService.optimizeImage(adjustedFile.buffer)
          ]);
          const [originalUrl, adjustedUrl] = await Promise.all([
            storageService.upload(originalOptimized, { folder: 'tonecopy/training/originals' }),
            storageService.upload(adjustedOptimized, { folder: 'tonecopy/training/adjusted' })
          ]);
          const [originalBase64, adjustedBase64] = await Promise.all([
            imageService.toBase64(originalOptimized),
            imageService.toBase64(adjustedOptimized)
          ]);
          return { originalUrl, adjustedUrl, originalBase64, adjustedBase64, originalOptimized, adjustedOptimized };
        })
      );

      // 새 이미지 쌍으로 AI 분석 + LUT 생성 (병렬)
      const [newAllParameters, newAllLUTs] = await Promise.all([
        Promise.all(
          processedPairs.map(pair =>
            aiService.analyzeImageAdjustmentsPipelined(pair.originalBase64, pair.adjustedBase64)
          )
        ),
        Promise.all(
          processedPairs.map(pair =>
            lutService.buildFromPair(pair.originalOptimized, pair.adjustedOptimized)
          )
        )
      ]);

      // 새 파라미터 집계
      const newParameters = aiService.aggregateParameters(newAllParameters);

      // 기존 LUT와 새 LUT 병합 (기존 가중치 높음: 기존 데이터 보존)
      const existingLUT = existingParams.colorLUT || [];
      const newLUT = lutService.mergeLUTs(newAllLUTs);

      let mergedLUT: number[];
      if (existingLUT.length === newLUT.length) {
        // 기존 LUT에 50% 가중치, 새 LUT에 50% 가중치로 평균
        mergedLUT = lutService.mergeLUTs([existingLUT, newLUT]);
      } else {
        mergedLUT = newLUT;
      }

      // 파라미터 병합 (기존 파라미터와 새 파라미터 평균)
      const mergedParameters: AdjustmentParameters = {
        brightness:    (existingParams.brightness + newParameters.brightness) / 2,
        contrast:      (existingParams.contrast + newParameters.contrast) / 2,
        saturation:    (existingParams.saturation + newParameters.saturation) / 2,
        hue:           (existingParams.hue + newParameters.hue) / 2,
        temperature:   (existingParams.temperature + newParameters.temperature) / 2,
        tint:          (existingParams.tint + newParameters.tint) / 2,
        sharpness:     (existingParams.sharpness + newParameters.sharpness) / 2,
        filters:       existingParams.filters,
        colorLUT:      mergedLUT,
        // optional params: 새 값 우선
        exposure:           newParameters.exposure ?? existingParams.exposure,
        vibrance:           newParameters.vibrance ?? existingParams.vibrance,
        clarity:            newParameters.clarity ?? existingParams.clarity,
        dehaze:             newParameters.dehaze ?? existingParams.dehaze,
        grain:              newParameters.grain ?? existingParams.grain,
        highlights:         newParameters.highlights ?? existingParams.highlights,
        shadows:            newParameters.shadows ?? existingParams.shadows,
        whites:             newParameters.whites ?? existingParams.whites,
        blacks:             newParameters.blacks ?? existingParams.blacks,
        vignette:           newParameters.vignette ?? existingParams.vignette,
        denoise:            newParameters.denoise ?? existingParams.denoise,
        colorGrading:       newParameters.colorGrading ?? existingParams.colorGrading,
        skinSmoothing:      newParameters.skinSmoothing ?? existingParams.skinSmoothing,
        landscapeClarity:   newParameters.landscapeClarity ?? existingParams.landscapeClarity,
        selectiveColorIntensity: newParameters.selectiveColorIntensity ?? existingParams.selectiveColorIntensity,
      };

      // 프로필 업데이트
      const updated = await prisma.correctionProfile.update({
        where: { id },
        data: {
          parameters: mergedParameters as any,
          originalImageUrls: [
            ...profile.originalImageUrls,
            ...processedPairs.map(p => p.originalUrl)
          ],
          adjustedImageUrls: [
            ...profile.adjustedImageUrls,
            ...processedPairs.map(p => p.adjustedUrl)
          ]
        }
      });

      // 캐시 무효화
      await cacheService.delete(`profile:${userId}:${id}`);

      const processingTime = Date.now() - startTime;
      logger.info('Profile retrained', { profileId: id, userId, newPairs: processedPairs.length, processingTime });

      return res.status(200).json({
        success: true,
        data: {
          profile_id: id,
          profile_name: updated.profileName,
          added_pairs: processedPairs.length,
          processing_time_ms: processingTime
        },
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      logger.error('Profile retrain failed', { error: error.message });
      next(error);
    }
  }
}

export const profileController = new ProfileController();
