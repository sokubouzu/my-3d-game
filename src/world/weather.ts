import * as THREE from 'three';

export type WeatherMode = 'sunny' | 'cloudy' | 'rain' | 'fog';

export const WEATHER_ORDER: readonly WeatherMode[] = [
  'sunny',
  'cloudy',
  'rain',
  'fog',
];

export const WEATHER_LABELS: Record<
  WeatherMode,
  { ja: string; en: string }
> = {
  sunny: { ja: '晴れ', en: 'SUNNY' },
  cloudy: { ja: '曇り', en: 'CLOUDY' },
  rain: { ja: '雨', en: 'RAIN' },
  fog: { ja: '霧', en: 'FOG' },
};

/**
 * TimeOfDayController へ渡すゼロアロケーション天候モディファイア。
 * 昼・夕方・夜のベース環境に対して破綻なく掛け合わせられる係数群。
 */
export interface WeatherLightingModifier {
  /** 0 = 晴天, 1 = 曇天（空・フォグを曇天トーンへ寄せる比率） */
  overcastAmount: number;
  /** 0 = 乾燥, 1 = 雨天（暗め曇天・濡れ路面・雨粒強度） */
  rainAmount: number;
  /** 0 = 通常視界, 1 = 濃霧（空と霧を一体化させる比率） */
  fogAmount: number;
  /** 太陽光/月光 DirectionalLight 強度倍率 */
  dirIntensityScale: number;
  /** 環境光 HemisphereLight 強度倍率 */
  hemiIntensityScale: number;
  /** HDRI IBL 環境反射強度倍率 */
  envIntensityScale: number;
  /** 太陽・月ディスクの可視倍率 */
  sunDiscScale: number;
  /** 夜間星空の可視倍率 */
  starScale: number;
  /** FogExp2 の基本密度に対する倍率 */
  fogDensityScale: number;
  /** 濃霧時の目標 FogExp2 絶対密度へ寄せるブレンド比率 (0..1) */
  denseFogBlend: number;
  /** 濃霧時の目標 FogExp2 密度 */
  denseFogTargetDensity: number;
  /** 空・曇天の暗さ倍率（雨天時のやや暗い空向け） */
  skyBrightnessScale: number;
  /** 雨・霧時の日中ヘッドライト自動点灯下限 (0..1) */
  headlightFloor: number;
  /** 晴天かつ完全収束時のみ昼間 HDRI 背景表示を許可 */
  allowDayHdriBg: boolean;
  /** いずれかの天候パラメータが現在遷移中か */
  isTransitioning: boolean;
}

interface WeatherPreset {
  overcastAmount: number;
  rainAmount: number;
  fogAmount: number;
  dirIntensityScale: number;
  hemiIntensityScale: number;
  envIntensityScale: number;
  sunDiscScale: number;
  starScale: number;
  fogDensityScale: number;
  denseFogBlend: number;
  denseFogTargetDensity: number;
  skyBrightnessScale: number;
  headlightFloor: number;
}

const WEATHER_PRESETS: Record<WeatherMode, WeatherPreset> = {
  sunny: {
    overcastAmount: 0.0,
    rainAmount: 0.0,
    fogAmount: 0.0,
    dirIntensityScale: 1.0,
    hemiIntensityScale: 1.0,
    envIntensityScale: 1.0,
    sunDiscScale: 1.0,
    starScale: 1.0,
    fogDensityScale: 1.0,
    denseFogBlend: 0.0,
    denseFogTargetDensity: 0.0024,
    skyBrightnessScale: 1.0,
    headlightFloor: 0.0,
  },
  cloudy: {
    overcastAmount: 1.0,
    rainAmount: 0.0,
    fogAmount: 0.0,
    dirIntensityScale: 0.42,
    hemiIntensityScale: 1.22,
    envIntensityScale: 0.78,
    sunDiscScale: 0.1,
    starScale: 0.0,
    fogDensityScale: 1.45,
    denseFogBlend: 0.0,
    denseFogTargetDensity: 0.004,
    skyBrightnessScale: 0.94,
    headlightFloor: 0.0,
  },
  rain: {
    overcastAmount: 1.0,
    rainAmount: 1.0,
    fogAmount: 0.18,
    dirIntensityScale: 0.28,
    hemiIntensityScale: 0.96,
    envIntensityScale: 0.9,
    sunDiscScale: 0.0,
    starScale: 0.0,
    fogDensityScale: 2.55,
    denseFogBlend: 0.0,
    denseFogTargetDensity: 0.007,
    skyBrightnessScale: 0.7,
    headlightFloor: 0.65,
  },
  fog: {
    overcastAmount: 0.68,
    rainAmount: 0.0,
    fogAmount: 1.0,
    dirIntensityScale: 0.44,
    hemiIntensityScale: 1.16,
    envIntensityScale: 0.68,
    sunDiscScale: 0.06,
    starScale: 0.0,
    fogDensityScale: 1.0,
    denseFogBlend: 1.0,
    denseFogTargetDensity: 0.0185,
    skyBrightnessScale: 0.96,
    headlightFloor: 0.55,
  },
};

interface TrackedWetMaterial {
  mat: THREE.MeshStandardMaterial;
  baseRoughness: number;
  targetRoughness: number;
  baseMetalness: number;
  targetMetalness: number;
  baseEnvMapIntensity: number;
  targetEnvMapIntensity: number;
  baseColor: THREE.Color | null;
  wetColor: THREE.Color | null;
}

const TIRE_MATERIAL_PATTERN = /(tire|tyre|rubber|tread)/i;

// 軽量雨粒パーティクル設定（850粒・LineSegments 1ドローコール・固定TypedArray再利用）
const RAIN_DROP_COUNT = 850;
const RAIN_AREA_HALF_XZ = 22.0;
const RAIN_AREA_SPAN_XZ = RAIN_AREA_HALF_XZ * 2;
const RAIN_MIN_OFFSET_Y = -5.0;
const RAIN_MAX_OFFSET_Y = 17.0;
const RAIN_AREA_SPAN_Y = RAIN_MAX_OFFSET_Y - RAIN_MIN_OFFSET_Y;
const RAIN_FORWARD_BIAS = 6.5;
const RAIN_WIND_X = 2.4;
const RAIN_WIND_Z = 1.2;

const RAIN_COLOR_DAY = new THREE.Color(0xd6e6f5);
const RAIN_COLOR_NIGHT = new THREE.Color(0x9ab8df);
const RAIN_COLOR_SCRATCH = new THREE.Color();

/**
 * PHASE 5-A: 天候切替システム（晴れ / 曇り / 雨 / 霧）。
 * - M1 iPad Air 60FPS 維持のため、影追加や平面反射（SSR/Reflector）は一切使わず、
 *   1ドローコールの固定バッファ雨粒 LineSegments と、既存マテリアルの roughness/envMapIntensity
 *   軽量調整のみで濡れた路面・車体表現を実現する。
 */
export class WeatherController {
  private readonly scene: THREE.Scene;

  private mode: WeatherMode = 'sunny';
  private isTransitioning = false;

  // ゼロアロケーション補間用モディファイア（毎フレーム再利用）
  private readonly modifier: WeatherLightingModifier = {
    ...WEATHER_PRESETS.sunny,
    allowDayHdriBg: true,
    isTransitioning: false,
  };

  // 雨粒パーティクル（固定配列再利用・1ドローコール）
  private readonly rainGeo: THREE.BufferGeometry;
  private readonly rainMat: THREE.LineBasicMaterial;
  private readonly rainLines: THREE.LineSegments;
  private readonly rainPosArray: Float32Array;
  private readonly rainPosAttr: THREE.BufferAttribute;
  private readonly dropX = new Float32Array(RAIN_DROP_COUNT);
  private readonly dropY = new Float32Array(RAIN_DROP_COUNT);
  private readonly dropZ = new Float32Array(RAIN_DROP_COUNT);
  private readonly dropSpeed = new Float32Array(RAIN_DROP_COUNT);
  private readonly dropStreakScale = new Float32Array(RAIN_DROP_COUNT);
  private readonly camForwardScratch = new THREE.Vector3();
  private rainSeedInitialized = false;

  // 濡れた路面・車体マテリアル追跡（重複登録防止・原状復元保証）
  private readonly trackedWetMaterials: TrackedWetMaterial[] = [];
  private readonly trackedMatSet = new Set<THREE.MeshStandardMaterial>();
  private lastAppliedWetness = -1;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // 固定バッファで 850 粒の雨粒線分（1,700頂点）を初期化
    this.rainPosArray = new Float32Array(RAIN_DROP_COUNT * 2 * 3);
    this.rainPosAttr = new THREE.BufferAttribute(this.rainPosArray, 3);
    this.rainPosAttr.setUsage(THREE.DynamicDrawUsage);

    this.rainGeo = new THREE.BufferGeometry();
    this.rainGeo.setAttribute('position', this.rainPosAttr);

    this.rainMat = new THREE.LineBasicMaterial({
      color: RAIN_COLOR_DAY.getHex(),
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      fog: true,
    });

    this.rainLines = new THREE.LineSegments(this.rainGeo, this.rainMat);
    this.rainLines.name = 'WeatherRainParticles';
    this.rainLines.castShadow = false;
    this.rainLines.receiveShadow = false;
    this.rainLines.frustumCulled = false;
    this.rainLines.visible = false;
    this.scene.add(this.rainLines);

    // 決定論的な擬似乱数で初期オフセット・落下速度を割り当て
    let seed = 918273;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < RAIN_DROP_COUNT; i += 1) {
      this.dropX[i] = (rand() - 0.5) * RAIN_AREA_SPAN_XZ;
      this.dropY[i] = RAIN_MIN_OFFSET_Y + rand() * RAIN_AREA_SPAN_Y;
      this.dropZ[i] = (rand() - 0.5) * RAIN_AREA_SPAN_XZ;
      this.dropSpeed[i] = 17.5 + rand() * 7.5; // 17.5〜25.0 m/s
      this.dropStreakScale[i] = 0.028 + rand() * 0.014; // 約 0.50〜0.95m の自然な筋
    }
  }

  public getMode(): WeatherMode {
    return this.mode;
  }

  public isRaining(): boolean {
    return this.mode === 'rain';
  }

  public getRainAmount(): number {
    return this.modifier.rainAmount;
  }

  public getLightingModifier(): WeatherLightingModifier {
    return this.modifier;
  }

  public setMode(nextMode: WeatherMode): void {
    if (this.mode === nextMode) return;
    this.mode = nextMode;
    this.isTransitioning = true;
    this.modifier.isTransitioning = true;
    if (nextMode !== 'sunny') {
      this.modifier.allowDayHdriBg = false;
    }
  }

  public cycleMode(): WeatherMode {
    const idx = WEATHER_ORDER.indexOf(this.mode);
    const next = WEATHER_ORDER[(idx + 1) % WEATHER_ORDER.length];
    this.setMode(next);
    return next;
  }

  /**
   * 共有の車道アスファルト・歩道コンクリートマテリアルを濡れ表現対象として登録する。
   */
  public registerRoadMaterials(
    asphaltMaterial: THREE.MeshStandardMaterial,
    pavementMaterial: THREE.MeshStandardMaterial,
  ): void {
    this.trackMaterial(asphaltMaterial, {
      targetRoughness: 0.24,
      targetMetalness: 0.16,
      targetEnvMapIntensity: 1.5,
      wetTintHex: 0xc4cbd2,
    });
    this.trackMaterial(pavementMaterial, {
      targetRoughness: 0.34,
      targetMetalness: 0.08,
      targetEnvMapIntensity: 1.28,
      wetTintHex: 0xd9dfe5,
    });
  }

  /**
   * 公園芝生・樹木・最適化草 GLB などの植生マテリアルを雨天時の自然な湿り表現として登録する。
   * 路面ほど鏡面化させず、わずかに暗くしっとりした質感へ変化させ、晴天復帰で原状復元する。
   */
  public registerVegetationMaterial(mat: THREE.MeshStandardMaterial): void {
    this.trackMaterial(mat, {
      targetRoughness: Math.max(0.52, mat.roughness * 0.68),
      targetMetalness: 0.0,
      targetEnvMapIntensity: Math.min(1.12, Math.max(0.85, mat.envMapIntensity * 1.08)),
      wetTintHex: 0xd4ded2,
    });
  }

  /**
   * 運転可能車両・AI交通車両のボディマテリアルを濡れ表現対象として登録する。
   * ロード完了後に非同期で呼ばれても、現在の濡れ状態を即座に反映する。
   */
  public registerVehicleObject(root: THREE.Object3D): void {
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
        // 発光ライトリグ（加算ハロー・強い自発光レンズ）は対象外
        if (
          mat.blending === THREE.AdditiveBlending ||
          mat.emissiveIntensity > 1.2
        ) {
          continue;
        }
        const isTire =
          TIRE_MATERIAL_PATTERN.test(mat.name) ||
          TIRE_MATERIAL_PATTERN.test(obj.name);
        const desiredRoughness = isTire ? 0.35 : 0.22;
        this.trackMaterial(mat, {
          targetRoughness: Math.min(mat.roughness, desiredRoughness),
          targetMetalness: mat.metalness,
          targetEnvMapIntensity: Math.max(mat.envMapIntensity, isTire ? 1.15 : 1.38),
          wetTintHex: null,
        });
      }
    });
  }

  private trackMaterial(
    mat: THREE.MeshStandardMaterial,
    opts: {
      targetRoughness: number;
      targetMetalness: number;
      targetEnvMapIntensity: number;
      wetTintHex: number | null;
    },
  ): void {
    if (this.trackedMatSet.has(mat)) return;
    this.trackedMatSet.add(mat);

    const baseColor = opts.wetTintHex !== null ? mat.color.clone() : null;
    const wetColor =
      opts.wetTintHex !== null && baseColor
        ? baseColor.clone().multiply(new THREE.Color(opts.wetTintHex))
        : null;

    const entry: TrackedWetMaterial = {
      mat,
      baseRoughness: mat.roughness,
      targetRoughness: opts.targetRoughness,
      baseMetalness: mat.metalness,
      targetMetalness: opts.targetMetalness,
      baseEnvMapIntensity: mat.envMapIntensity,
      targetEnvMapIntensity: opts.targetEnvMapIntensity,
      baseColor,
      wetColor,
    };
    this.trackedWetMaterials.push(entry);

    if (this.modifier.rainAmount > 0.004) {
      this.applyWetnessToEntry(entry, this.modifier.rainAmount);
    }
  }

  public update(
    dt: number,
    camera: THREE.Camera,
    nightFactor: number,
  ): void {
    if (this.isTransitioning) {
      const target = WEATHER_PRESETS[this.mode];
      const alpha = 1 - Math.exp(-Math.max(0.001, dt) * 4.2);
      const m = this.modifier;

      m.overcastAmount += (target.overcastAmount - m.overcastAmount) * alpha;
      m.rainAmount += (target.rainAmount - m.rainAmount) * alpha;
      m.fogAmount += (target.fogAmount - m.fogAmount) * alpha;
      m.dirIntensityScale +=
        (target.dirIntensityScale - m.dirIntensityScale) * alpha;
      m.hemiIntensityScale +=
        (target.hemiIntensityScale - m.hemiIntensityScale) * alpha;
      m.envIntensityScale +=
        (target.envIntensityScale - m.envIntensityScale) * alpha;
      m.sunDiscScale += (target.sunDiscScale - m.sunDiscScale) * alpha;
      m.starScale += (target.starScale - m.starScale) * alpha;
      m.fogDensityScale += (target.fogDensityScale - m.fogDensityScale) * alpha;
      m.denseFogBlend += (target.denseFogBlend - m.denseFogBlend) * alpha;
      m.denseFogTargetDensity +=
        (target.denseFogTargetDensity - m.denseFogTargetDensity) * alpha;
      m.skyBrightnessScale +=
        (target.skyBrightnessScale - m.skyBrightnessScale) * alpha;
      m.headlightFloor += (target.headlightFloor - m.headlightFloor) * alpha;

      const diff =
        Math.abs(target.overcastAmount - m.overcastAmount) +
        Math.abs(target.rainAmount - m.rainAmount) +
        Math.abs(target.fogAmount - m.fogAmount) +
        Math.abs(target.dirIntensityScale - m.dirIntensityScale) +
        Math.abs(target.denseFogBlend - m.denseFogBlend);

      if (diff < 0.003) {
        m.overcastAmount = target.overcastAmount;
        m.rainAmount = target.rainAmount;
        m.fogAmount = target.fogAmount;
        m.dirIntensityScale = target.dirIntensityScale;
        m.hemiIntensityScale = target.hemiIntensityScale;
        m.envIntensityScale = target.envIntensityScale;
        m.sunDiscScale = target.sunDiscScale;
        m.starScale = target.starScale;
        m.fogDensityScale = target.fogDensityScale;
        m.denseFogBlend = target.denseFogBlend;
        m.denseFogTargetDensity = target.denseFogTargetDensity;
        m.skyBrightnessScale = target.skyBrightnessScale;
        m.headlightFloor = target.headlightFloor;
        this.isTransitioning = false;
      }

      m.isTransitioning = this.isTransitioning;
      m.allowDayHdriBg = this.mode === 'sunny' && !this.isTransitioning;
    }

    this.updateWetMaterials(this.modifier.rainAmount);
    this.updateRainParticles(dt, camera, nightFactor);
  }

  private updateWetMaterials(wetness: number): void {
    if (Math.abs(wetness - this.lastAppliedWetness) < 0.004) return;
    this.lastAppliedWetness = wetness;

    for (let i = 0; i < this.trackedWetMaterials.length; i += 1) {
      this.applyWetnessToEntry(this.trackedWetMaterials[i], wetness);
    }
  }

  private applyWetnessToEntry(
    entry: TrackedWetMaterial,
    wetness: number,
  ): void {
    const mat = entry.mat;
    if (wetness <= 0.001) {
      mat.roughness = entry.baseRoughness;
      mat.metalness = entry.baseMetalness;
      mat.envMapIntensity = entry.baseEnvMapIntensity;
      if (entry.baseColor) {
        mat.color.copy(entry.baseColor);
      }
      return;
    }

    mat.roughness =
      entry.baseRoughness +
      (entry.targetRoughness - entry.baseRoughness) * wetness;
    mat.metalness =
      entry.baseMetalness +
      (entry.targetMetalness - entry.baseMetalness) * wetness;
    mat.envMapIntensity =
      entry.baseEnvMapIntensity +
      (entry.targetEnvMapIntensity - entry.baseEnvMapIntensity) * wetness;
    if (entry.baseColor && entry.wetColor) {
      mat.color.copy(entry.baseColor).lerp(entry.wetColor, wetness);
    }
  }

  private updateRainParticles(
    dt: number,
    camera: THREE.Camera,
    nightFactor: number,
  ): void {
    const rainAmount = this.modifier.rainAmount;
    if (rainAmount <= 0.01) {
      if (this.rainLines.visible) {
        this.rainLines.visible = false;
      }
      this.rainSeedInitialized = false;
      return;
    }

    this.rainLines.visible = true;

    // 時間帯に合わせて雨粒の色と不透明度を自然になじませる
    RAIN_COLOR_SCRATCH.copy(RAIN_COLOR_DAY).lerp(RAIN_COLOR_NIGHT, nightFactor);
    this.rainMat.color.copy(RAIN_COLOR_SCRATCH);
    this.rainMat.opacity = rainAmount * (0.48 - nightFactor * 0.08);

    // カメラ前方へわずかにオフセットした空間に雨粒ボックスを配置
    camera.getWorldDirection(this.camForwardScratch);
    const centerX = camera.position.x + this.camForwardScratch.x * RAIN_FORWARD_BIAS;
    const centerY = camera.position.y;
    const centerZ = camera.position.z + this.camForwardScratch.z * RAIN_FORWARD_BIAS;

    const minX = centerX - RAIN_AREA_HALF_XZ;
    const minY = Math.max(-1.0, centerY + RAIN_MIN_OFFSET_Y);
    const minZ = centerZ - RAIN_AREA_HALF_XZ;

    if (!this.rainSeedInitialized) {
      this.rainSeedInitialized = true;
      for (let i = 0; i < RAIN_DROP_COUNT; i += 1) {
        this.dropX[i] =
          minX + ((((this.dropX[i] - minX) % RAIN_AREA_SPAN_XZ) + RAIN_AREA_SPAN_XZ) % RAIN_AREA_SPAN_XZ);
        this.dropY[i] =
          minY + ((((this.dropY[i] - minY) % RAIN_AREA_SPAN_Y) + RAIN_AREA_SPAN_Y) % RAIN_AREA_SPAN_Y);
        this.dropZ[i] =
          minZ + ((((this.dropZ[i] - minZ) % RAIN_AREA_SPAN_XZ) + RAIN_AREA_SPAN_XZ) % RAIN_AREA_SPAN_XZ);
      }
    }

    const stepX = RAIN_WIND_X * dt;
    const stepZ = RAIN_WIND_Z * dt;
    const pos = this.rainPosArray;

    for (let i = 0; i < RAIN_DROP_COUNT; i += 1) {
      const spd = this.dropSpeed[i];
      let x = this.dropX[i] + stepX;
      let y = this.dropY[i] - spd * dt;
      let z = this.dropZ[i] + stepZ;

      // カメラ追従ラップ（160km/h 走行時でも途切れず一定密度を維持）
      if (x < minX || x >= minX + RAIN_AREA_SPAN_XZ) {
        x =
          minX +
          ((((x - minX) % RAIN_AREA_SPAN_XZ) + RAIN_AREA_SPAN_XZ) %
            RAIN_AREA_SPAN_XZ);
      }
      if (y < minY || y >= minY + RAIN_AREA_SPAN_Y) {
        y =
          minY +
          ((((y - minY) % RAIN_AREA_SPAN_Y) + RAIN_AREA_SPAN_Y) %
            RAIN_AREA_SPAN_Y);
      }
      if (z < minZ || z >= minZ + RAIN_AREA_SPAN_XZ) {
        z =
          minZ +
          ((((z - minZ) % RAIN_AREA_SPAN_XZ) + RAIN_AREA_SPAN_XZ) %
            RAIN_AREA_SPAN_XZ);
      }

      this.dropX[i] = x;
      this.dropY[i] = y;
      this.dropZ[i] = z;

      const streak = this.dropStreakScale[i];
      const base = i * 6;
      // 雨粒の下端
      pos[base] = x;
      pos[base + 1] = y;
      pos[base + 2] = z;
      // 雨粒の上端（風と落下速度に沿った細い筋）
      pos[base + 3] = x - RAIN_WIND_X * streak;
      pos[base + 4] = y + spd * streak;
      pos[base + 5] = z - RAIN_WIND_Z * streak;
    }

    this.rainPosAttr.needsUpdate = true;
  }

  public dispose(): void {
    // 破棄前に変更済みマテリアルを元の値へ復元
    this.updateWetMaterials(0);
    this.trackedWetMaterials.length = 0;
    this.trackedMatSet.clear();

    this.scene.remove(this.rainLines);
    this.rainGeo.dispose();
    this.rainMat.dispose();
  }
}
