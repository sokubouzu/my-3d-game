import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { getGltfLoader } from '../engine/loaders';

export const PLAYER_MODEL_URL = './assets/characters/player.glb';
export const TARGET_PLAYER_HEIGHT_METERS = 1.7;

export interface PlayerModelInfo {
  heightMeters: number;
  jointCount: number;
  rootJointName: string | null;
  clipNames: string[];
}

export interface LoadedPlayerModel {
  /** ワールド移動・回転を適用するルートグループ（接地Y=0・正面+Z） */
  root: THREE.Group;
  /** GLB から読み込まれたモデル本体 */
  model: THREE.Group;
  /** アニメーションミキサー */
  mixer: THREE.AnimationMixer;
  /** クリップ名 -> AnimationAction マップ */
  actions: Map<string, THREE.AnimationAction>;
  /** 読み込み時のメタ情報 */
  info: PlayerModelInfo;
  /** GPU リソース解放 */
  dispose: () => void;
}

/**
 * 1-B: public/assets/characters/player.glb を読み込み、
 * 正しい身長（約 1.7m）・正面向き（+Z）・接地（Y=0）・PBR 材質で初期化する。
 */
export async function loadPlayerModel(
  maxAnisotropy: number,
): Promise<LoadedPlayerModel> {
  const loader = getGltfLoader();
  const gltf: GLTF = await loader.loadAsync(PLAYER_MODEL_URL);

  const root = new THREE.Group();
  root.name = 'PlayerActorRoot';

  const model = gltf.scene;
  model.name = 'PlayerModelScene';

  // 初期姿勢のバウンディングボックスを計測し、身長 ~1.7m・接地 Y=0 を保証
  model.updateMatrixWorld(true);
  const initialBox = new THREE.Box3().setFromObject(model);
  const initialSize = new THREE.Vector3();
  initialBox.getSize(initialSize);

  if (initialSize.y > 0.01) {
    const heightDiff = Math.abs(initialSize.y - TARGET_PLAYER_HEIGHT_METERS);
    if (heightDiff > 0.02) {
      const scaleFactor = TARGET_PLAYER_HEIGHT_METERS / initialSize.y;
      model.scale.multiplyScalar(scaleFactor);
      model.updateMatrixWorld(true);
    }
  }

  const normalizedBox = new THREE.Box3().setFromObject(model);
  const normalizedSize = new THREE.Vector3();
  normalizedBox.getSize(normalizedSize);

  // 足裏を確実に Y=0 へ接地させる
  if (Number.isFinite(normalizedBox.min.y) && Math.abs(normalizedBox.min.y) > 0.001) {
    model.position.y -= normalizedBox.min.y;
  }

  // メッシュ・マテリアル・骨格情報の整備
  const anisotropy = Math.min(4, Math.max(1, maxAnisotropy));
  let jointCount = 0;
  let rootJointName: string | null = null;

  model.traverse((node: THREE.Object3D) => {
    if (node instanceof THREE.SkinnedMesh) {
      // カメラ接近時にスキニングメッシュがカリングで消えるのを防止
      node.frustumCulled = false;
      if (node.skeleton && node.skeleton.bones.length > jointCount) {
        jointCount = node.skeleton.bones.length;
        rootJointName = node.skeleton.bones[0]?.name ?? null;
      }
    }

    if (node instanceof THREE.Mesh) {
      const materials = Array.isArray(node.material)
        ? node.material
        : [node.material];

      let hasTransparentMaterial = false;
      for (const mat of materials) {
        if (mat instanceof THREE.MeshStandardMaterial) {
          if (mat.transparent) {
            hasTransparentMaterial = true;
          }
          if (mat.map) {
            mat.map.anisotropy = anisotropy;
          }
          if (mat.normalMap) {
            mat.normalMap.anisotropy = anisotropy;
          }
          if (mat.roughnessMap) {
            mat.roughnessMap.anisotropy = anisotropy;
          }
          mat.envMapIntensity = 0.85;
          mat.needsUpdate = true;
        }
      }

      // 透過パーツ（目・眉・口）はシャドウアーティファクト防止のため castShadow を無効化
      node.castShadow = !hasTransparentMaterial;
      node.receiveShadow = true;
    }
  });

  root.add(model);

  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map<string, THREE.AnimationAction>();
  const clipNames: string[] = [];

  for (const clip of gltf.animations) {
    const action = mixer.clipAction(clip);
    actions.set(clip.name, action);
    clipNames.push(clip.name);
  }

  const dispose = () => {
    mixer.stopAllAction();
    mixer.uncacheRoot(model);
    model.traverse((node: THREE.Object3D) => {
      if (node instanceof THREE.Mesh) {
        node.geometry.dispose();
        const mats = Array.isArray(node.material)
          ? node.material
          : [node.material];
        for (const mat of mats) {
          if (mat instanceof THREE.MeshStandardMaterial) {
            mat.map?.dispose();
            mat.normalMap?.dispose();
            mat.roughnessMap?.dispose();
            mat.metalnessMap?.dispose();
            mat.aoMap?.dispose();
            mat.emissiveMap?.dispose();
          }
          mat.dispose();
        }
      }
    });
  };

  return {
    root,
    model,
    mixer,
    actions,
    info: {
      heightMeters: Number(normalizedSize.y.toFixed(3)),
      jointCount,
      rootJointName,
      clipNames,
    },
    dispose,
  };
}
