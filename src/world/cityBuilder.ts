import * as THREE from 'three';
import { getGltfLoader } from '../engine/loaders';
import { CollisionWorld } from './collisionWorld';
import {
  JAPANESE_CITY_PLACEMENTS,
  type CityAssetPlacement,
} from './cityLayout';

export interface CityBuildProgress {
  loadedCount: number;
  totalCount: number;
  failedCount: number;
  colliderCount: number;
}

export interface CityBuilderHandle {
  group: THREE.Group;
  dispose: () => void;
}

const MAX_CONCURRENT_LOADS = 3;

/**
 * 1-D: 承認済み GLB アセットをバウンディングボックス自動スケーリング＆接地（Y=0 / 歩道高）で
 * 日本の街区として配置し、簡略化 OBB コリジョンを登録するビルダー。
 */
export function buildJapaneseCity(
  scene: THREE.Scene,
  collisionWorld: CollisionWorld,
  maxAnisotropy: number,
  onProgress?: (progress: CityBuildProgress) => void,
): CityBuilderHandle {
  const cityGroup = new THREE.Group();
  cityGroup.name = 'JapaneseCityRoot';
  scene.add(cityGroup);

  const gltfLoader = getGltfLoader();
  const anisotropy = Math.min(4, Math.max(1, maxAnisotropy));

  let isDisposed = false;
  let loadedCount = 0;
  let failedCount = 0;
  const totalCount = JAPANESE_CITY_PLACEMENTS.length;

  // 同一 URL の GLB を重複ダウンロードしないためのテンプレート Promise キャッシュ
  const templatePromises = new Map<string, Promise<THREE.Group>>();
  const loadedTemplates: THREE.Group[] = [];

  const emitProgress = () => {
    if (isDisposed || !onProgress) return;
    onProgress({
      loadedCount,
      totalCount,
      failedCount,
      colliderCount: collisionWorld.getColliderCount(),
    });
  };

  // 1. ロード完了前のすり抜け防止のため、暫定フットプリントのコライダーを事前登録
  for (const placement of JAPANESE_CITY_PLACEMENTS) {
    if (placement.hasCollision && placement.placeholderFootprint) {
      const baseY = placement.yOffset ?? 0;
      const fp = placement.placeholderFootprint;
      collisionWorld.upsertCollider(
        placement.instanceId,
        placement.x,
        placement.z,
        fp.width,
        fp.depth,
        placement.rotationY,
        baseY,
        baseY + fp.height,
      );
    }
  }
  emitProgress();

  // 2. 優先度順にソートして、同時ロード数制限（最大3並列）で非同期ロード＆配置
  const queue = [...JAPANESE_CITY_PLACEMENTS].sort(
    (a, b) => a.priority - b.priority,
  );

  const loadTemplate = (url: string): Promise<THREE.Group> => {
    const existing = templatePromises.get(url);
    if (existing) return existing;

    const promise = gltfLoader.loadAsync(url).then((gltf) => {
      const root = gltf.scene;
      // テクスチャ異方性とミップマップ設定を M1 iPad Air 向けに最適化
      root.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
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
      loadedTemplates.push(root);
      return root;
    });

    templatePromises.set(url, promise);
    return promise;
  };

  const placeInstance = async (placement: CityAssetPlacement): Promise<void> => {
    try {
      const template = await loadTemplate(placement.url);
      if (isDisposed) return;

      const instanceModel = template.clone(true);
      normalizeAndAttachModel(
        instanceModel,
        placement,
        cityGroup,
        collisionWorld,
      );
      loadedCount += 1;
    } catch (err: unknown) {
      failedCount += 1;
      console.warn(
        `[CityBuilder] Failed to load ${placement.assetId} (${placement.url}):`,
        err,
      );
    } finally {
      emitProgress();
    }
  };

  let nextIndex = 0;
  const runWorker = async (): Promise<void> => {
    while (!isDisposed && nextIndex < queue.length) {
      const current = queue[nextIndex];
      nextIndex += 1;
      await placeInstance(current);
    }
  };

  const workerCount = Math.min(MAX_CONCURRENT_LOADS, queue.length);
  for (let i = 0; i < workerCount; i += 1) {
    void runWorker();
  }

  return {
    group: cityGroup,
    dispose: () => {
      isDisposed = true;
      for (const placement of JAPANESE_CITY_PLACEMENTS) {
        collisionWorld.removeCollider(placement.instanceId);
      }
      scene.remove(cityGroup);

      const disposedGeometries = new Set<THREE.BufferGeometry>();
      const disposedMaterials = new Set<THREE.Material>();
      const disposedTextures = new Set<THREE.Texture>();

      const disposeObject = (root: THREE.Object3D) => {
        root.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return;
          if (obj.geometry && !disposedGeometries.has(obj.geometry)) {
            disposedGeometries.add(obj.geometry);
            obj.geometry.dispose();
          }
          const mats = Array.isArray(obj.material)
            ? obj.material
            : [obj.material];
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

      disposeObject(cityGroup);
      for (const tpl of loadedTemplates) {
        disposeObject(tpl);
      }
      loadedTemplates.length = 0;
      templatePromises.clear();
    },
  };
}

/**
 * バウンディングボックス計測による自動スケーリング・中心揃え・底面接地（Y = yOffset）を行い、
 * 実測サイズで OBB コライダーを更新する。
 */
function normalizeAndAttachModel(
  model: THREE.Object3D,
  placement: CityAssetPlacement,
  parentGroup: THREE.Group,
  collisionWorld: CollisionWorld,
): void {
  model.position.set(0, 0, 0);
  model.rotation.set(0, 0, 0);
  model.scale.set(1, 1, 1);
  model.updateMatrixWorld(true);

  const rawBox = new THREE.Box3().setFromObject(model);
  if (rawBox.isEmpty()) {
    return;
  }

  const rawSize = rawBox.getSize(new THREE.Vector3());
  const rawHorizMax = Math.max(rawSize.x, rawSize.z);

  let scale = 1.0;
  if (placement.fitMode === 'height') {
    if (rawSize.y > 0.0001) {
      scale = placement.targetSize / rawSize.y;
    }
  } else {
    if (rawHorizMax > 0.0001) {
      scale = placement.targetSize / rawHorizMax;
    }
  }

  // 道路や隣接区画へのはみ出しを防ぐためフットプリント上限でクランプ
  if (rawHorizMax > 0.0001 && rawHorizMax * scale > placement.maxFootprint) {
    scale = placement.maxFootprint / rawHorizMax;
  }

  if (!Number.isFinite(scale) || scale <= 0) {
    scale = 1.0;
  }

  model.scale.multiplyScalar(scale);
  model.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(model);
  const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
  const scaledSize = scaledBox.getSize(new THREE.Vector3());

  // 水平中心を原点、最下部を正確に Y = 0 へ接地
  model.position.x -= scaledCenter.x;
  model.position.z -= scaledCenter.z;
  model.position.y -= scaledBox.min.y;

  // シャドウ設定 (M1 iPad Air 最適化: 高ポリゴンは castShadow=false)
  model.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.castShadow = placement.castShadow;
    obj.receiveShadow = true;
  });

  const wrapper = new THREE.Group();
  wrapper.name = placement.instanceId;
  const baseY = placement.yOffset ?? 0;
  wrapper.position.set(placement.x, baseY, placement.z);
  wrapper.rotation.y = placement.rotationY;
  wrapper.add(model);
  parentGroup.add(wrapper);

  // 実測バウンディングボックスで OBB コライダーを精密更新
  if (placement.hasCollision) {
    const shrink = placement.colliderShrink ?? 0.92;
    collisionWorld.upsertCollider(
      placement.instanceId,
      placement.x,
      placement.z,
      Math.max(0.4, scaledSize.x * shrink),
      Math.max(0.4, scaledSize.z * shrink),
      placement.rotationY,
      baseY,
      baseY + Math.max(0.5, scaledSize.y),
    );
  }
}
