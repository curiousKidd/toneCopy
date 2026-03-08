import { Request, Response, NextFunction } from 'express';
import { aiService } from '../services/aiService';
import { imageService } from '../services/imageService';
import { storageService } from '../services/storageService';
import { cacheService } from '../services/cacheService';
import { accuracyService } from '../services/accuracyService';
import { prisma } from '../models';
import { logger } from '../utils/logger';
import { extractUserId } from '../types';
import type { AdjustmentParameters } from '../types';
import { lutService } from '../services/lutService';

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

      const userId = extractUserId(req);

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
            adjustedBase64,
            // LUT 생성용으로 최적화된 원본 버퍼 보관
            originalOptimized,
            adjustedOptimized
          };
        })
      );

      // 파이프라인 모드 여부 결정 (기본값: true - 단계별 분석)
      const usePipeline = req.body.use_pipeline !== 'false';

      // AI 분석 + LUT 생성 병렬 실행
      // LUT: 픽셀 직접 매핑 → AI 파라미터보다 훨씬 정확한 색상 재현
      const [allParameters, allLUTs] = await Promise.all([
        // AI 파라미터 분석 (UI 표시용 및 vignette/grain 등 공간 효과용)
        Promise.all(
          processedPairs.map(pair =>
            usePipeline
              ? aiService.analyzeImageAdjustmentsPipelined(pair.originalBase64, pair.adjustedBase64)
              : aiService.analyzeImageAdjustments(pair.originalBase64, pair.adjustedBase64)
          )
        ),
        // LUT 생성 (실제 보정 적용용)
        Promise.all(
          processedPairs.map(pair =>
            lutService.buildFromPair(pair.originalOptimized, pair.adjustedOptimized)
          )
        )
      ]);

      logger.info('AI analysis mode', { usePipeline, pairCount: processedPairs.length });

      // 여러 분석 결과를 집계하여 최종 파라미터 도출
      const parameters = aiService.aggregateParameters(allParameters);
      const confidenceScore = aiService.calculateConfidenceScore(parameters);

      // LUT 합성: 여러 쌍의 평균 LUT → 색상 공간 커버리지 향상
      const colorLUT = lutService.mergeLUTs(allLUTs);

      // 최종 저장 데이터: AI 파라미터 + LUT 통합
      // colorLUT이 있으면 보정 시 파라미터 대신 LUT 사용 (훨씬 정확)
      const parametersWithLUT = {
        ...parameters,
        colorLUT
      };

      logger.info('LUT generation complete', {
        lutSize: colorLUT.length,
        pairCount: allLUTs.length
      });

      // 사용자 생성 또는 조회 (upsert)
      await prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: { id: userId }
      });

      // 데이터베이스 저장 (AI 파라미터 + LUT 포함)
      const profile = await prisma.correctionProfile.create({
        data: {
          userId,
          profileName,
          parameters: parametersWithLUT as any,
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
          image_pairs_count: processedPairs.length,
          analysis_mode: usePipeline ? 'pipeline' : 'single'
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

  /**
   * POST /api/v1/training/accuracy
   * 프로필 정확도 측정 (원본 + 타겟 보정본으로 LUT 성능 평가)
   */
  async measureAccuracy(req: Request, res: Response, next: NextFunction) {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      if (!files?.original_image?.[0] || !files?.adjusted_image?.[0]) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_FILES',
            message: 'Both original_image and adjusted_image are required'
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

      const userId = extractUserId(req);

      // 프로필 파라미터 (LUT 포함) 조회
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
      }

      const originalBuffer = files.original_image[0].buffer;
      const adjustedBuffer = files.adjusted_image[0].buffer;

      const report = await accuracyService.measureAccuracy(
        originalBuffer,
        adjustedBuffer,
        parameters
      );

      logger.info('Accuracy report generated', { profileId, grade: report.quality_grade });

      return res.status(200).json({
        success: true,
        data: {
          profile_id: profileId,
          accuracy_report: report,
          interpretation: {
            mae: `${report.mae}/255 평균 픽셀 오차 (낮을수록 좋음)`,
            psnr: `${report.psnr}dB (30dB 이상이면 좋음)`,
            delta_e: `${report.mean_delta_e} (2 이하면 인간이 구분 불가)`,
            improvement: `원본 대비 ${report.improvement_percent}% 개선`,
            grade: `품질 등급: ${report.quality_grade} (A~F)`
          }
        },
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      logger.error('Accuracy measurement failed', { error: error.message });
      next(error);
    }
  }
}

export const trainingController = new TrainingController();
