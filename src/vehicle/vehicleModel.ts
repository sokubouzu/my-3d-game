import * as THREE from 'three';
import { getGltfLoader } from '../engine/loaders';
import {
  HERO_VEHICLE_CONFIG,
  type HeroVehicleConfig,
  type WheelSlot,
} from './vehicleConfig';
import { createVehicleLightRig } from './vehicleLights';
import { VehicleDamageVisualController } from './vehicleDamageVisuals';

export interface WheelRig {
  slot: WheelSlot;
  steerable: boolean;
  /** Y 軸周りでステアリング回転するピボット（車両ローカル空間） */
  steerPivot: THREE.Group;
  /** X 軸周りで前後回転するピボット（steerPivot の子、前進時 +X 回転） */
  spinPivot: THREE.Group;
  /** 実測タイヤ半径 (m) */
  radiusMeters: number;
  /** 実際にアタッチできたノード名一覧 */
  attachedNodes: string[];
}

export interface SteeringWheelRig {
  node: THREE.Object3D;
  baseQuaternion: THREE.Quaternion;
  ratio: number;
}

export interface VehicleRig {
  wheels: Record<WheelSlot, WheelRig | null>;
  steeringWheel: SteeringWheelRig | null;
  boundWheelCount: number;
}

export interface VehicleDimensions {
  width: number;
  height: number;
  length: number;
}

export interface LoadedHeroVehicle {
  config: HeroVehicleConfig;
  /** ワールド配置用ルート（position.y = 0 固定、+Z 正面） */
  root: THREE.Group;
  /** 車体バンク（ロール角）回転用グループ（root の子） */
  bodyGroup: THREE.Group;
  /** バイク乗車時のプレイヤー搭乗アンカー（bodyGroup の子としてバンクに追従） */
  riderAnchor: THREE.Group;
  /** 2-B の車輪回転・ステアリング制御用リグ */
  rig: VehicleRig;
  /** 5-B: 車体デフォーム（凹み）・擦り傷/煤・ライト破損の段階的損傷ビジュアル制御 */
  damageVisuals: VehicleDamageVisualController;
  /** スケール正規化後の実測寸法 (m) */
  dimensions: VehicleDimensions;
  /** 前輪ステアリング角（rad, 左=+ / 右=-）とハンドル回転を更新（2-B用フック） */
  setSteerAngle: (radians: number) => void;
  /** 全4輪の回転角を加算更新（rad, 前進=+）（2-B用フック） */
  addWheelSpin: (deltaRadians: number) => void;
  /** 車体のロール角（バンク演出、rad: 負=左傾き / 正=右傾き）を更新 */
  setLeanRoll: (radians: number) => void;
  /** ヘッドライト・テールランプの発光強度を更新（0=消灯, 0.8=夕方, 1.0=夜） */
  setLightsIntensity: (factor: number) => void;
  /** リソース破棄 */
  dispose: () => void;
}

const WHEEL_SLOTS: readonly WheelSlot[] = [
  'frontLeft',
  'frontRight',
  'rearLeft',
  'rearRight',
];
const LOCAL_Z_AXIS = new THREE.Vector3(0, 0, 1);

/**
 * 作業ID 2-A: 主役車両 GLB を読み込み、現実的スケール・正面向き(+Z)・厳密接地(Y=0)へ正規化し、
 * 作業ID 2-B で即座に車輪回転・ステアリング制御できるピボットリグを構築する。
 */
export async function loadHeroVehicle(
  maxAnisotropy: number,
  config: HeroVehicleConfig = HERO_VEHICLE_CONFIG,
): Promise<LoadedHeroVehicle> {
  const gltfLoader = getGltfLoader();
  const gltf = await gltfLoader.loadAsync(config.url);
  const model = gltf.scene;
  const anisotropy = Math.min(4, Math.max(1, maxAnisotropy));

  // 5-B2: 正規化・BBox 計測前に GLB 内の不要ノード（平面ベイク影プレーン等）を除去＆破棄
  if (config.excludeNodeNames && config.excludeNodeNames.length > 0) {
    const excludeSet = new Set(config.excludeNodeNames);
    const toRemove: THREE.Object3D[] = [];
    model.traverse((obj) => {
      if (excludeSet.has(obj.name)) {
        toRemove.push(obj);
      }
    });
    for (const target of toRemove) {
      target.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.geometry?.dispose();
        const mats = Array.isArray(child.material)
          ? child.material
          : [child.material];
        for (const mat of mats) {
          if (!mat) continue;
          const stdMat = mat as THREE.MeshStandardMaterial;
          stdMat.map?.dispose();
          stdMat.alphaMap?.dispose();
          mat.dispose();
        }
      });
      target.parent?.remove(target);
    }
  }

  // M1 iPad Air 向けテクスチャ異方性・シャドウ設定
  model.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.castShadow = config.castShadow;
    obj.receiveShadow = true;

    const materials = Array.isArray(obj.material)
      ? obj.material
      : [obj.material];
    for (const mat of materials) {
      if (!mat) continue;
      const stdMat = mat as THREE.MeshStandardMaterial;
      if (stdMat.map) stdMat.map.anisotropy = anisotropy;
      if (stdMat.normalMap) stdMat.normalMap.anisotropy = anisotropy;
      if (stdMat.roughnessMap) stdMat.roughnessMap.anisotropy = anisotropy;
    }
  });

  // 1. 元モデルのバウンディングボックス計測と全長スケーリング
  model.position.set(0, 0, 0);
  model.rotation.set(0, config.modelForwardCorrectionY, 0);
  model.scale.set(1, 1, 1);
  model.updateMatrixWorld(true);

  const rawBox = new THREE.Box3().setFromObject(model);
  const rawSize = rawBox.getSize(new THREE.Vector3());
  const rawLength = Math.max(rawSize.x, rawSize.z);
  const scale = rawLength > 0.0001 ? config.targetLengthMeters / rawLength : 1.0;

  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(model);
  const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
  const scaledSize = scaledBox.getSize(new THREE.Vector3());

  // 2. 水平中心を原点に揃え、底面を Y = 0 へ厳密接地
  model.position.set(-scaledCenter.x, -scaledBox.min.y, -scaledCenter.z);
  model.updateMatrixWorld(true);

  // 3. 空の親 Group（root: position.y = 0 固定、+Z 正面）配下にバンク用 bodyGroup と搭乗アンカーを構築
  const root = new THREE.Group();
  root.name = config.id;

  const bodyGroup = new THREE.Group();
  bodyGroup.name = `${config.id}_body_lean`;
  bodyGroup.add(model);

  const riderAnchor = new THREE.Group();
  riderAnchor.name = `${config.id}_rider_anchor`;
  bodyGroup.add(riderAnchor);

  root.add(bodyGroup);
  root.updateMatrixWorld(true);

  const rig = buildVehicleRig(bodyGroup, model, config);

  // 4. 初期ワールド座標・向きを設定（Y = 0 厳守）
  root.position.set(config.initialPosition.x, 0, config.initialPosition.z);
  root.rotation.set(0, config.initialRotationY, 0);
  root.updateMatrixWorld(true);

  const dimensions: VehicleDimensions = {
    width: scaledSize.x,
    height: config.bodyHeightOverrideMeters ?? scaledSize.y,
    length: scaledSize.z,
  };

  // 3-G / 5-B2 / 5-Fix2: ヘッドライト・テールランプ発光リグ（bodyGroup にアタッチしてバイクバンクにも追従）
  const lightRig = createVehicleLightRig(
    config.type,
    dimensions,
    config.lightLayout,
    model,
  );
  bodyGroup.add(lightRig.group);

  // 5-B: 車体局所デフォーム（凹み）・擦り傷/煤・ライト破損ビジュアル制御
  const damageVisuals = new VehicleDamageVisualController(
    bodyGroup,
    model,
    rig,
    lightRig,
    config.type,
    dimensions,
  );

  const tempSteerQuat = new THREE.Quaternion();

  const setSteerAngle = (radians: number): void => {
    for (const slot of WHEEL_SLOTS) {
      const wheel = rig.wheels[slot];
      if (wheel && wheel.steerable) {
        wheel.steerPivot.rotation.y = radians;
      }
    }
    if (rig.steeringWheel) {
      tempSteerQuat.setFromAxisAngle(
        LOCAL_Z_AXIS,
        radians * rig.steeringWheel.ratio,
      );
      rig.steeringWheel.node.quaternion
        .copy(rig.steeringWheel.baseQuaternion)
        .multiply(tempSteerQuat);
    }
  };

  const addWheelSpin = (deltaRadians: number): void => {
    for (const slot of WHEEL_SLOTS) {
      const wheel = rig.wheels[slot];
      if (wheel) {
        wheel.spinPivot.rotation.x += deltaRadians;
      }
    }
  };

  const setLeanRoll = (radians: number): void => {
    bodyGroup.rotation.z = radians;
  };

  const setLightsIntensity = (factor: number): void => {
    lightRig.setIntensity(factor);
  };

  const dispose = (): void => {
    damageVisuals.dispose();
    bodyGroup.remove(lightRig.group);
    lightRig.dispose();

    const disposedGeometries = new Set<THREE.BufferGeometry>();
    const disposedMaterials = new Set<THREE.Material>();
    const disposedTextures = new Set<THREE.Texture>();

    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (obj.geometry && !disposedGeometries.has(obj.geometry)) {
        disposedGeometries.add(obj.geometry);
        obj.geometry.dispose();
      }
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!mat || disposedMaterials.has(mat)) continue;
        disposedMaterials.add(mat);
        const stdMat = mat as THREE.MeshStandardMaterial;
        const maps: Array<THREE.Texture | null | undefined> = [
          stdMat.map,
          stdMat.normalMap,
          stdMat.roughnessMap,
          stdMat.metalnessMap,
          stdMat.emissiveMap,
          stdMat.aoMap,
          stdMat.alphaMap,
        ];
        for (const tex of maps) {
          if (tex && !disposedTextures.has(tex)) {
            disposedTextures.add(tex);
            tex.dispose();
          }
        }
        mat.dispose();
      }
    });
  };

  return {
    config,
    root,
    bodyGroup,
    riderAnchor,
    rig,
    damageVisuals,
    dimensions,
    setSteerAngle,
    addWheelSpin,
    setLeanRoll,
    setLightsIntensity,
    dispose,
  };
}

type WheelNodeBucket = Record<WheelSlot, THREE.Object3D[]>;

function createEmptyWheelBuckets(): WheelNodeBucket {
  return {
    frontLeft: [],
    frontRight: [],
    rearLeft: [],
    rearRight: [],
  };
}

function buildCompactedSubGeometry(
  source: THREE.BufferGeometry,
  triIndices: number[],
): THREE.BufferGeometry {
  const posAttr = source.getAttribute('position');
  const vertCount = posAttr.count;
  const remap = new Int32Array(vertCount);
  remap.fill(-1);
  const oldIndices: number[] = [];
  const newIndices = new Array<number>(triIndices.length);

  for (let i = 0; i < triIndices.length; i += 1) {
    const oldIdx = triIndices[i];
    let mapped = remap[oldIdx];
    if (mapped === -1) {
      mapped = oldIndices.length;
      remap[oldIdx] = mapped;
      oldIndices.push(oldIdx);
    }
    newIndices[i] = mapped;
  }

  const newVertCount = oldIndices.length;
  const out = new THREE.BufferGeometry();

  for (const attrName of Object.keys(source.attributes)) {
    const attr = source.attributes[attrName];
    const itemSize = attr.itemSize;
    const dst = new Float32Array(newVertCount * itemSize);

    if (
      !(attr instanceof THREE.InterleavedBufferAttribute) &&
      attr.array instanceof Float32Array
    ) {
      const srcArr = attr.array;
      for (let i = 0; i < newVertCount; i += 1) {
        const srcBase = oldIndices[i] * itemSize;
        const dstBase = i * itemSize;
        for (let k = 0; k < itemSize; k += 1) {
          dst[dstBase + k] = srcArr[srcBase + k];
        }
      }
      out.setAttribute(
        attrName,
        new THREE.BufferAttribute(dst, itemSize, attr.normalized),
      );
    } else {
      for (let i = 0; i < newVertCount; i += 1) {
        const srcIdx = oldIndices[i];
        const base = i * itemSize;
        if (itemSize >= 1) dst[base] = attr.getX(srcIdx);
        if (itemSize >= 2) dst[base + 1] = attr.getY(srcIdx);
        if (itemSize >= 3) dst[base + 2] = attr.getZ(srcIdx);
        if (itemSize >= 4) dst[base + 3] = attr.getW(srcIdx);
      }
      out.setAttribute(attrName, new THREE.BufferAttribute(dst, itemSize, false));
    }
  }

  const indexArr =
    newVertCount > 65535
      ? new Uint32Array(newIndices)
      : new Uint16Array(newIndices);
  out.setIndex(new THREE.BufferAttribute(indexArr, 1));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

/**
 * 5-Fix2: マテリアル単位で4輪（または片側2輪）が1メッシュへ結合された車両 GLB から、
 * 車両ローカル空間（+Z 前方 / +X 左）の象限ごとに頂点コンパクト分割した独立車輪メッシュを生成する。
 * 元の共有マテリアルはそのまま再利用し、元ジオメトリのみ破棄するため VRAM 増分はほぼゼロ。
 */
function splitMergedWheelMeshesIntoSlots(
  model: THREE.Object3D,
  config: HeroVehicleConfig,
): { spin: WheelNodeBucket; steerOnly: WheelNodeBucket } {
  const spin = createEmptyWheelBuckets();
  const steerOnly = createEmptyWheelBuckets();
  const splitCfg = config.splitMergedWheelMeshes;
  if (!splitCfg) {
    return { spin, steerOnly };
  }

  model.updateMatrixWorld(true);
  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();

  const processMeshList = (
    meshNames: readonly string[] | undefined,
    targetBucket: WheelNodeBucket,
  ): void => {
    if (!meshNames || meshNames.length === 0) return;

    for (const meshName of meshNames) {
      const obj = model.getObjectByName(meshName);
      if (!(obj instanceof THREE.Mesh) || !obj.parent) continue;
      const geo = obj.geometry;
      if (!(geo instanceof THREE.BufferGeometry)) continue;
      const posAttr = geo.getAttribute('position');
      if (!posAttr || posAttr.count === 0) continue;

      const worldMat = obj.matrixWorld;
      const indexAttr = geo.getIndex();
      const triCount = indexAttr
        ? Math.floor(indexAttr.count / 3)
        : Math.floor(posAttr.count / 3);

      const slotTris: Record<WheelSlot, number[]> = {
        frontLeft: [],
        frontRight: [],
        rearLeft: [],
        rearRight: [],
      };

      for (let t = 0; t < triCount; t += 1) {
        const i0 = indexAttr ? indexAttr.getX(t * 3) : t * 3;
        const i1 = indexAttr ? indexAttr.getX(t * 3 + 1) : t * 3 + 1;
        const i2 = indexAttr ? indexAttr.getX(t * 3 + 2) : t * 3 + 2;

        v0.fromBufferAttribute(posAttr, i0).applyMatrix4(worldMat);
        v1.fromBufferAttribute(posAttr, i1).applyMatrix4(worldMat);
        v2.fromBufferAttribute(posAttr, i2).applyMatrix4(worldMat);

        const cx = (v0.x + v1.x + v2.x) / 3;
        const cz = (v0.z + v1.z + v2.z) / 3;
        const slot: WheelSlot =
          cz >= 0
            ? cx >= 0
              ? 'frontLeft'
              : 'frontRight'
            : cx >= 0
              ? 'rearLeft'
              : 'rearRight';
        slotTris[slot].push(i0, i1, i2);
      }

      const parent = obj.parent;
      let createdAny = false;
      for (const slot of WHEEL_SLOTS) {
        const tris = slotTris[slot];
        if (tris.length === 0) continue;
        const subGeo = buildCompactedSubGeometry(geo, tris);
        const subMesh = new THREE.Mesh(subGeo, obj.material);
        subMesh.name = `${obj.name}__${slot}`;
        subMesh.position.copy(obj.position);
        subMesh.quaternion.copy(obj.quaternion);
        subMesh.scale.copy(obj.scale);
        subMesh.castShadow = obj.castShadow;
        subMesh.receiveShadow = obj.receiveShadow;
        parent.add(subMesh);
        targetBucket[slot].push(subMesh);
        createdAny = true;
      }

      if (createdAny) {
        parent.remove(obj);
        geo.dispose();
      }
    }
  };

  processMeshList(splitCfg.spinMeshNames, spin);
  processMeshList(splitCfg.steerOnlyMeshNames, steerOnly);
  model.updateMatrixWorld(true);
  return { spin, steerOnly };
}

/**
 * 車両 GLB 内の独立ノード（4輪・ブレーキ・ステアリング）を検索し、
 * 車両ローカル空間（+Z 前方 / +X 左 / +Y 上）で素直に回転できるピボット階層へ組み替える。
 */
function buildVehicleRig(
  root: THREE.Group,
  model: THREE.Object3D,
  config: HeroVehicleConfig,
): VehicleRig {
  const splitBuckets = splitMergedWheelMeshesIntoSlots(model, config);

  const wheels: Record<WheelSlot, WheelRig | null> = {
    frontLeft: null,
    frontRight: null,
    rearLeft: null,
    rearRight: null,
  };
  let boundWheelCount = 0;

  for (const slot of WHEEL_SLOTS) {
    const binding = config.wheels[slot];
    const spinNodes: THREE.Object3D[] = [...splitBuckets.spin[slot]];
    const steerOnlyNodes: THREE.Object3D[] = [...splitBuckets.steerOnly[slot]];

    for (const name of binding.spinNodeNames) {
      const found = model.getObjectByName(name);
      if (found) spinNodes.push(found);
    }
    for (const name of binding.steerOnlyNodeNames) {
      const found = model.getObjectByName(name);
      if (found) steerOnlyNodes.push(found);
    }

    if (spinNodes.length === 0) {
      continue;
    }

    // タイヤ・リム群のワールド空間バウンディングボックスから車輪中心と半径を計測
    const wheelBox = new THREE.Box3();
    for (const node of spinNodes) {
      wheelBox.expandByObject(node);
    }
    if (wheelBox.isEmpty()) {
      continue;
    }

    const wheelCenter = wheelBox.getCenter(new THREE.Vector3());
    const wheelSize = wheelBox.getSize(new THREE.Vector3());
    const radiusMeters = Math.max(0.15, wheelSize.y * 0.5);

    const steerPivot = new THREE.Group();
    steerPivot.name = `wheel_${slot}_steerPivot`;
    steerPivot.position.copy(wheelCenter);

    const spinPivot = new THREE.Group();
    spinPivot.name = `wheel_${slot}_spinPivot`;
    steerPivot.add(spinPivot);

    root.add(steerPivot);
    root.updateMatrixWorld(true);

    const attachedNodes: string[] = [];
    if (binding.initialYawCorrection && binding.initialYawCorrection !== 0) {
      // 元モデルでステアリングを切った状態の車輪を、spinPivot 内部で直進姿勢へ補正する
      const alignGroup = new THREE.Group();
      alignGroup.name = `wheel_${slot}_align`;
      spinPivot.add(alignGroup);
      alignGroup.updateMatrixWorld(true);
      for (const node of spinNodes) {
        alignGroup.attach(node);
        attachedNodes.push(node.name);
      }
      alignGroup.rotation.y = binding.initialYawCorrection;
      alignGroup.updateMatrixWorld(true);
    } else {
      for (const node of spinNodes) {
        spinPivot.attach(node);
        attachedNodes.push(node.name);
      }
    }
    for (const node of steerOnlyNodes) {
      steerPivot.attach(node);
      attachedNodes.push(node.name);
    }

    wheels[slot] = {
      slot,
      steerable: binding.steerable,
      steerPivot,
      spinPivot,
      radiusMeters,
      attachedNodes,
    };
    boundWheelCount += 1;
  }

  let steeringWheel: SteeringWheelRig | null = null;
  if (config.steeringWheelNodeName) {
    const steerNode = model.getObjectByName(config.steeringWheelNodeName);
    if (steerNode) {
      steeringWheel = {
        node: steerNode,
        baseQuaternion: steerNode.quaternion.clone(),
        ratio: config.steeringWheelRatio,
      };
    }
  }

  return {
    wheels,
    steeringWheel,
    boundWheelCount,
  };
}
