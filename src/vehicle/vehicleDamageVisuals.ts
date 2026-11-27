import * as THREE from 'three';
import type { VehicleType } from './vehicleConfig';
import type { VehicleLightRig } from './vehicleLights';
import type { VehicleDimensions, VehicleRig } from './vehicleModel';

interface DeformableMeshRecord {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  posAttr: THREE.BufferAttribute;
  normAttr: THREE.BufferAttribute | null;
  /** 初期ローカル頂点座標（完全復元用） */
  originalPositions: Float32Array;
  /** 初期ローカル法線（完全復元用） */
  originalNormals: Float32Array | null;
  /** 初期頂点の bodyGroup ローカル座標（メートル単位の高速距離判定用） */
  bodyPositions: Float32Array;
  /** bodyGroup ローカル空間での累積凹み変位 (dx, dy, dz) */
  bodyDisplacements: Float32Array;
  /** bodyGroup ローカル変位ベクトル -> mesh ローカル変位ベクトルへの線形変換 (3x3) */
  bodyToMeshLinear: THREE.Matrix3;
  /** 頂点ごとの変位ウェイト（ガラス・底面足回りを抑える） */
  vertexWeightScale: number;
  isDeformed: boolean;
}

interface TrackedDamageMaterial {
  mat: THREE.MeshStandardMaterial;
  isTire: boolean;
  isGlass: boolean;
  baseColor: THREE.Color;
  baseRoughness: number;
  baseMetalness: number;
  baseEnvMapIntensity: number;
  baseEmissive: THREE.Color;
  baseEmissiveIntensity: number;
  baseTransparent: boolean;
  baseOpacity: number;
  baseDepthWrite: boolean;
}

interface ScuffPatch {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  active: boolean;
  baseOpacity: number;
}

const TIRE_PATTERN = /(tire|tyre|rubber|tread|wheel)/i;
const GLASS_PATTERN = /(glass|window|windshield|kaca|cristal|lens)/i;
const CLEARCOAT_PATTERN = /(^coat$|clearcoat|lacquer)/i;

const SOOT_COLOR = new THREE.Color(0x2d2926);
const CHARRED_COLOR = new THREE.Color(0x1b1918);
const EMBER_COLOR = new THREE.Color(0x9a2606);
const SCRATCH_COLOR = new THREE.Color();

const MAX_SCUFF_PATCHES = 5;

let sharedScuffTexture: THREE.CanvasTexture | null = null;
let sharedScuffTexRefCount = 0;

function acquireScuffTexture(): THREE.CanvasTexture {
  if (!sharedScuffTexture) {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, size, size);

      // 柔らかい煤（すす）グラデーションベース
      const radGrad = ctx.createRadialGradient(
        size * 0.5,
        size * 0.5,
        size * 0.08,
        size * 0.5,
        size * 0.5,
        size * 0.48,
      );
      radGrad.addColorStop(0, 'rgba(20, 18, 17, 0.88)');
      radGrad.addColorStop(0.55, 'rgba(32, 28, 25, 0.52)');
      radGrad.addColorStop(1, 'rgba(32, 28, 25, 0.0)');
      ctx.fillStyle = radGrad;
      ctx.fillRect(0, 0, size, size);

      // 金属の下地がわずかに覗く擦り傷スクラッチ線
      let seed = 48271;
      const rand = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };
      ctx.lineCap = 'round';
      for (let i = 0; i < 28; i += 1) {
        const cx = size * (0.22 + rand() * 0.56);
        const cy = size * (0.24 + rand() * 0.52);
        const len = size * (0.12 + rand() * 0.28);
        const angle = (rand() - 0.5) * 0.65;
        const dx = Math.cos(angle) * len * 0.5;
        const dy = Math.sin(angle) * len * 0.5;
        ctx.strokeStyle =
          i % 3 === 0
            ? `rgba(176, 182, 190, ${0.25 + rand() * 0.35})`
            : `rgba(16, 15, 14, ${0.38 + rand() * 0.35})`;
        ctx.lineWidth = 1.0 + rand() * 2.4;
        ctx.beginPath();
        ctx.moveTo(cx - dx, cy - dy);
        ctx.lineTo(cx + dx, cy + dy);
        ctx.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    sharedScuffTexture = tex;
  }
  sharedScuffTexRefCount += 1;
  return sharedScuffTexture;
}

function releaseScuffTexture(): void {
  sharedScuffTexRefCount = Math.max(0, sharedScuffTexRefCount - 1);
  if (sharedScuffTexRefCount === 0 && sharedScuffTexture) {
    sharedScuffTexture.dispose();
    sharedScuffTexture = null;
  }
}

/**
 * PHASE 5-B / 5-B2: 車両ごとの段階的損傷ビジュアルコントローラー。
 * - 車体ボディ頂点の局所デフォーム（凹み）＆初期頂点配列からの完全復元
 * - 損傷度＋雨濡れ質感（5-A）の競合なし合成（擦り傷・煤・黒焦げ・鎮火フェードアウト）
 * - 衝突面の軽量擦り傷/煤パッチデカール
 * - 片側ヘッドライトの破損点滅・消灯（VehicleLightRig 連携）
 */
export class VehicleDamageVisualController {
  private readonly bodyGroup: THREE.Group;
  private readonly lightRig: VehicleLightRig;
  private readonly vehicleType: VehicleType;
  private readonly dimensions: VehicleDimensions;

  private readonly deformables: DeformableMeshRecord[] = [];
  private readonly trackedMaterials: TrackedDamageMaterial[] = [];
  private readonly scuffGroup: THREE.Group;
  private readonly scuffGeo: THREE.PlaneGeometry;
  private readonly scuffPatches: ScuffPatch[] = [];
  private nextScuffSlot = 0;

  private brokenHeadlightSide: 'left' | 'right' = 'left';
  private flickerPhase = 0;
  private lastHeadSpotMul = 1;
  private lastSurfaceKey = '';
  private isFadingWreck = false;

  private readonly scratchVec = new THREE.Vector3();
  private readonly scratchInvBody = new THREE.Matrix4();
  private readonly scratchMeshToBody = new THREE.Matrix4();
  private readonly scratchBodyToMesh = new THREE.Matrix4();

  constructor(
    bodyGroup: THREE.Group,
    model: THREE.Object3D,
    rig: VehicleRig,
    lightRig: VehicleLightRig,
    vehicleType: VehicleType,
    dimensions: VehicleDimensions,
  ) {
    this.bodyGroup = bodyGroup;
    this.lightRig = lightRig;
    this.vehicleType = vehicleType;
    this.dimensions = dimensions;

    // ホイール配下ノードを収集し、回転するタイヤ・リムをデフォーム対象から除外
    const wheelNodeSet = new Set<THREE.Object3D>();
    for (const slot of ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'] as const) {
      const wheel = rig.wheels[slot];
      if (!wheel) continue;
      wheel.steerPivot.traverse((o) => wheelNodeSet.add(o));
    }

    bodyGroup.updateMatrixWorld(true);
    this.scratchInvBody.copy(bodyGroup.matrixWorld).invert();

    const seenGeometries = new Set<THREE.BufferGeometry>();
    const seenMaterials = new Set<THREE.MeshStandardMaterial>();
    const localV = new THREE.Vector3();

    model.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (obj.parent && this.isInsideGroup(obj, lightRig.group)) return;

      // マテリアルを傷・煤・雨濡れ合成対象として登録
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      let hasGlassMat = false;
      for (const m of mats) {
        if (!(m instanceof THREE.MeshStandardMaterial)) continue;
        if (m.blending === THREE.AdditiveBlending || m.emissiveIntensity > 1.2) {
          continue;
        }
        // 5-B2: スポーツカー等のクリアコート層 (coat) はボディ塗装と 1:1 で同時変形させる
        const isClearCoat = CLEARCOAT_PATTERN.test(m.name);
        const isGlass =
          !isClearCoat &&
          (Boolean(m.transparent && m.opacity < 0.85) ||
            GLASS_PATTERN.test(m.name) ||
            GLASS_PATTERN.test(obj.name));
        if (isGlass) hasGlassMat = true;

        if (!seenMaterials.has(m)) {
          seenMaterials.add(m);
          const isTire =
            wheelNodeSet.has(obj) ||
            TIRE_PATTERN.test(m.name) ||
            TIRE_PATTERN.test(obj.name);
          this.trackedMaterials.push({
            mat: m,
            isTire,
            isGlass,
            baseColor: m.color.clone(),
            baseRoughness: m.roughness,
            baseMetalness: m.metalness,
            baseEnvMapIntensity: m.envMapIntensity,
            baseEmissive: m.emissive.clone(),
            baseEmissiveIntensity: m.emissiveIntensity,
            baseTransparent: m.transparent,
            baseOpacity: m.opacity,
            baseDepthWrite: m.depthWrite,
          });
        }
      }

      // 車輪ノードはデフォーム除外（回転時のガタつき防止）
      if (wheelNodeSet.has(obj)) return;

      let geo = obj.geometry;
      if (!(geo instanceof THREE.BufferGeometry)) return;
      const posAttrRaw = geo.getAttribute('position');
      if (!(posAttrRaw instanceof THREE.BufferAttribute)) return;

      // 他メッシュとジオメトリを共有している場合は安全のためクローン
      if (seenGeometries.has(geo)) {
        geo = geo.clone();
        obj.geometry = geo;
      }
      seenGeometries.add(geo);

      const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
      const normAttrRaw = geo.getAttribute('normal');
      const normAttr =
        normAttrRaw instanceof THREE.BufferAttribute ? normAttrRaw : null;

      const originalPositions = new Float32Array(posAttr.array as ArrayLike<number>);
      const originalNormals = normAttr
        ? new Float32Array(normAttr.array as ArrayLike<number>)
        : null;

      // mesh ローカル <-> bodyGroup ローカルの固定変換行列をキャッシュ
      this.scratchMeshToBody.multiplyMatrices(this.scratchInvBody, obj.matrixWorld);
      this.scratchBodyToMesh.copy(this.scratchMeshToBody).invert();
      const bodyToMeshLinear = new THREE.Matrix3().setFromMatrix4(
        this.scratchBodyToMesh,
      );

      const count = posAttr.count;
      const bodyPositions = new Float32Array(count * 3);
      for (let i = 0; i < count; i += 1) {
        localV.fromBufferAttribute(posAttr, i).applyMatrix4(this.scratchMeshToBody);
        const idx = i * 3;
        bodyPositions[idx] = localV.x;
        bodyPositions[idx + 1] = localV.y;
        bodyPositions[idx + 2] = localV.z;
      }

      this.deformables.push({
        mesh: obj,
        geometry: geo,
        posAttr,
        normAttr,
        originalPositions,
        originalNormals,
        bodyPositions,
        bodyDisplacements: new Float32Array(count * 3),
        bodyToMeshLinear,
        vertexWeightScale: hasGlassMat ? 0.35 : 1.0,
        isDeformed: false,
      });
    });

    // 衝突箇所に貼る軽量な擦り傷・煤オーバーレイパッチ（プール方式、castShadow=false）
    this.scuffGroup = new THREE.Group();
    this.scuffGroup.name = 'VehicleScuffPatches';
    this.scuffGeo = new THREE.PlaneGeometry(1, 1);
    const scuffTex = acquireScuffTexture();

    for (let i = 0; i < MAX_SCUFF_PATCHES; i += 1) {
      const mat = new THREE.MeshBasicMaterial({
        map: scuffTex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
        side: THREE.DoubleSide,
      });
      const patchMesh = new THREE.Mesh(this.scuffGeo, mat);
      patchMesh.castShadow = false;
      patchMesh.receiveShadow = false;
      patchMesh.visible = false;
      this.scuffGroup.add(patchMesh);
      this.scuffPatches.push({
        mesh: patchMesh,
        mat,
        active: false,
        baseOpacity: 0,
      });
    }
    this.bodyGroup.add(this.scuffGroup);
  }

  private isInsideGroup(obj: THREE.Object3D, ancestor: THREE.Object3D): boolean {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      if (cur === ancestor) return true;
      cur = cur.parent;
    }
    return false;
  }

  /**
   * 衝突ポイントを車両ローカル座標（bodyGroup 基準、+Z 前方 / +X 左 / +Y 上）で受け取り、
   * 周辺ボディ頂点を衝撃方向へ局所デフォーム（凹み）させ、擦り傷・煤パッチを配置する。
   */
  public applyImpactDent(
    localPointX: number,
    localPointY: number,
    localPointZ: number,
    localPushDirX: number,
    localPushDirZ: number,
    intensity01: number,
  ): void {
    const clamped = Math.max(0.08, Math.min(1, intensity01));
    const isBike = this.vehicleType === 'bike';

    // 前方衝突時はぶつけた側のヘッドライトを優先破損対象として記憶
    if (localPointZ > 0) {
      this.brokenHeadlightSide = localPointX >= 0 ? 'left' : 'right';
    }

    const dentRadius = isBike
      ? 0.42 + clamped * 0.34
      : 0.78 + clamped * 0.56;
    const dentDepth = isBike
      ? 0.03 + clamped * 0.075
      : 0.055 + clamped * 0.165;
    const maxTotalDent = isBike ? 0.13 : 0.26;
    const radiusSq = dentRadius * dentRadius;
    const minDeformY = isBike ? 0.34 : 0.16;

    // 衝撃押し込み方向（車体中心側へわずかに寄せる＋わずかな上方めくれ）
    const dirLen = Math.hypot(localPushDirX, localPushDirZ);
    const pushX = dirLen > 1e-4 ? localPushDirX / dirLen : 0;
    const pushZ = dirLen > 1e-4 ? localPushDirZ / dirLen : -1;
    const pushY = 0.14;

    const localDisp = this.scratchVec;

    for (let m = 0; m < this.deformables.length; m += 1) {
      const rec = this.deformables[m];
      const bPos = rec.bodyPositions;
      const bDisp = rec.bodyDisplacements;
      const orig = rec.originalPositions;
      const arr = rec.posAttr.array as Float32Array;
      const count = rec.posAttr.count;
      let touched = false;

      for (let i = 0; i < count; i += 1) {
        const idx = i * 3;
        const bx = bPos[idx] + bDisp[idx];
        const by = bPos[idx + 1] + bDisp[idx + 1];
        const bz = bPos[idx + 2] + bDisp[idx + 2];

        // 地面すれすれの下部足回りは歪ませない
        if (by < minDeformY) continue;

        const dx = bx - localPointX;
        const dy = (by - localPointY) * 0.85;
        const dz = bz - localPointZ;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq >= radiusSq) continue;

        const dist = Math.sqrt(distSq);
        const falloff = 0.5 + 0.5 * Math.cos((Math.PI * dist) / dentRadius);
        const heightGuard = Math.min(1, (by - minDeformY) / 0.25);
        // 決定論的な微細しわ（メタリックの歪み感）
        const crinkle =
          0.84 + 0.32 * Math.sin(bx * 19.7 + by * 23.1 + bz * 17.3);
        const mag =
          dentDepth * falloff * heightGuard * rec.vertexWeightScale * crinkle;

        let nx = bDisp[idx] + pushX * mag;
        let ny = bDisp[idx + 1] + pushY * mag * 0.55;
        let nz = bDisp[idx + 2] + pushZ * mag;

        // 累積凹み量をクランプしてメッシュの裏返り・突き抜けを防止
        const totalMag = Math.hypot(nx, ny, nz);
        if (totalMag > maxTotalDent) {
          const s = maxTotalDent / totalMag;
          nx *= s;
          ny *= s;
          nz *= s;
        }

        bDisp[idx] = nx;
        bDisp[idx + 1] = ny;
        bDisp[idx + 2] = nz;

        // bodyGroup ローカル変位 -> mesh ローカル変位へ変換して頂点更新
        localDisp.set(nx, ny, nz).applyMatrix3(rec.bodyToMeshLinear);
        arr[idx] = orig[idx] + localDisp.x;
        arr[idx + 1] = orig[idx + 1] + localDisp.y;
        arr[idx + 2] = orig[idx + 2] + localDisp.z;
        touched = true;
      }

      if (touched) {
        rec.isDeformed = true;
        rec.posAttr.needsUpdate = true;
        rec.geometry.computeVertexNormals();
        rec.geometry.computeBoundingSphere();
      }
    }

    // 衝突箇所付近のボディ表面に擦り傷・煤デカールパッチを配置
    this.placeScuffPatch(
      localPointX,
      localPointY,
      localPointZ,
      pushX,
      pushZ,
      clamped,
    );
  }

  /**
   * 爆発時: 全方向から激しい爆風凹みを加えて大破ボディを演出する。
   */
  public applyExplosionWreckDeformation(): void {
    const hw = this.dimensions.width * 0.45;
    const hh = this.dimensions.height * 0.55;
    const hl = this.dimensions.length * 0.42;
    this.applyImpactDent(0, hh, hl, 0, -1, 0.95);
    this.applyImpactDent(hw, hh * 0.9, hl * 0.35, -1, -0.3, 0.72);
    this.applyImpactDent(-hw, hh * 0.9, -hl * 0.25, 1, 0.2, 0.68);
  }

  private placeScuffPatch(
    localX: number,
    localY: number,
    localZ: number,
    pushX: number,
    pushZ: number,
    intensity01: number,
  ): void {
    const slot = this.scuffPatches[this.nextScuffSlot];
    this.nextScuffSlot = (this.nextScuffSlot + 1) % MAX_SCUFF_PATCHES;

    const hw = this.dimensions.width * 0.5;
    const hh = this.dimensions.height;
    const hl = this.dimensions.length * 0.5;
    const isBike = this.vehicleType === 'bike';

    // 衝突面法線（外向き = -push）に沿って車体表面ギリギリに貼る（曲面フェンダーから浮きにくい範囲にクランプ）
    const outX = -pushX;
    const outZ = -pushZ;
    const clampedX = Math.max(-hw * 0.86, Math.min(hw * 0.86, localX));
    const clampedY = Math.max(hh * 0.26, Math.min(hh * 0.74, localY));
    const clampedZ = Math.max(-hl * 0.86, Math.min(hl * 0.86, localZ));

    const patchSize = isBike
      ? 0.24 + intensity01 * 0.24
      : 0.44 + intensity01 * 0.48;

    slot.mesh.position.set(
      clampedX + outX * 0.028,
      clampedY,
      clampedZ + outZ * 0.028,
    );
    // 表面外向きへ回転
    const yaw = Math.atan2(outX, outZ);
    slot.mesh.rotation.set(0, yaw, (Math.random() - 0.5) * 0.6);
    slot.mesh.scale.set(patchSize * 1.2, patchSize * 0.82, 1);
    slot.baseOpacity = Math.min(0.82, 0.32 + intensity01 * 0.5);
    slot.mat.opacity = slot.baseOpacity;
    slot.active = true;
    slot.mesh.visible = true;
  }

  /**
   * 毎フレーム更新:
   * - 損傷度（擦り傷・煤・黒焦げ・鎮火フェードアウト）と天候の雨濡れ（rainAmount）を競合なく合成
   * - 中破〜重破のヘッドライト点滅・片側消灯・全損消灯を更新
   * - 前方 SpotLight へ反映する実効ヘッドライト倍率 (0..1) を返す
   */
  public update(
    dt: number,
    hpRatio: number,
    isBurning: boolean,
    isWrecked: boolean,
    rainAmount: number,
    wreckFireIntensity = 0,
    wreckFadeOpacity = 1,
  ): number {
    const damageRatio = 1 - Math.max(0, Math.min(1, hpRatio));
    const clampedFire = Math.max(0, Math.min(1, wreckFireIntensity));
    const clampedFade = isWrecked ? Math.max(0, Math.min(1, wreckFadeOpacity)) : 1;

    // 1. ボディマテリアル（雨濡れ + 擦り傷/煤/黒焦げ/残骸フェード）の更新（変化時のみ実行）
    const surfaceKey = `${Math.round(damageRatio * 40)}_${isBurning ? 1 : 0}_${isWrecked ? 1 : 0}_${Math.round(rainAmount * 40)}_${Math.round(clampedFire * 20)}_${Math.round(clampedFade * 30)}`;
    if (surfaceKey !== this.lastSurfaceKey) {
      this.lastSurfaceKey = surfaceKey;
      this.applySurfaceMaterials(
        damageRatio,
        isBurning,
        isWrecked,
        rainAmount,
        clampedFire,
        clampedFade,
      );
    }

    // 2. ヘッドライト破損・チカチカ点滅・消灯ロジック
    this.flickerPhase += dt;
    let leftMul = 1;
    let rightMul = 1;
    let tailMul = 1;

    if (isWrecked || isBurning) {
      leftMul = 0;
      rightMul = 0;
      tailMul = isBurning ? (Math.sin(this.flickerPhase * 28) > 0.2 ? 0.45 : 0) : 0;
    } else if (hpRatio <= 0.35) {
      // 重破: 片側完全消灯、もう片側も不安定にチカチカ点滅
      const t = this.flickerPhase;
      const wave =
        Math.sin(t * 27.3) * 0.5 +
        Math.sin(t * 43.1) * 0.35 +
        Math.sin(t * 11.7) * 0.15;
      const unstable = wave > -0.22 ? 0.72 + Math.max(0, wave) * 0.28 : 0.08;
      if (this.brokenHeadlightSide === 'left') {
        leftMul = 0;
        rightMul = unstable;
      } else {
        leftMul = unstable;
        rightMul = 0;
      }
      tailMul = 0.65;
    } else if (hpRatio <= 0.62) {
      // 中破: 片側のヘッドライトがチカチカ点滅・断続消灯
      const t = this.flickerPhase;
      const flickerWave =
        Math.sin(t * 23.0) * 0.55 + Math.sin(t * 37.7) * 0.45;
      const brokenFlicker = flickerWave > 0.18 ? 0.85 : flickerWave > -0.25 ? 0.2 : 0;
      if (this.brokenHeadlightSide === 'left') {
        leftMul = brokenFlicker;
        rightMul = 1;
      } else {
        leftMul = 1;
        rightMul = brokenFlicker;
      }
      tailMul = 0.92;
    }

    this.lightRig.setDamageMultipliers(leftMul, rightMul, tailMul);
    this.lastHeadSpotMul = (leftMul + rightMul) * 0.5;
    return this.lastHeadSpotMul;
  }

  public getHeadlightSpotMultiplier(): number {
    return this.lastHeadSpotMul;
  }

  private applySurfaceMaterials(
    damageRatio: number,
    isBurning: boolean,
    isWrecked: boolean,
    rainAmount: number,
    wreckFireIntensity: number,
    wreckFadeOpacity: number,
  ): void {
    const wet = Math.max(0, Math.min(1, rainAmount));
    // 軽傷は 0.15 以降から徐々に傷・煤が目立ち始める
    const scuffFactor = Math.max(0, Math.min(1, (damageRatio - 0.12) / 0.88));
    const shouldFade = isWrecked && wreckFadeOpacity < 0.995;
    const fadeModeChanged = shouldFade !== this.isFadingWreck;
    this.isFadingWreck = shouldFade;

    for (let i = 0; i < this.trackedMaterials.length; i += 1) {
      const entry = this.trackedMaterials[i];
      const mat = entry.mat;

      if (shouldFade) {
        if (!mat.transparent) {
          mat.transparent = true;
          mat.needsUpdate = true;
        }
        mat.depthWrite = false;
        mat.opacity = entry.baseOpacity * wreckFadeOpacity;
      } else if (fadeModeChanged) {
        if (mat.transparent !== entry.baseTransparent) {
          mat.transparent = entry.baseTransparent;
          mat.needsUpdate = true;
        }
        mat.depthWrite = entry.baseDepthWrite;
        mat.opacity = entry.baseOpacity;
      }

      if (isWrecked) {
        // 全損黒焦げ残骸（炎上継続中は高温の赤熱グロー、鎮火に向けて黒炭化）
        mat.color.copy(entry.baseColor).lerp(CHARRED_COLOR, entry.isGlass ? 0.82 : 0.91);
        mat.roughness = Math.min(0.96, Math.max(0.86, entry.baseRoughness + 0.58));
        mat.metalness = Math.min(entry.baseMetalness, 0.1);
        mat.envMapIntensity = Math.min(entry.baseEnvMapIntensity, 0.3);
        if (!entry.isTire && !entry.isGlass && wreckFireIntensity > 0.02) {
          mat.emissive.copy(entry.baseEmissive).lerp(EMBER_COLOR, wreckFireIntensity * 0.72);
          mat.emissiveIntensity = Math.max(
            entry.baseEmissiveIntensity,
            wreckFireIntensity * 0.68,
          );
        } else {
          mat.emissive.copy(entry.baseEmissive);
          mat.emissiveIntensity = entry.baseEmissiveIntensity;
        }
        continue;
      }

      // 1. 天候の濡れベース
      const desiredWetRough = entry.isTire ? 0.35 : 0.22;
      const wetRoughTarget = Math.min(entry.baseRoughness, desiredWetRough);
      const wetEnvTarget = Math.max(
        entry.baseEnvMapIntensity,
        entry.isTire ? 1.15 : 1.38,
      );

      let roughness =
        entry.baseRoughness + (wetRoughTarget - entry.baseRoughness) * wet;
      let envIntensity =
        entry.baseEnvMapIntensity + (wetEnvTarget - entry.baseEnvMapIntensity) * wet;

      // 2. 損傷による擦り傷・煤の合成（濡れ艶を損ない、表面をザラつかせて暗く汚す）
      const sootBlend = isBurning
        ? 0.68
        : scuffFactor * (entry.isGlass ? 0.26 : entry.isTire ? 0.2 : 0.48);

      SCRATCH_COLOR.copy(entry.baseColor).lerp(SOOT_COLOR, sootBlend);
      mat.color.copy(SCRATCH_COLOR);

      const roughBoost = isBurning
        ? 0.48
        : scuffFactor * (entry.isGlass ? 0.35 : 0.48);
      roughness = Math.min(0.95, roughness + roughBoost * (1 - wet * 0.25));
      envIntensity = Math.max(0.35, envIntensity * (1 - scuffFactor * 0.45));

      mat.roughness = roughness;
      mat.metalness = entry.baseMetalness * (1 - scuffFactor * 0.35);
      mat.envMapIntensity = envIntensity;

      if (isBurning && !entry.isTire && !entry.isGlass) {
        const glow = 0.32 + wreckFireIntensity * 0.36;
        mat.emissive.copy(entry.baseEmissive).lerp(EMBER_COLOR, glow);
        mat.emissiveIntensity = Math.max(entry.baseEmissiveIntensity, glow);
      } else {
        mat.emissive.copy(entry.baseEmissive);
        mat.emissiveIntensity = entry.baseEmissiveIntensity;
      }
    }

    // 煤パッチの濃さも損傷度・残骸フェードに合わせて同期
    for (let i = 0; i < this.scuffPatches.length; i += 1) {
      const p = this.scuffPatches[i];
      if (!p.active) continue;
      const baseAlpha = isWrecked
        ? Math.min(0.92, p.baseOpacity + 0.3)
        : Math.min(0.85, p.baseOpacity + scuffFactor * 0.25);
      p.mat.opacity = baseAlpha * wreckFadeOpacity;
    }
  }

  /**
   * リスポーン時: すべての頂点凹み・擦り傷/煤パッチ・マテリアル・ライトを新品状態へ完全復元する。
   */
  public reset(rainAmount = 0): void {
    for (let i = 0; i < this.deformables.length; i += 1) {
      const rec = this.deformables[i];
      if (!rec.isDeformed) continue;
      (rec.posAttr.array as Float32Array).set(rec.originalPositions);
      rec.posAttr.needsUpdate = true;
      if (rec.normAttr && rec.originalNormals) {
        (rec.normAttr.array as Float32Array).set(rec.originalNormals);
        rec.normAttr.needsUpdate = true;
      } else {
        rec.geometry.computeVertexNormals();
      }
      rec.geometry.computeBoundingSphere();
      rec.bodyDisplacements.fill(0);
      rec.isDeformed = false;
    }

    for (let i = 0; i < this.scuffPatches.length; i += 1) {
      const p = this.scuffPatches[i];
      p.active = false;
      p.baseOpacity = 0;
      p.mat.opacity = 0;
      p.mesh.visible = false;
    }

    // 残骸フェードアウトで変更した透明フラグを確実に初期状態へ復元
    for (let i = 0; i < this.trackedMaterials.length; i += 1) {
      const entry = this.trackedMaterials[i];
      const mat = entry.mat;
      if (mat.transparent !== entry.baseTransparent) {
        mat.transparent = entry.baseTransparent;
        mat.needsUpdate = true;
      }
      mat.depthWrite = entry.baseDepthWrite;
      mat.opacity = entry.baseOpacity;
    }
    this.isFadingWreck = false;

    this.nextScuffSlot = 0;
    this.brokenHeadlightSide = 'left';
    this.lastHeadSpotMul = 1;
    this.lastSurfaceKey = '';

    this.applySurfaceMaterials(0, false, false, rainAmount, 0, 1);
    this.lightRig.setDamageMultipliers(1, 1, 1);
  }

  public dispose(): void {
    this.reset(0);
    this.bodyGroup.remove(this.scuffGroup);
    this.scuffGeo.dispose();
    for (const p of this.scuffPatches) {
      p.mat.dispose();
    }
    this.scuffPatches.length = 0;
    releaseScuffTexture();
    this.deformables.length = 0;
    this.trackedMaterials.length = 0;
  }
}
