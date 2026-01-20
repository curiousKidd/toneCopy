import api from './api';
import type { ApiResponse, CorrectionResult } from '../types/api';

export interface ApplyCorrectionParams {
  image: File;
  profileId: string;
}

export const applyCorrection = async (params: ApplyCorrectionParams): Promise<CorrectionResult> => {
  const formData = new FormData();
  formData.append('image', params.image);
  formData.append('profile_id', params.profileId);

  const response = await api.post<ApiResponse<CorrectionResult>>(
    '/correction/apply',
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );

  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error?.message || 'Correction failed');
  }

  return response.data.data;
};
