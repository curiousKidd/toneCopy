import { Request, Response, NextFunction } from 'express';
import { aiService } from '../services/aiService';
import { imageService } from '../services/imageService';
import { storageService } from '../services/storageService';
import { cacheService } from '../services/cacheService';
import { prisma } from '../models';
import { logger } from '../utils/logger';

export class TrainingController {
  /**
   * POST /api/v1/training/analyze
   * 원본 및 보정 이미지 분석
   */
  async analyze(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();

    try {
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

      const originalFiles = files.original_images;
      const adjustedFiles = files.adjusted_images;
      const profileName = req.body.profile_name?.trim();

      // 이미지 쌍 개수 확인
      if (originalFiles.length !== adjustedFiles.length) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISMATCHED_FILES',
            message: 'Number of original and adjusted images must match'
          }
        });
      }

      if (originalFiles.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NO_FILES',
            message: 'At least one image pair is required'
          }
        });
      }

      if (!profileName || profileName.length > 50) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PROFILE_NAME',
            message: 'Profile name must be 1-50 characters'
          }
        });
      }

      const userId = req.ip || 'anonymous';

      // 모든 이미지 쌍 처리
      const processedPairs = await Promise.all(
        originalFiles.map(async (originalFile, index) => {
          const adjustedFile = adjustedFiles[index];

          // 이미지 최적화
          const [originalOptimized, adjustedOptimized] = await Promise.all([
            imageService.optimizeImage(originalFile.buffer),
            imageService.optimizeImage(adjustedFile.buffer)
          ]);

          // Cloudinary 업로드
          const [originalUrl, adjustedUrl] = await Promise.all([
            storageService.upload(originalOptimized, {
              folder: 'tonecopy/training/originals'
            }),
            storageService.upload(adjustedOptimized, {
              folder: 'tonecopy/training/adjusted'
            })
          ]);

          // Base64 인코딩
          const [originalBase64, adjustedBase64] = await Promise.all([
            imageService.toBase64(originalOptimized),
            imageService.toBase64(adjustedOptimized)
          ]);

          return {
            originalUrl,
            adjustedUrl,
            originalBase64,
            adjustedBase64
          };
        })
      );

      // AI 분석 - 모든 이미지 쌍을 분석하여 평균 파라미터 계산
      const allParameters = await Promise.all(
        processedPairs.map(pair =>
          aiService.analyzeImageAdjustments(pair.originalBase64, pair.adjustedBase64)
        )
      );

      // 여러 분석 결과를 집계하여 최종 파라미터 도출
      const parameters = aiService.aggregateParameters(allParameters);
      const confidenceScore = aiService.calculateConfidenceScore(parameters);

      // 사용자 생성 또는 조회 (upsert)
      await prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: { id: userId }
      });

      // 데이터베이스 저장
      const profile = await prisma.correctionProfile.create({
        data: {
          userId,
          profileName,
          parameters: parameters as any,
          originalImageUrls: processedPairs.map(p => p.originalUrl),
          adjustedImageUrls: processedPairs.map(p => p.adjustedUrl)
        }
      });

      // Redis 캐싱
      await cacheService.set(
        `profile:${userId}:${profile.id}`,
        parameters,
        3600
      );

      const processingTime = Date.now() - startTime;

      logger.info('Training analysis completed', {
        profileId: profile.id,
        userId,
        processingTime
      });

      return res.status(200).json({
        success: true,
        data: {
          profile_id: profile.id,
          profile_name: profileName,
          detected_adjustments: parameters,
          confidence_score: confidenceScore,
          analysis_time_ms: processingTime,
          preview_url: processedPairs[0].adjustedUrl,
          image_pairs_count: processedPairs.length
        },
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      logger.error('Training analysis failed', {
        error: error.message,
        stack: error.stack
      });
      next(error);
    }
  }
}

export const trainingController = new TrainingController();
