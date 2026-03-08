import sharp from 'sharp';
import { logger } from '../utils/logger';

/**
 * 3D Color LUT (Look-Up Table) 서비스
 *
 * 기존 AI 파라미터 추정 방식의 한계:
 *   - AI가 사진을 "보고" 수치를 추측 → 정확도 약 41%
 *   - Shadows/Highlights가 전체 이미지 선형 변환으로 근사됨
 *   - Sharp와 Lightroom의 색상 공간 처리 방식이 다름
 *
 * LUT 방식의 장점:
 *   - 원본→보정본 픽셀을 직접 매핑 → 추측 없음
 *   - 어떤 편집 소프트웨어를 썼든 그대로 캡처
 *   - 결정적(deterministic): 같은 입력 → 항상 같은 출력
 *   - DaVinci Resolve, Lightroom, 영화 색보정에서 동일하게 사용하는 산업 표준
 */

const LUT_SIZE = 33; // 33×33×33 = 35,937 노드, 17³ 대비 7배 정밀도
const LUT_TOTAL = LUT_SIZE * LUT_SIZE * LUT_SIZE * 3; // 각 노드당 R,G,B

export class LUTService {

  /**
   * 원본 + 보정 이미지 쌍으로 3D Color LUT 생성
   *
   * 알고리즘:
   * 1. 양쪽 이미지를 200×200으로 다운샘플 (샘플링 효율)
   * 2. 픽셀별로 입력(원본) → 출력(보정) 색상 매핑 수집
   * 3. LUT 격자 노드별 평균 계산
   * 4. 비어 있는 노드는 이웃 노드에서 보간 (없으면 identity)
   */
  async buildFromPair(
    originalBuffer: Buffer,
    adjustedBuffer: Buffer
  ): Promise<number[]> {
    const SAMPLE_SIZE = 200;

    // 두 이미지를 동일 크기로 다운샘플 + raw 픽셀 추출
    const [origData, adjData] = await Promise.all([
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

    // LUT 누적 배열 (합계용) + 카운트
    const lutSum = new Float32Array(LUT_TOTAL).fill(0);
    const lutCount = new Uint32Array(LUT_SIZE ** 3).fill(0);

    // identity로 초기화: 변환 없음이 기본값
    const lut = new Float32Array(LUT_TOTAL);
    for (let ri = 0; ri < LUT_SIZE; ri++) {
      for (let gi = 0; gi < LUT_SIZE; gi++) {
        for (let bi = 0; bi < LUT_SIZE; bi++) {
          const idx = (ri * LUT_SIZE * LUT_SIZE + gi * LUT_SIZE + bi) * 3;
          lut[idx]     = (ri / (LUT_SIZE - 1)) * 255;
          lut[idx + 1] = (gi / (LUT_SIZE - 1)) * 255;
          lut[idx + 2] = (bi / (LUT_SIZE - 1)) * 255;
        }
      }
    }

    // 픽셀 샘플링: 원본 색상 → 보정 색상 매핑 수집
    for (let i = 0; i < pixelCount; i++) {
      const offset = i * 3;
      const r = origData[offset];
      const g = origData[offset + 1];
      const b = origData[offset + 2];

      // 이 픽셀이 속하는 LUT 격자 노드
      const ri = Math.round((r / 255) * (LUT_SIZE - 1));
      const gi = Math.round((g / 255) * (LUT_SIZE - 1));
      const bi = Math.round((b / 255) * (LUT_SIZE - 1));
      const nodeIdx = ri * LUT_SIZE * LUT_SIZE + gi * LUT_SIZE + bi;
      const lutIdx = nodeIdx * 3;

      // 보정 이미지의 대응 픽셀 색상 누적
      lutSum[lutIdx]     += adjData[offset];
      lutSum[lutIdx + 1] += adjData[offset + 1];
      lutSum[lutIdx + 2] += adjData[offset + 2];
      lutCount[nodeIdx]++;
    }

    // 샘플이 있는 노드는 평균값으로 LUT 업데이트
    let sampledNodes = 0;
    for (let i = 0; i < LUT_SIZE ** 3; i++) {
      if (lutCount[i] > 0) {
        const lutIdx = i * 3;
        lut[lutIdx]     = lutSum[lutIdx]     / lutCount[i];
        lut[lutIdx + 1] = lutSum[lutIdx + 1] / lutCount[i];
        lut[lutIdx + 2] = lutSum[lutIdx + 2] / lutCount[i];
        sampledNodes++;
      }
    }

    logger.info('LUT sampling complete', {
      pixelCount,
      sampledNodes,
      totalNodes: LUT_SIZE ** 3,
      coverage: `${((sampledNodes / LUT_SIZE ** 3) * 100).toFixed(1)}%`
    });

    // 빈 노드 보간: 인접 샘플된 노드의 값으로 채우기 (3회 패스)
    this.interpolateEmptyNodes(lut, lutCount);

    return Array.from(lut);
  }

  /**
   * 여러 이미지 쌍에서 생성된 LUT들을 평균내어 합성
   * 더 많은 이미지 쌍 → 색상 공간 커버리지 향상
   */
  mergeLUTs(luts: number[][]): number[] {
    if (luts.length === 0) throw new Error('No LUTs to merge');
    if (luts.length === 1) return luts[0];

    const merged = new Float32Array(LUT_TOTAL);
    const count = luts.length;

    for (let i = 0; i < LUT_TOTAL; i++) {
      let sum = 0;
      for (const lut of luts) {
        sum += lut[i];
      }
      merged[i] = sum / count;
    }

    logger.info('LUTs merged', { lutCount: count });
    return Array.from(merged);
  }

  /**
   * 3D Color LUT를 이미지에 적용 (Trilinear Interpolation)
   *
   * 각 픽셀 (r,g,b) → LUT 색상 공간에서 8개 인접 노드 찾기
   * → 삼선형 보간으로 출력 색상 계산 → 정확한 색상 변환
   */
  async applyToBuffer(imageBuffer: Buffer, lut: number[]): Promise<Buffer> {
    const startTime = Date.now();

    const metadata = await sharp(imageBuffer).metadata();
    const { width, height } = metadata;
    if (!width || !height) throw new Error('Invalid image metadata');

    // raw 픽셀 데이터 추출 (RGB)
    const { data: rawData, info } = await sharp(imageBuffer)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const channels = info.channels; // 3 (RGB)
    const pixelCount = width * height;
    const outputData = Buffer.allocUnsafe(rawData.length);

    const lutF32 = new Float32Array(lut);
    const maxIdx = LUT_SIZE - 1;

    for (let i = 0; i < pixelCount; i++) {
      const offset = i * channels;
      const r = rawData[offset];
      const g = rawData[offset + 1];
      const b = rawData[offset + 2];

      // LUT 공간에서의 연속 위치 (0 ~ LUT_SIZE-1)
      const rPos = (r / 255) * maxIdx;
      const gPos = (g / 255) * maxIdx;
      const bPos = (b / 255) * maxIdx;

      // 정수 인덱스 (하한)
      const r0 = Math.min(Math.floor(rPos), maxIdx - 1);
      const g0 = Math.min(Math.floor(gPos), maxIdx - 1);
      const b0 = Math.min(Math.floor(bPos), maxIdx - 1);
      const r1 = r0 + 1;
      const g1 = g0 + 1;
      const b1 = b0 + 1;

      // 소수 부분 (보간 가중치)
      const rf = rPos - r0;
      const gf = gPos - g0;
      const bf = bPos - b0;

      // 8개 코너 노드에서 RGB 추출
      const c000 = this.getLUTNode(lutF32, r0, g0, b0);
      const c100 = this.getLUTNode(lutF32, r1, g0, b0);
      const c010 = this.getLUTNode(lutF32, r0, g1, b0);
      const c110 = this.getLUTNode(lutF32, r1, g1, b0);
      const c001 = this.getLUTNode(lutF32, r0, g0, b1);
      const c101 = this.getLUTNode(lutF32, r1, g0, b1);
      const c011 = this.getLUTNode(lutF32, r0, g1, b1);
      const c111 = this.getLUTNode(lutF32, r1, g1, b1);

      // Trilinear interpolation (R축 → G축 → B축 순서)
      for (let ch = 0; ch < 3; ch++) {
        const c00 = c000[ch] * (1 - rf) + c100[ch] * rf;
        const c10 = c010[ch] * (1 - rf) + c110[ch] * rf;
        const c01 = c001[ch] * (1 - rf) + c101[ch] * rf;
        const c11 = c011[ch] * (1 - rf) + c111[ch] * rf;

        const c0 = c00 * (1 - gf) + c10 * gf;
        const c1 = c01 * (1 - gf) + c11 * gf;

        const result = c0 * (1 - bf) + c1 * bf;
        outputData[offset + ch] = Math.max(0, Math.min(255, Math.round(result)));
      }
    }

    const processingTime = Date.now() - startTime;
    logger.info('LUT applied', {
      width,
      height,
      pixels: pixelCount,
      processingTimeMs: processingTime
    });

    // raw 버퍼를 다시 JPEG으로 변환 (EXIF 메타데이터 보존)
    return sharp(outputData, {
      raw: { width, height, channels: 3 }
    })
      .withMetadata()
      .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
      .toBuffer();
  }

  /**
   * LUT 격자 노드에서 RGB 값 추출
   */
  private getLUTNode(
    lut: Float32Array,
    ri: number,
    gi: number,
    bi: number
  ): [number, number, number] {
    const idx = (ri * LUT_SIZE * LUT_SIZE + gi * LUT_SIZE + bi) * 3;
    return [lut[idx], lut[idx + 1], lut[idx + 2]];
  }

  /**
   * 샘플이 없는 빈 LUT 노드를 인접 노드로 보간
   * 3회 패스로 점진적 채우기 (먼저 채워진 노드에서 전파)
   */
  private interpolateEmptyNodes(lut: Float32Array, lutCount: Uint32Array): void {
    const PASSES = 3;

    for (let pass = 0; pass < PASSES; pass++) {
      let filledThisPass = 0;

      for (let ri = 0; ri < LUT_SIZE; ri++) {
        for (let gi = 0; gi < LUT_SIZE; gi++) {
          for (let bi = 0; bi < LUT_SIZE; bi++) {
            const nodeIdx = ri * LUT_SIZE * LUT_SIZE + gi * LUT_SIZE + bi;
            if (lutCount[nodeIdx] > 0) continue; // 이미 채워짐

            // 6방향 인접 노드 수집
            const neighbors: number[] = [];
            const dirs = [-1, 1];
            for (const dr of dirs) {
              const nr = ri + dr;
              if (nr >= 0 && nr < LUT_SIZE) {
                const nIdx = nr * LUT_SIZE * LUT_SIZE + gi * LUT_SIZE + bi;
                if (lutCount[nIdx] > 0) neighbors.push(nIdx);
              }
            }
            for (const dg of dirs) {
              const ng = gi + dg;
              if (ng >= 0 && ng < LUT_SIZE) {
                const nIdx = ri * LUT_SIZE * LUT_SIZE + ng * LUT_SIZE + bi;
                if (lutCount[nIdx] > 0) neighbors.push(nIdx);
              }
            }
            for (const db of dirs) {
              const nb = bi + db;
              if (nb >= 0 && nb < LUT_SIZE) {
                const nIdx = ri * LUT_SIZE * LUT_SIZE + gi * LUT_SIZE + nb;
                if (lutCount[nIdx] > 0) neighbors.push(nIdx);
              }
            }

            if (neighbors.length === 0) continue;

            // 인접 노드 평균으로 채우기
            const lutIdx = nodeIdx * 3;
            let sumR = 0, sumG = 0, sumB = 0;
            for (const nIdx of neighbors) {
              const nLutIdx = nIdx * 3;
              sumR += lut[nLutIdx];
              sumG += lut[nLutIdx + 1];
              sumB += lut[nLutIdx + 2];
            }
            lut[lutIdx]     = sumR / neighbors.length;
            lut[lutIdx + 1] = sumG / neighbors.length;
            lut[lutIdx + 2] = sumB / neighbors.length;
            lutCount[nodeIdx] = 999; // 보간됨으로 표시
            filledThisPass++;
          }
        }
      }

      logger.info(`LUT interpolation pass ${pass + 1}`, { filled: filledThisPass });
      if (filledThisPass === 0) break; // 더 채울 노드 없음
    }
  }
}

export const lutService = new LUTService();
