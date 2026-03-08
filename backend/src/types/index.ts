import { Request } from 'express';

/** AI 분석 모드 */
export type AnalysisMode = 'pipeline' | 'single';

export interface AdjustmentParameters {
  // 기본 색상 조정
  brightness: number;
  contrast: number;
  saturation: number;
  vibrance?: number;
  hue: number;
  temperature: number;
  tint: number;
  exposure?: number;

  // 디테일 & 선명도
  sharpness: number;
  clarity?: number;
  dehaze?: number;
  grain?: number;

  // 톤 커브
  highlights?: number;
  shadows?: number;
  whites?: number;
  blacks?: number;

  // 인물/피부 보정
  skinSmoothing?: number;
  blemishRemoval?: boolean;
  eyeBrightening?: number;
  teethWhitening?: number;
  faceSlimming?: number;
  bodyRetouching?: boolean;
  makeupEnhancement?: boolean;

  // 풍경/자연 보정
  skyEnhancement?: number;        // 하늘 강조 (0.0-1.0) - DEPRECATED
  foliageEnhancement?: number;    // 초목/나뭇잎 강조 (0.0-1.0) - DEPRECATED
  waterEnhancement?: number;      // 물 강조 (0.0-1.0) - DEPRECATED
  landscapeClarity?: number;      // 풍경 선명도 (0.0-2.0)
  naturalSaturation?: number;     // 자연스러운 채도 부스트 (0.0-1.0) - DEPRECATED
  dynamicRange?: number;          // 다이나믹 레인지 확장 (0.0-1.0) - DEPRECATED
  atmosphericPerspective?: number; // 원근감 강조 (0.0-1.0) - DEPRECATED

  // 선택적 색상 강화 (ImageMagick 기반)
  selectiveColorIntensity?: number; // 선택적 색상 강화 강도 (0.0-2.0)

  // 효과 & 필터
  vignette?: number;
  denoise?: number;
  colorGrading?: string;
  filters: string[];

  /**
   * 3D Color LUT 데이터 (17×17×17 × 3 = 14,739 개 float)
   * 학습 이미지에서 직접 추출한 픽셀 매핑 → AI 파라미터보다 훨씬 정확
   * 존재할 경우 AI 파라미터 대신 LUT로 색상 보정 적용
   */
  colorLUT?: number[];
}

export interface CustomRequest extends Request {
  session?: {
    userId?: string;
  };
}

/**
 * 요청에서 사용자 ID 추출
 * X-User-ID 헤더(프론트엔드 UUID)를 우선 사용, 없으면 IP 주소 fallback
 */
export function extractUserId(req: Request): string {
  const headerUserId = req.headers['x-user-id'];
  if (
    headerUserId &&
    typeof headerUserId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(headerUserId)
  ) {
    return headerUserId;
  }
  return req.ip || 'anonymous';
}

export interface UploadOptions {
  folder: string;
  expiresIn?: number;
}

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

// ImageMagick 선택적 색상 보정 파라미터
export interface ColorChannelAdjustment {
  cyan?: number;      // -100 ~ 100
  magenta?: number;   // -100 ~ 100
  yellow?: number;    // -100 ~ 100
  black?: number;     // -100 ~ 100 (밝기)
}

export interface SelectiveColorParameters {
  reds?: ColorChannelAdjustment;      // 빨간색 계열
  yellows?: ColorChannelAdjustment;   // 노란색 계열
  greens?: ColorChannelAdjustment;    // 초록색 계열
  cyans?: ColorChannelAdjustment;     // 청록색 계열
  blues?: ColorChannelAdjustment;     // 파란색 계열
  magentas?: ColorChannelAdjustment;  // 자홍색 계열
  whites?: ColorChannelAdjustment;    // 흰색 계열
  neutrals?: ColorChannelAdjustment;  // 중간톤
  blacks?: ColorChannelAdjustment;    // 검은색 계열
}
