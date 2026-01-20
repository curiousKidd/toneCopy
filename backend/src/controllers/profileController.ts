import { Request, Response, NextFunction } from 'express';
import { prisma } from '../models';
import { cacheService } from '../services/cacheService';
import { logger } from '../utils/logger';

export class ProfileController {
  /**
   * GET /api/v1/profiles
   * 프로필 목록 조회
   */
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.ip || 'anonymous';
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
      const userId = req.ip || 'anonymous';

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
      const userId = req.ip || 'anonymous';

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
      const userId = req.ip || 'anonymous';
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
}

export const profileController = new ProfileController();
