/**
 * M1 iPad Air (5th gen / 8GB RAM) 最適化基準 (GEMINI.md Section 4 準拠)
 */
export const RENDER_CONFIG = {
  /** 標準描画解像度 (DPR) */
  defaultDpr: 1.0,
  /** 動的調整の最小 DPR */
  minDpr: 0.75,
  /** 動的調整の最大 DPR */
  maxDpr: 1.25,
  /** リアルタイムシャドウマップ解像度 */
  shadowMapSize: 1024,
  /** 目標フレームレート */
  targetFps: 30,
  /** 理想フレームレート */
  idealFps: 60,
  /** Google 公式 CDN Draco デコーダパス */
  dracoDecoderPath: 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/',
} as const;
