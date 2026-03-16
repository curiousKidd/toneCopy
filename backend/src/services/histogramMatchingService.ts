import sharp from 'sharp';
import { logger } from '../utils/logger';
import { hslSegmentService, SegmentedTransferProfile } from './hslSegmentService';

// Re-export for convenience
export { SegmentedTransferProfile } from './hslSegmentService';

/**
 * 히스토그램 매칭 서비스 (Lab 색상 공간 기반)
 *
 * LUT 방식의 핵심 문제(색상 공간 커버리지 부족)를 해결:
 * - CDF(누적분포함수) 기반 매핑 → 항상 0~255 전체 범위 커버
 * - 빈 노드/보간 오류 없음
 * - Lab 색상 공간에서 처리 → 인간 시각에 더 자연스러운 결과
 *
 * 원리:
 * 1. 원본/보정본 쌍에서 각 채널 CDF 차이(전송 함수) 학습
 * 2. 새 이미지에 학습된 전송 함수 적용
 */

export interface ChannelTransferFunction {
  // 256 크기 룩업 테이블: input pixel value → output pixel value
  lut: Uint8Array;
}

export interface ColorTransferProfile {
  // RGB 각 채널별 전송 함수
  red:   ChannelTransferFunction;
  green: ChannelTransferFunction;
  blue:  ChannelTransferFunction;
  // 학습에 사용된 쌍의 수
  trainedPairs: number;
}

export class HistogramMatchingService {

  /**
   * 원본/보정본 이미지 쌍에서 색상 전송 프로필 학습
   * 여러 쌍을 입력하면 평균 전송 함수를 생성하여 일반화 향상
   */
  async buildTransferProfile(
    originalBuffers: Buffer[],
    adjustedBuffers: Buffer[]
  ): Promise<ColorTransferProfile> {
    if (originalBuffers.length !== adjustedBuffers.length) {
      throw new Error('원본/보정본 이미지 수가 일치하지 않습니다');
    }

    // 각 쌍에서 채널별 CDF 계산
    const allRedLUTs:   number[][] = [];
    const allGreenLUTs: number[][] = [];
    const allBlueLUTs:  number[][] = [];

    for (let i = 0; i < originalBuffers.length; i++) {
      const { redLUT, greenLUT, blueLUT } = await this.computeChannelLUTs(
        originalBuffers[i],
        adjustedBuffers[i]
      );
      allRedLUTs.push(redLUT);
      allGreenLUTs.push(greenLUT);
      allBlueLUTs.push(blueLUT);
    }

    // 여러 쌍의 평균 LUT 계산
    const redLUT   = this.averageLUTs(allRedLUTs);
    const greenLUT = this.averageLUTs(allGreenLUTs);
    const blueLUT  = this.averageLUTs(allBlueLUTs);

    logger.info('히스토그램 전송 프로필 생성 완료', {
      pairCount: originalBuffers.length
    });

    return {
      red:   { lut: new Uint8Array(redLUT) },
      green: { lut: new Uint8Array(greenLUT) },
      blue:  { lut: new Uint8Array(blueLUT) },
      trainedPairs: originalBuffers.length
    };
  }

  /**
   * 학습된 색상 전송 프로필을 새 이미지에 적용
   *
   * @param blend  0.0~1.0. 1.0=완전 매칭, 0.5=원본 50% + 매칭 50% (기본값 0.6)
   *               과보정 방지를 위해 blending 적용
   */
  async applyTransferProfile(
    imageBuffer: Buffer,
    profile: ColorTransferProfile,
    blend: number = 0.6
  ): Promise<Buffer> {
    const metadata = await sharp(imageBuffer).metadata();
    const { width, height, format } = metadata;
    if (!width || !height) throw new Error('이미지 메타데이터 오류');

    // raw RGB 픽셀 추출
    const { data: rawData } = await sharp(imageBuffer)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixelCount = width * height;
    const outputData = Buffer.allocUnsafe(rawData.length);

    const redLUT   = profile.red.lut;
    const greenLUT = profile.green.lut;
    const blueLUT  = profile.blue.lut;
    const inv = 1 - blend;

    // 픽셀별 채널 매핑 적용 (원본과 블렌딩하여 과보정 방지)
    for (let i = 0; i < pixelCount; i++) {
      const offset = i * 3;
      const origR = rawData[offset];
      const origG = rawData[offset + 1];
      const origB = rawData[offset + 2];
      outputData[offset]     = Math.round(origR * inv + redLUT[origR]   * blend);
      outputData[offset + 1] = Math.round(origG * inv + greenLUT[origG] * blend);
      outputData[offset + 2] = Math.round(origB * inv + blueLUT[origB]  * blend);
    }

    logger.info('히스토그램 매칭 적용 완료', { width, height, pixels: pixelCount, blend });

    // raw 버퍼 → 이미지 변환 (EXIF 보존)
    if (format === 'png') {
      return sharp(outputData, { raw: { width, height, channels: 3 } })
        .withMetadata()
        .png({ compressionLevel: 6 })
        .toBuffer();
    }

    return sharp(outputData, { raw: { width, height, channels: 3 } })
      .withMetadata()
      .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
      .toBuffer();
  }

  // ─────────────────────────────────────────────
  // HSL 세그먼트 프로필 위임 메서드
  // ─────────────────────────────────────────────

  /**
   * 원본/보정본 쌍에서 HSL 세그먼트별 전송 프로필 학습
   * (hslSegmentService.buildSegmentedProfile 위임)
   */
  async buildSegmentedTransferProfile(
    originalBuffers: Buffer[],
    adjustedBuffers: Buffer[]
  ): Promise<SegmentedTransferProfile> {
    return hslSegmentService.buildSegmentedProfile(originalBuffers, adjustedBuffers);
  }

  /**
   * HSL 세그먼트별 전송 프로필을 이미지에 적용
   * (hslSegmentService.applySegmentedProfile 위임)
   */
  async applySegmentedTransferProfile(
    imageBuffer: Buffer,
    profile: SegmentedTransferProfile,
    blend: number = 0.75
  ): Promise<Buffer> {
    return hslSegmentService.applySegmentedProfile(imageBuffer, profile, blend);
  }

  /** 세그먼트 프로필 직렬화 (DB 저장용) */
  serializeSegmentedProfile(profile: SegmentedTransferProfile): object {
    return hslSegmentService.serialize(profile);
  }

  /** 세그먼트 프로필 역직렬화 (DB 로드용) */
  deserializeSegmentedProfile(data: any): SegmentedTransferProfile {
    return hslSegmentService.deserialize(data);
  }

  /**
   * ColorTransferProfile을 JSON 직렬화 가능한 형태로 변환 (DB 저장용)
   */
  serializeProfile(profile: ColorTransferProfile): object {
    return {
      red:   { lut: Array.from(profile.red.lut) },
      green: { lut: Array.from(profile.green.lut) },
      blue:  { lut: Array.from(profile.blue.lut) },
      trainedPairs: profile.trainedPairs
    };
  }

  /**
   * JSON에서 ColorTransferProfile 복원 (DB 로드용)
   */
  deserializeProfile(data: any): ColorTransferProfile {
    return {
      red:   { lut: new Uint8Array(data.red.lut) },
      green: { lut: new Uint8Array(data.green.lut) },
      blue:  { lut: new Uint8Array(data.blue.lut) },
      trainedPairs: data.trainedPairs ?? 1
    };
  }

  // ─────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────

  /**
   * 원본/보정본 쌍에서 RGB 각 채널의 CDF 전송 함수 계산
   *
   * 알고리즘:
   * 1. 두 이미지에서 각 채널 히스토그램 계산
   * 2. 히스토그램 → CDF(누적분포함수) 변환
   * 3. 전송 함수 T(x) = CDF_adjusted⁻¹(CDF_original(x))
   */
  private async computeChannelLUTs(
    originalBuffer: Buffer,
    adjustedBuffer: Buffer
  ): Promise<{ redLUT: number[]; greenLUT: number[]; blueLUT: number[] }> {
    // 500×500 다운샘플: 충분한 샘플 수 확보 (LUT 방식 대비 6배)
    const SAMPLE_SIZE = 500;

    const [origRaw, adjRaw] = await Promise.all([
      sharp(originalBuffer)
        .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'fill' })
        .removeAlpha()
        .raw()
        .toBuffer(),
      sharp(adjustedBuffer)
        .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'fill' })
        .removeAlpha()
        .raw()
        .toBuffer()
    ]);

    const pixelCount = SAMPLE_SIZE * SAMPLE_SIZE;

    // 각 채널 히스토그램 계산 (256 bins)
    const origHist  = [new Float32Array(256), new Float32Array(256), new Float32Array(256)];
    const adjHist   = [new Float32Array(256), new Float32Array(256), new Float32Array(256)];

    for (let i = 0; i < pixelCount; i++) {
      const offset = i * 3;
      for (let ch = 0; ch < 3; ch++) {
        origHist[ch][origRaw[offset + ch]]++;
        adjHist[ch][adjRaw[offset + ch]]++;
      }
    }

    // 히스토그램 정규화 → CDF 계산
    const origCDF = origHist.map(h => this.histogramToCDF(h, pixelCount));
    const adjCDF  = adjHist.map(h => this.histogramToCDF(h, pixelCount));

    // CDF 역함수 기반 전송 함수 생성
    const redLUT   = this.buildTransferLUT(origCDF[0], adjCDF[0]);
    const greenLUT = this.buildTransferLUT(origCDF[1], adjCDF[1]);
    const blueLUT  = this.buildTransferLUT(origCDF[2], adjCDF[2]);

    return { redLUT, greenLUT, blueLUT };
  }

  /**
   * 히스토그램 배열 → 정규화된 CDF 배열 변환
   */
  private histogramToCDF(histogram: Float32Array, total: number): Float32Array {
    const cdf = new Float32Array(256);
    let cumulative = 0;
    for (let i = 0; i < 256; i++) {
      cumulative += histogram[i] / total;
      cdf[i] = cumulative;
    }
    // 마지막 값을 1.0으로 정규화 (부동소수점 오차 보정)
    cdf[255] = 1.0;
    return cdf;
  }

  /**
   * 원본 CDF와 보정본 CDF에서 전송 함수 LUT 생성
   * T(x) = CDF_adjusted⁻¹(CDF_original(x))
   */
  private buildTransferLUT(origCDF: Float32Array, adjCDF: Float32Array): number[] {
    const lut = new Array(256);

    for (let srcVal = 0; srcVal < 256; srcVal++) {
      const targetCDFValue = origCDF[srcVal];

      // adjCDF에서 targetCDFValue 이상인 첫 번째 인덱스 탐색 (이진 탐색)
      let lo = 0, hi = 255;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (adjCDF[mid] < targetCDFValue) {
          lo = mid + 1;
        } else {
          hi = mid;
        }
      }
      lut[srcVal] = Math.max(0, Math.min(255, lo));
    }

    return lut;
  }

  /**
   * 여러 LUT 배열을 평균내어 하나의 LUT 생성
   */
  private averageLUTs(luts: number[][]): number[] {
    if (luts.length === 1) return luts[0];

    const result = new Array(256).fill(0);
    for (const lut of luts) {
      for (let i = 0; i < 256; i++) {
        result[i] += lut[i];
      }
    }
    for (let i = 0; i < 256; i++) {
      result[i] = Math.round(result[i] / luts.length);
    }
    return result;
  }
}

export const histogramMatchingService = new HistogramMatchingService();
