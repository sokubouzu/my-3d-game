import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { getGltfLoader } from '../engine/loaders';
import {
  PLAYER_MODEL_URL,
  TARGET_PLAYER_HEIGHT_METERS,
} from '../player/playerModel';
import type { TrafficLightController } from '../traffic/trafficLights';
import type { TrafficObstacle } from '../traffic/trafficVehicle';
import type { CollisionWorld } from '../world/collisionWorld';
import { PedestrianAgent } from './pedestrianAgent';
import {
  PEDESTRIAN_APPEARANCES,
  PEDESTRIAN_CONFIGS,
  pickRandomPedestrianHeight,
  type PedestrianAppearance,
  type PedestrianConfig,
} from './pedestrianRoutes';

export interface PedestrianStatus {
  loadedCount: number;
  totalCount: number;
  failed: boolean;
}

/**
 * 3-B: 歩道および横断歩道を歩く AI 歩行者（6人）を統括管理するマネージャー。
 * - 既存の承認済みキャラクター GLB (player.glb) を1回だけロードし、SkeletonUtils.clone で軽量複製。
 * - テクスチャ・ジオメトリを共有し、各個体ごとに独立した AnimationMixer を駆動。
 */
export class PedestrianManager {
  private readonly scene: THREE.Scene;
  private readonly collisionWorld: CollisionWorld;
  private readonly maxAnisotropy: number;
  private readonly configs: readonly PedestrianConfig[];
  private readonly onStatusChange?: (status: PedestrianStatus) => void;

  private readonly agents: PedestrianAgent[] = [];
  private templateScene: THREE.Group | null = null;
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

  private startLoading(): void {
    this.emitStatus();
    const loader = getGltfLoader();

    loader
      .loadAsync(PLAYER_MODEL_URL)
      .then((gltf) => {
        if (this.isDisposed) return;

        const template = gltf.scene;
        this.templateScene = template;

        // テンプレートの初期寸法を1回だけ計測（身長 1.7m 正規化・足裏 Y=0 接地オフセット）
        template.updateMatrixWorld(true);
        const rawBox = new THREE.Box3().setFromObject(template);
        const rawSize = new THREE.Vector3();
        rawBox.getSize(rawSize);

        const baseScaleFactor =
          rawSize.y > 0.01 ? TARGET_PLAYER_HEIGHT_METERS / rawSize.y : 1.0;
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
                mat.envMapIntensity = 0.85;
              }
            }
          }
        });

        // 服装・髪色パレットを重複しないようシャッフルして各個体へ割り当て
        const shuffledAppearances: PedestrianAppearance[] = [
          ...PEDESTRIAN_APPEARANCES,
        ];
        for (let i = shuffledAppearances.length - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = shuffledAppearances[i];
          shuffledAppearances[i] = shuffledAppearances[j];
          shuffledAppearances[j] = tmp;
        }

        for (let i = 0; i < this.configs.length; i += 1) {
          const cfg = this.configs[i];
          const cloned = SkeletonUtils.clone(template);
          const randomHeight = pickRandomPedestrianHeight();
          const appearance =
            shuffledAppearances[i % shuffledAppearances.length];
          const agent = new PedestrianAgent(
            cfg,
            cloned,
            gltf.animations,
            this.collisionWorld,
            baseScaleFactor,
            baseMinYOffset,
            randomHeight,
            appearance,
          );
          this.agents.push(agent);
          this.scene.add(agent.root);
        }

        this.emitStatus();
      })
      .catch(() => {
        if (this.isDisposed) return;
        this.failed = true;
        this.emitStatus();
      });
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

    if (this.templateScene) {
      const disposedGeos = new Set<THREE.BufferGeometry>();
      const disposedMats = new Set<THREE.Material>();
      const disposedTexs = new Set<THREE.Texture>();

      this.templateScene.traverse((node) => {
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
      this.templateScene = null;
    }
  }
}
