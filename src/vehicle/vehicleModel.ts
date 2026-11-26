import * as THREE from 'three';
import { getGltfLoader } from '../engine/loaders';
import {
  HERO_VEHICLE_CONFIG,
  type HeroVehicleConfig,
  type WheelSlot,
} from './vehicleConfig';

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
  /** 2-B の車輪回転・ステアリング制御用リグ */
  rig: VehicleRig;
  /** スケール正規化後の実測寸法 (m) */
  dimensions: VehicleDimensions;
  /** 前輪ステアリング角（rad, 左=+ / 右=-）とハンドル回転を更新（2-B用フック） */
  setSteerAngle: (radians: number) => void;
  /** 全4輪の回転角を加算更新（rad, 前進=+）（2-B用フック） */
  addWheelSpin: (deltaRadians: number) => void;
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

  // 3. 空の親 Group（root: position.y = 0 固定、+Z 正面）に格納し、原点姿勢でリグ構築
  const root = new THREE.Group();
  root.name = config.id;
  root.add(model);
  root.updateMatrixWorld(true);

  const rig = buildVehicleRig(root, model, config);

  // 4. 初期ワールド座標・向きを設定（Y = 0 厳守）
  root.position.set(config.initialPosition.x, 0, config.initialPosition.z);
  root.rotation.set(0, config.initialRotationY, 0);
  root.updateMatrixWorld(true);

  const dimensions: VehicleDimensions = {
    width: scaledSize.x,
    height: scaledSize.y,
    length: scaledSize.z,
  };

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

  const dispose = (): void => {
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
    rig,
    dimensions,
    setSteerAngle,
    addWheelSpin,
    dispose,
  };
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
  const wheels: Record<WheelSlot, WheelRig | null> = {
    frontLeft: null,
    frontRight: null,
    rearLeft: null,
    rearRight: null,
  };
  let boundWheelCount = 0;

  for (const slot of WHEEL_SLOTS) {
    const binding = config.wheels[slot];
    const spinNodes: THREE.Object3D[] = [];
    const steerOnlyNodes: THREE.Object3D[] = [];

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
