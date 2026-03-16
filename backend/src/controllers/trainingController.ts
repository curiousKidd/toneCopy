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
import { styleProfileService } from '../services/styleProfileService';
import { histogramMatchingService } from '../services/histogramMatchingService';

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

      // ─── 병렬 처리: 기존 AI 파라미터 분석 + LUT + 신규 스타일 프로필 ───
      const [allParameters, allLUTs, styleProfile, transferProfile, segmentedProfile] = await Promise.all([
        // 기존: AI 파라미터 분석 (spatial effects용)
        Promise.all(
          processedPairs.map(pair =>
            usePipeline
              ? aiService.analyzeImageAdjustmentsPipelined(pair.originalBase64, pair.adjustedBase64)
              : aiService.analyzeImageAdjustments(pair.originalBase64, pair.adjustedBase64)
          )
        ),
        // 기존: LUT 생성 (호환성 유지)
        Promise.all(
          processedPairs.map(pair =>
            lutService.buildFromPair(pair.originalOptimized, pair.adjustedOptimized)
          )
        ),
        // 신규: 스타일 프로필 생성 (여러 쌍 종합 분석)
        styleProfileService.generateProfile(
          processedPairs.map(p => p.originalBase64),
          processedPairs.map(p => p.adjustedBase64)
        ),
        // 신규: 글로벌 히스토그램 전송 프로필 생성 (폴백용)
        histogramMatchingService.buildTransferProfile(
          processedPairs.map(p => p.originalOptimized),
          processedPairs.map(p => p.adjustedOptimized)
        ),
        // 신규: HSL 세그먼트별 전송 프로필 생성 (핵심 개선)
        histogramMatchingService.buildSegmentedTransferProfile(
          processedPairs.map(p => p.originalOptimized),
          processedPairs.map(p => p.adjustedOptimized)
        )
      ]);

      logger.info('AI 분석 완료', {
        usePipeline,
        pairCount: processedPairs.length,
        styleMode: styleProfile.characteristics.overallMood,
        segmentedProfilePairs: segmentedProfile.trainedPairs
      });

      // 기존 파라미터 집계
      const parameters = aiService.aggregateParameters(allParameters);
      const confidenceScore = aiService.calculateConfidenceScore(parameters);
      const colorLUT = lutService.mergeLUTs(allLUTs);

      // 참조 썸네일 생성 (few-shot용, 원본/보정본 쌍으로 저장)
      // 최대 2쌍 = 4장의 썸네일 (토큰 절약)
      const thumbnailPairLimit = Math.min(processedPairs.length, 2);
      const referenceThumbnails: string[] = [];
      for (let i = 0; i < thumbnailPairLimit; i++) {
        const [origThumb, adjThumb] = await Promise.all([
          styleProfileService.generateThumbnail(processedPairs[i].originalOptimized),
          styleProfileService.generateThumbnail(processedPairs[i].adjustedOptimized)
        ]);
        referenceThumbnails.push(origThumb, adjThumb);
      }

      // 최종 저장 파라미터 (기존 + 히스토그램 전송 프로필 + HSL 세그먼트 프로필)
      const parametersWithLUT = {
        ...parameters,
        colorLUT,
        histogramTransfer:   histogramMatchingService.serializeProfile(transferProfile),
        segmentedTransfer:   histogramMatchingService.serializeSegmentedProfile(segmentedProfile)
      };

      // 사용자 upsert
      await prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: { id: userId }
      });

      // DB 저장 (기존 필드 + 신규 스타일 프로필 필드)
      const profile = await prisma.correctionProfile.create({
        data: {
          userId,
          profileName,
          parameters:           parametersWithLUT as any,
          originalImageUrls:    processedPairs.map(p => p.originalUrl),
          adjustedImageUrls:    processedPairs.map(p => p.adjustedUrl),
          // 신규 스타일 프로필 필드
          styleDescription:     styleProfile.description,
          styleCharacteristics: styleProfile.characteristics as any,
          referenceThumbnails
        }
      });

      // Redis 캐싱 (스타일 프로필 포함)
      await cacheService.set(
        `profile:${userId}:${profile.id}`,
        { parameters: parametersWithLUT, styleProfile, referenceThumbnails },
        3600
      );

      const processingTime = Date.now() - startTime;

      logger.info('학습 분석 완료', {
        profileId: profile.id,
        userId,
        processingTime,
        styleDescription: styleProfile.description.slice(0, 60)
      });

      return res.status(200).json({
        success: true,
        data: {
          profile_id: profile.id,
          profile_name: profileName,
          detected_adjustments: parameters,
          confidence_score: confidenceScore,
          // 신규: 스타일 프로필 정보 반환
          style_profile: {
            description:     styleProfile.description,
            characteristics: styleProfile.characteristics
          },
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
