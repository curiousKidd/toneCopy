import api from './api';
import type { ApiResponse, AnalysisResult } from '../types/api';

export interface AnalyzeImagesParams {
  originalImages: File[];
  adjustedImages: File[];
  profileName: string;
}

export const analyzeImages = async (params: AnalyzeImagesParams): Promise<AnalysisResult> => {
  const formData = new FormData();

  // 여러 개의 원본 이미지 추가
  params.originalImages.forEach((file) => {
    formData.append(`original_images`, file);
  });

  // 여러 개의 수정본 이미지 추가
  params.adjustedImages.forEach((file) => {
    formData.append(`adjusted_images`, file);
  });

  formData.append('profile_name', params.profileName);

  const response = await api.post<ApiResponse<AnalysisResult>>(
    '/training/analyze',
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );

  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error?.message || 'Analysis failed');
  }

  return response.data.data;
};
