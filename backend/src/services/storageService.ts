import { v2 as cloudinary } from 'cloudinary';
import { logger } from '../utils/logger';
import type { UploadOptions } from '../types';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export class StorageService {
  /**
   * 이미지를 Cloudinary에 업로드
   */
  async upload(buffer: Buffer, options: UploadOptions): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: options.folder,
          resource_type: 'image',
          quality: 100,
          transformation: []
        },
        (error, result) => {
          if (error) {
            logger.error('Cloudinary upload failed', { error: error.message });
            reject(new Error('Failed to upload image to storage'));
            return;
          }

          if (!result) {
            reject(new Error('No result from Cloudinary'));
            return;
          }

          logger.info('Image uploaded to Cloudinary', {
            publicId: result.public_id,
            url: result.secure_url
          });

          resolve(result.secure_url);
        }
      );

      uploadStream.end(buffer);
    });
  }

  /**
   * 이미지 삭제
   */
  async delete(publicId: string): Promise<void> {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      logger.info('Image deleted from Cloudinary', { publicId, result });
    } catch (error: any) {
      logger.error('Cloudinary delete failed', { error: error.message, publicId });
      throw new Error('Failed to delete image from storage');
    }
  }

  /**
   * URL에서 public_id 추출
   */
  extractPublicId(url: string): string {
    const matches = url.match(/\/v\d+\/(.+)\./);
    return matches ? matches[1] : '';
  }
}

export const storageService = new StorageService();
