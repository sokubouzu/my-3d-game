import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { getGltfLoader } from '../engine/loaders';
import { TARGET_PLAYER_HEIGHT_METERS } from '../player/playerModel';
import type { TrafficLightController } from '../traffic/trafficLights';
import type { TrafficObstacle } from '../traffic/trafficVehicle';
import type { CollisionWorld } from '../world/collisionWorld';
import { PedestrianAgent } from './pedestrianAgent';
import {
  createPedestrianVariationPlan,
  FALLBACK_MIXAMO_MODEL_SPEC,
  PEDESTRIAN_MODEL_SPECS,
  type PedestrianModelSpec,
} from './pedestrianCatalog';
import { PEDESTRIAN_CONFIGS, type PedestrianConfig } from './pedestrianRoutes';

export interface PedestrianStatus {
  loadedCount: number;
  totalCount: number;
  failed: boolean;
}

interface LoadedPedestrianTemplate {
  spec: PedestrianModelSpec;
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  baseScaleFactor: number;
  baseMinYOffset: number;
}

/**
 * 3-B / 4-B: 歩道および横断歩道を歩く AI 歩行者（8人）を統括管理するマネージャー。
 * - 優先ルート: public/assets/pedestrians/ 配下の CC0 マルチキャラクター GLB（Quaternius 8種）を並列ロード。
 * - フォールバック: 外部モデル取得失敗時は player.glb へ自動フォールバック。
 * - すべての個体へ年齢層（大人・子供）・体型・3D装着パーツ・服装/肌/髪色・歩調テンポの個体差を自動付与。
 */
export class PedestrianManager {
  private readonly scene: THREE.Scene;
  private readonly collisionWorld: CollisionWorld;
  private readonly maxAnisotropy: number;
  private readonly configs: readonly PedestrianConfig[];
  private readonly onStatusChange?: (status: PedestrianStatus) => void;

  private readonly agents: PedestrianAgent[] = [];
  private readonly loadedTemplates: LoadedPedestrianTemplate[] = [];
  private failed = false;
  private isDisposed = false;

  constructor(
    scene: THREE.Scene,
    collisionWorld: CollisionWorld,
    maxAnisotropy: number,
    onStatusChange?: (status: PedestrianStatus) => void,
    configs: readonly PedestrianConfig[] = PEDESTRIAN_CONFIGS,
  ) {
    this.scene = scene;
    this.collisionWorld = collisionWorld;
    this.maxAnisotropy = maxAnisotropy;
    this.configs = configs;
    this.onStatusChange = onStatusChange;

    this.startLoading();
  }

  public getStatus(): PedestrianStatus {
    return {
      loadedCount: this.agents.length,
      totalCount: this.configs.length,
      failed: this.failed,
    };
  }

  /** AI交通車両側が横断中の歩行者を検知できるよう、スナップショットを out へ追記（ゼロアロケーション） */
  public appendPedestrianObstacles(out: TrafficObstacle[]): void {
    for (let i = 0; i < this.agents.length; i += 1) {
      out.push(this.agents[i].getObstacleSnapshot());
    }
  }

  private emitStatus(): void {
    if (!this.isDisposed && this.onStatusChange) {
      this.onStatusChange(this.getStatus());
    }
  }

  private async loadTemplate(
    spec: PedestrianModelSpec,
  ): Promise<LoadedPedestrianTemplate> {
    const loader = getGltfLoader();
    const gltf = await loader.loadAsync(spec.url);
    const template = gltf.scene;

    template.updateMatrixWorld(true);
    const rawBox = new THREE.Box3().setFromObject(template);
    const rawSize = new THREE.Vector3();
    rawBox.getSize(rawSize);

    // 帽子付きモデル（old_classy_female 等）で頭頂高により身長が縮まないよう、素体基準高を優先使用
    const denomHeight =
      spec.rigKind === 'quaternius' && spec.referenceBodyHeight > 0.1
        ? spec.referenceBodyHeight
        : rawSize.y > 0.01
          ? rawSize.y
          : TARGET_PLAYER_HEIGHT_METERS;

    const baseScaleFactor = TARGET_PLAYER_HEIGHT_METERS / denomHeight;
    const baseMinYOffset = Number.isFinite(rawBox.min.y)
      ? -rawBox.min.y * baseScaleFactor
      : 0;

    const anisotropy = Math.min(4, Math.max(1, this.maxAnisotropy));
    template.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        const mats = Array.isArray(node.material)
          ? node.material
          : [node.material];
        for (const mat of mats) {
          if (mat instanceof THREE.MeshStandardMaterial) {
            if (mat.map) mat.map.anisotropy = anisotropy;
            if (mat.normalMap) mat.normalMap.anisotropy = anisotropy;
            if (mat.roughnessMap) mat.roughnessMap.anisotropy = anisotropy;
            mat.envMapIntensity = 0.78;
          }
        }
      }
    });

    return {
      spec,
      scene: template,
      animations: gltf.animations,
      baseScaleFactor,
      baseMinYOffset,
    };
  }

  private startLoading(): void {
    this.emitStatus();

    const loadAll = async () => {
      // 優先ルート: 8種の CC0 マルチキャラクター GLB を並列ロード
      const results = await Promise.allSettled(
        PEDESTRIAN_MODEL_SPECS.map((spec) => this.loadTemplate(spec)),
      );
      if (this.isDisposed) return;

      const templateById = new Map<string, LoadedPedestrianTemplate>();
      const availableSpecs: PedestrianModelSpec[] = [];

      for (const res of results) {
        if (res.status === 'fulfilled') {
          this.loadedTemplates.push(res.value);
          templateById.set(res.value.spec.id, res.value);
          availableSpecs.push(res.value.spec);
        }
      }

      // フォールバックルート: CC0 パックが1つも取得できなかった場合は player.glb へフォールバック
      if (availableSpecs.length === 0) {
        try {
          const fallbackTemplate = await this.loadTemplate(
            FALLBACK_MIXAMO_MODEL_SPEC,
          );
          if (this.isDisposed) return;
          this.loadedTemplates.push(fallbackTemplate);
          templateById.set(fallbackTemplate.spec.id, fallbackTemplate);
          availableSpecs.push(fallbackTemplate.spec);
        } catch {
          if (this.isDisposed) return;
          this.failed = true;
          this.emitStatus();
          return;
        }
      }

      // 各歩行者のモデル・年齢層・体型・カラー・3Dパーツ・歩調プランを一括生成
      const plan = createPedestrianVariationPlan(
        this.configs.length,
        availableSpecs,
      );

      for (let i = 0; i < this.configs.length; i += 1) {
        const cfg = this.configs[i];
        const variation = plan[i];
        const template =
          templateById.get(variation.modelSpec.id) ?? this.loadedTemplates[0];
        if (!template) continue;

        const cloned = SkeletonUtils.clone(template.scene);
        const agent = new PedestrianAgent(
          cfg,
          cloned,
          template.animations,
          this.collisionWorld,
          template.baseScaleFactor,
          template.baseMinYOffset,
          TARGET_PLAYER_HEIGHT_METERS,
          variation,
        );
        this.agents.push(agent);
        this.scene.add(agent.root);
      }

      this.emitStatus();
    };

    void loadAll();
  }

  public update(
    dt: number,
    playerPos: THREE.Vector3 | null,
    vehicleObstacles: readonly TrafficObstacle[],
    trafficLights?: TrafficLightController,
  ): void {
    if (this.isDisposed || this.agents.length === 0) return;

    for (let i = 0; i < this.agents.length; i += 1) {
      this.agents[i].update(
        dt,
        playerPos,
        vehicleObstacles,
        this.agents,
        trafficLights,
      );
    }
  }

  public dispose(): void {
    this.isDisposed = true;

    for (let i = 0; i < this.agents.length; i += 1) {
      const agent = this.agents[i];
      this.scene.remove(agent.root);
      agent.dispose();
    }
    this.agents.length = 0;

    const disposedGeos = new Set<THREE.BufferGeometry>();
    const disposedMats = new Set<THREE.Material>();
    const disposedTexs = new Set<THREE.Texture>();

    for (let i = 0; i < this.loadedTemplates.length; i += 1) {
      const templateScene = this.loadedTemplates[i].scene;
      templateScene.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        if (node.geometry && !disposedGeos.has(node.geometry)) {
          disposedGeos.add(node.geometry);
          node.geometry.dispose();
        }
        const mats = Array.isArray(node.material)
          ? node.material
          : [node.material];
        for (const mat of mats) {
          if (!mat || disposedMats.has(mat)) continue;
          disposedMats.add(mat);
          if (mat instanceof THREE.MeshStandardMaterial) {
            const maps = [
              mat.map,
              mat.normalMap,
              mat.roughnessMap,
              mat.metalnessMap,
              mat.aoMap,
              mat.emissiveMap,
              mat.alphaMap,
            ];
            for (const tex of maps) {
              if (tex && !disposedTexs.has(tex)) {
                disposedTexs.add(tex);
                tex.dispose();
              }
            }
          }
          mat.dispose();
        }
      });
    }
    this.loadedTemplates.length = 0;
  }
}
