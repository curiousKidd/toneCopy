import sharp from 'sharp';
import { logger } from '../utils/logger';

/**
 * HSL 기반 세그먼트 서비스
 *
 * 핵심 문제 해결: 전역 보정(Global) → 객체별 보정(Per-Segment)
 *
 * 6개 세그먼트:
 *   sky      - 하늘 (H≈210°, 높은 채도, 높은 밝기)
 *   water    - 바다/물 (H≈200°, 낮은 채도, 중간 밝기)
 *   foliage  - 초목/숲 (H≈110°, 초록 계열)
 *   skin     - 피부/따뜻한 색 (H≈20°, 살구/주황)
 *   purple   - 보라/자주 (H≈285°)
 *   neutral  - 돌/콘크리트/중립 (낮은 채도, 무채색 계열)
 *
 * 소프트 블렌딩:
 *   픽셀마다 6개 세그먼트의 가중치를 계산 (합=1.0)
 *   → 경계면에서 자연스럽게 혼합되어 색상 이음매 없음
 */

export const SEGMENT_NAMES = ['sky', 'water', 'foliage', 'skin', 'purple', 'neutral'] as const;
export type SegmentName = typeof SEGMENT_NAMES[number];

/** 세그먼트별 R/G/B 채널 256-bin LUT */
export interface SegmentLUT {
  red:     Uint8Array;
  green:   Uint8Array;
  blue:    Uint8Array;
  samples: number;  // 이 세그먼트에 기여한 가중 픽셀 수
}

/** 6개 세그먼트 + 글로벌 폴백으로 구성된 세그먼트 전송 프로필 */
export interface SegmentedTransferProfile {
  sky:     SegmentLUT;
  water:   SegmentLUT;
  foliage: SegmentLUT;
  skin:    SegmentLUT;
  purple:  SegmentLUT;
  neutral: SegmentLUT;
  global:  SegmentLUT;  // 샘플 부족 세그먼트의 폴백
  trainedPairs: number;
}

// 세그먼트당 최소 가중 샘플 수 (미만이면 글로벌 폴백 사용)
const MIN_SEGMENT_SAMPLES = 300;

export class HslSegmentService {

  /**
   * 원본/보정본 쌍으로부터 세그먼트별 전송 프로필 학습
   */
  async buildSegmentedProfile(
    originalBuffers: Buffer[],
    adjustedBuffers: Buffer[]
  ): Promise<SegmentedTransferProfile> {
    const SAMPLE_SIZE = 500;

    // 각 쌍의 샘플 데이터 누적
    // 세그먼트별 가중 히스토그램 (3채널 × 256 bins)
    const origSegHist = this.initSegmentHistograms();
    const adjSegHist  = this.initSegmentHistograms();
    const segWeight   = this.initSegmentWeights();

    // 글로벌 히스토그램 (폴백용)
    const origGlobalHist: [Float64Array, Float64Array, Float64Array] = [new Float64Array(256), new Float64Array(256), new Float64Array(256)];
    const adjGlobalHist:  [Float64Array, Float64Array, Float64Array] = [new Float64Array(256), new Float64Array(256), new Float64Array(256)];
    let globalSamples = 0;

    for (let pairIdx = 0; pairIdx < originalBuffers.length; pairIdx++) {
      const [origRaw, adjRaw] = await Promise.all([
        sharp(originalBuffers[pairIdx])
          .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'fill' })
          .removeAlpha()
          .raw()
          .toBuffer(),
        sharp(adjustedBuffers[pairIdx])
          .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'fill' })
          .removeAlpha()
          .raw()
          .toBuffer()
      ]);

      const pixelCount = SAMPLE_SIZE * SAMPLE_SIZE;

      for (let i = 0; i < pixelCount; i++) {
        const off = i * 3;
        const r = origRaw[off], g = origRaw[off + 1], b = origRaw[off + 2];
        const ar = adjRaw[off], ag = adjRaw[off + 1], ab = adjRaw[off + 2];

        // 원본 픽셀의 HSL → 세그먼트 가중치
        const [h, s, l] = rgbToHsl(r, g, b);
        const weights = this.computeWeights(h, s, l);

        // 각 세그먼트의 가중 히스토그램에 누적
        for (const seg of SEGMENT_NAMES) {
          const w = weights[seg];
          if (w < 0.01) continue;

          origSegHist[seg][0][r] += w;
          origSegHist[seg][1][g] += w;
          origSegHist[seg][2][b] += w;
          adjSegHist[seg][0][ar] += w;
          adjSegHist[seg][1][ag] += w;
          adjSegHist[seg][2][ab] += w;
          segWeight[seg] += w;
        }

        // 글로벌 히스토그램
        origGlobalHist[0][r]++; origGlobalHist[1][g]++; origGlobalHist[2][b]++;
        adjGlobalHist[0][ar]++; adjGlobalHist[1][ag]++; adjGlobalHist[2][ab]++;
        globalSamples++;
      }
    }

    // 글로벌 LUT 계산
    const globalLut = this.buildSegmentLUT(origGlobalHist, adjGlobalHist, globalSamples);

    // 세그먼트별 LUT 계산 (샘플 부족 시 identity LUT)
    const profile: SegmentedTransferProfile = {
      global: globalLut,
      trainedPairs: originalBuffers.length,
    } as SegmentedTransferProfile;

    for (const seg of SEGMENT_NAMES) {
      const samples = segWeight[seg];
      if (samples >= MIN_SEGMENT_SAMPLES) {
        profile[seg] = this.buildSegmentLUT(origSegHist[seg], adjSegHist[seg], samples);
      } else {
        // 샘플 부족 → identity LUT (보정 없음)
        logger.warn(`세그먼트 샘플 부족, identity 사용: ${seg} (${Math.round(samples)}샘플)`);
        profile[seg] = { red: identityLUT(), green: identityLUT(), blue: identityLUT(), samples: 0 };
      }
      logger.info(`세그먼트 학습 완료: ${seg}`, { samples: Math.round(segWeight[seg]) });
    }

    return profile;
  }

  /**
   * 세그먼트별 전송 프로필을 이미지에 적용
   * 각 픽셀마다 세그먼트 가중치를 계산하여 해당 세그먼트의 LUT를 블렌딩
   *
   * @param blend 0.0~1.0. 기본 0.75 (풍경 세그먼트 기준 blend)
   *              skin/purple는 별도 보수적 blend 사용:
   *              사용자의 풍경 편집(색온도, 채도) 부수 효과가
   *              의상/피부에 의도치 않게 적용되는 것을 방지
   */
  async applySegmentedProfile(
    imageBuffer: Buffer,
    profile: SegmentedTransferProfile,
    blend: number = 0.75
  ): Promise<Buffer> {
    const metadata = await sharp(imageBuffer).metadata();
    const { width, height, format } = metadata;
    if (!width || !height) throw new Error('이미지 메타데이터 오류');

    const { data: rawData } = await sharp(imageBuffer)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixelCount = width * height;
    const outputData = Buffer.allocUnsafe(rawData.length);

    // 세그먼트별 독립 blend: 풍경 요소는 강하게, 인물/의상은 보수적으로
    // (풍경 편집의 부수 효과가 의상/피부에 과도하게 적용되는 것 방지)
    const SEGMENT_BLEND: Record<SegmentName, number> = {
      sky:     blend,        // 하늘: 그대로 적용
      water:   blend * 0.95, // 바다: 거의 그대로
      foliage: blend * 0.85, // 초목
      neutral: blend * 0.80, // 돌/중립
      purple:  blend * 0.35, // 의상(보라): 보수적 — 풍경 편집 부수효과 차단
      skin:    blend * 0.25, // 피부: 최대한 보존
    };

    for (let i = 0; i < pixelCount; i++) {
      const off = i * 3;
      const r = rawData[off], g = rawData[off + 1], b = rawData[off + 2];

      // HSL 변환 → 세그먼트 가중치
      const [h, s, l] = rgbToHsl(r, g, b);
      const weights = this.computeWeights(h, s, l);

      // 가중 합산: 각 세그먼트의 LUT + 세그먼트별 blend 적용
      let outR = r, outG = g, outB = b; // 초기값 = 원본 (blend 0인 경우와 동일)
      outR = 0; outG = 0; outB = 0;

      for (const seg of SEGMENT_NAMES) {
        const w = weights[seg];
        if (w < 0.01) continue;

        // 폴백 우선순위:
        //   samples >= MIN  → 해당 세그먼트 LUT (신뢰할 만한 학습 데이터)
        //   0 < samples < MIN → global LUT (일부 데이터 있지만 부족)
        //   samples === 0   → identity LUT (훈련 데이터 없음 → 원본 유지)
        //                      global 사용 시 관계없는 변환이 적용되어 색상 왜곡 발생
        const segData = profile[seg];
        const lut = segData.samples >= MIN_SEGMENT_SAMPLES
          ? segData
          : segData.samples > 0
            ? profile.global
            : segData;  // identity (buildSegmentedProfile에서 이미 설정)

        const segBlend = SEGMENT_BLEND[seg];
        const segInv = 1 - segBlend;

        // 각 세그먼트를 자신의 blend로 원본과 혼합 후 가중 합산
        outR += w * (r * segInv + lut.red[r]   * segBlend);
        outG += w * (g * segInv + lut.green[g] * segBlend);
        outB += w * (b * segInv + lut.blue[b]  * segBlend);
      }

      outputData[off]     = Math.max(0, Math.min(255, Math.round(outR)));
      outputData[off + 1] = Math.max(0, Math.min(255, Math.round(outG)));
      outputData[off + 2] = Math.max(0, Math.min(255, Math.round(outB)));
    }

    logger.info('세그먼트 보정 적용 완료', { width, height, blend });

    if (format === 'png') {
      return sharp(outputData, { raw: { width, height, channels: 3 } })
        .withMetadata().png({ compressionLevel: 6 }).toBuffer();
    }
    return sharp(outputData, { raw: { width, height, channels: 3 } })
      .withMetadata().jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer();
  }

  /** DB 저장용 직렬화 */
  serialize(profile: SegmentedTransferProfile): object {
    const result: any = { trainedPairs: profile.trainedPairs };
    for (const seg of [...SEGMENT_NAMES, 'global'] as const) {
      const lut = profile[seg as SegmentName | 'global'];
      result[seg] = {
        red:     Array.from(lut.red),
        green:   Array.from(lut.green),
        blue:    Array.from(lut.blue),
        samples: lut.samples
      };
    }
    return result;
  }

  /** DB 로드용 역직렬화 */
  deserialize(data: any): SegmentedTransferProfile {
    const profile: any = { trainedPairs: data.trainedPairs ?? 1 };
    for (const seg of [...SEGMENT_NAMES, 'global'] as const) {
      if (data[seg]) {
        profile[seg] = {
          red:     new Uint8Array(data[seg].red),
          green:   new Uint8Array(data[seg].green),
          blue:    new Uint8Array(data[seg].blue),
          samples: data[seg].samples ?? 0
        };
      } else {
        profile[seg] = { red: identityLUT(), green: identityLUT(), blue: identityLUT(), samples: 0 };
      }
    }
    return profile as SegmentedTransferProfile;
  }

  // ─────────────────────────────────────────────
  // 세그먼트 가중치 계산
  // ─────────────────────────────────────────────

  /**
   * 픽셀의 HSL 값으로 6개 세그먼트의 소프트 가중치 계산
   * 가중치 합 = 1.0 (정규화됨)
   */
  computeWeights(h: number, s: number, l: number): Record<SegmentName, number> {
    const w = { sky: 0, water: 0, foliage: 0, skin: 0, purple: 0, neutral: 0 };

    // ── 중립 (돌/콘크리트/무채색): 채도 낮음 + 밝기 0.65 미만
    //    밝은 영역(L>0.65: 흐린 하늘, 안개, 흰 모래)은 neutral에서 제외
    w.neutral = (1 - smoothstep(0.06, 0.20, s)) *
                (1 - smoothstep(0.58, 0.70, l));

    // 유채색 픽셀의 기반 가중치 (중립과 반대)
    const chroma = smoothstep(0.06, 0.20, s);

    // ── 하늘: 두 가지 모드 ──
    //   1) 채도 있는 하늘: H≈210°, S>0.15, L>0.45
    //   2) 뿌연/흐린 하늘: H≈210°, L>0.60, S 낮아도 허용 (흐린 날 하늘)
    const saturatedSky = hueGaussian(h, 210, 28) *
                         smoothstep(0.15, 0.35, s) *
                         smoothstep(0.42, 0.62, l);
    const hazySky = hueGaussian(h, 210, 40) *
                    smoothstep(0.58, 0.75, l) *
                    (1 - smoothstep(0.0, 0.18, s)); // 낮은 채도 밝은 영역 = 뿌연 하늘
    w.sky = saturatedSky + hazySky * 0.7;

    // ── 바다/물: H≈200°, 채도>0.08, 밝기<0.62 ──
    w.water = hueGaussian(h, 200, 28) *
              smoothstep(0.05, 0.20, s) *
              (1 - smoothstep(0.52, 0.68, l)) *  // 너무 밝으면 하늘로 분류
              smoothstep(0.05, 0.18, l) *          // 너무 어두우면 제외
              chroma;

    // ── 초목/숲: H≈110° (초록 계열) ──
    w.foliage = hueGaussian(h, 110, 45) *
                smoothstep(0.10, 0.25, s) *
                chroma;

    // ── 피부/따뜻한 색: H≈20° (0°와 360° 경계 처리) ──
    w.skin = hueGaussianWrap(h, 20, 28) *
             smoothstep(0.08, 0.22, s) *
             smoothstep(0.28, 0.42, l) *
             (1 - smoothstep(0.78, 0.92, l)) *
             chroma;

    // ── 보라/자주: H≈285° ──
    w.purple = hueGaussian(h, 285, 35) *
               smoothstep(0.10, 0.25, s) *
               chroma;

    // 정규화 (합=1.0)
    const total = w.sky + w.water + w.foliage + w.skin + w.purple + w.neutral;
    if (total > 1e-6) {
      for (const key of SEGMENT_NAMES) w[key] /= total;
    } else {
      w.neutral = 1;
    }

    return w;
  }

  // ─────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────

  private initSegmentHistograms(): Record<SegmentName, [Float64Array, Float64Array, Float64Array]> {
    const result = {} as Record<SegmentName, [Float64Array, Float64Array, Float64Array]>;
    for (const seg of SEGMENT_NAMES) {
      result[seg] = [new Float64Array(256), new Float64Array(256), new Float64Array(256)];
    }
    return result;
  }

  private initSegmentWeights(): Record<SegmentName, number> {
    const result = {} as Record<SegmentName, number>;
    for (const seg of SEGMENT_NAMES) result[seg] = 0;
    return result;
  }

  private buildSegmentLUT(
    origHist: [Float64Array, Float64Array, Float64Array],
    adjHist: [Float64Array, Float64Array, Float64Array],
    totalSamples: number
  ): SegmentLUT {
    return {
      red:     new Uint8Array(buildTransferLUT(toCDF(origHist[0], totalSamples), toCDF(adjHist[0], totalSamples))),
      green:   new Uint8Array(buildTransferLUT(toCDF(origHist[1], totalSamples), toCDF(adjHist[1], totalSamples))),
      blue:    new Uint8Array(buildTransferLUT(toCDF(origHist[2], totalSamples), toCDF(adjHist[2], totalSamples))),
      samples: Math.round(totalSamples)
    };
  }
}

// ─────────────────────────────────────────────
// 수학 헬퍼 함수 (모듈 스코프)
// ─────────────────────────────────────────────

/** RGB(0-255) → HSL: H=0-360, S=0-1, L=0-1 */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) return [0, 0, l]; // 무채색

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  if (max === rn)      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else                 h = ((rn - gn) / d + 4) / 6;

  return [h * 360, s, l];
}

/** Smoothstep 보간 (0→1, edge0~edge1 구간에서 부드럽게 전환) */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** 하늘 중심 hue 거리 기반 가우시안 가중치 (wrap-around 처리 포함) */
function hueGaussian(h: number, center: number, sigma: number): number {
  let diff = Math.abs(h - center);
  if (diff > 180) diff = 360 - diff; // 360° wrap-around
  return Math.exp(-0.5 * (diff / sigma) ** 2);
}

/** wrap-around가 있는 hue 중심 (예: center=20°, 350~40° 포함) */
function hueGaussianWrap(h: number, center: number, sigma: number): number {
  return hueGaussian(h, center, sigma); // hueGaussian이 이미 wrap 처리함
}

/** 가중 히스토그램 → 정규화된 CDF */
function toCDF(hist: Float64Array, total: number): Float64Array {
  const cdf = new Float64Array(256);
  let cum = 0;
  const norm = total > 0 ? total : 1;
  for (let i = 0; i < 256; i++) {
    cum += hist[i] / norm;
    cdf[i] = cum;
  }
  cdf[255] = 1.0;
  return cdf;
}

/**
 * CDF 기반 전송 LUT 생성: T(x) = CDF_adj⁻¹(CDF_orig(x))
 *
 * 후처리:
 * 1. 단조증가 강제 - LUT[x] <= LUT[x+1] 보장 (급격한 역전 방지)
 * 2. 최대 이동량 제한 - |T(x) - x| <= MAX_SHIFT (극단적 매핑 방지)
 *    예: sky blue 180→76 같은 극단 케이스 차단
 */
const MAX_LUT_SHIFT = 70; // 픽셀 단위 최대 이동량 (±70)

function buildTransferLUT(origCDF: Float64Array, adjCDF: Float64Array): number[] {
  const raw = new Array(256);
  for (let src = 0; src < 256; src++) {
    const target = origCDF[src];
    let lo = 0, hi = 255;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (adjCDF[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    raw[src] = lo;
  }

  // 1. 단조증가 강제: 뒤쪽이 앞쪽보다 작으면 앞쪽 값으로 클램핑
  for (let i = 1; i < 256; i++) {
    if (raw[i] < raw[i - 1]) raw[i] = raw[i - 1];
  }

  // 2. 최대 이동량 제한: 과보정 방지 (세그먼트 샘플 희소 구간 보호)
  const lut = new Array(256);
  for (let i = 0; i < 256; i++) {
    const shift = Math.max(-MAX_LUT_SHIFT, Math.min(MAX_LUT_SHIFT, raw[i] - i));
    lut[i] = Math.max(0, Math.min(255, i + shift));
  }

  return lut;
}

/** Identity LUT (변환 없음) */
function identityLUT(): Uint8Array {
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) lut[i] = i;
  return lut;
}

export const hslSegmentService = new HslSegmentService();
