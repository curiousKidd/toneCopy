export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}

export interface AdjustmentParameters {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  sharpness: number;
  temperature: number;
  tint: number;
  filters: string[];
}

export interface AnalysisResult {
  profile_id: string;
  profile_name: string;
  detected_adjustments: AdjustmentParameters;
  confidence_score: number;
  analysis_time_ms: number;
  preview_url: string;
}

export interface CorrectionResult {
  correction_id: string;
  corrected_image_url: string;
  applied_adjustments: AdjustmentParameters;
  processing_time_ms: number;
  download_url: string;
  expires_at: string;
}

export interface Profile {
  id: string;
  profile_name: string;
  created_at: string;
  usage_count: number;
  preview_image_url: string;
}

export interface ProfileDetail extends Profile {
  parameters: AdjustmentParameters;
  original_image_url: string;
  adjusted_image_url: string;
  updated_at: string;
}

export interface PaginatedResponse<T> {
  profiles: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}
