import * as THREE from 'three';
import { RENDER_CONFIG } from './config';
import { createWebGL2Renderer, type RendererBundle } from './renderer';
import { getGltfLoader, disposeLoaders } from './loaders';
import { InputManager } from '../input/inputManager';
import { loadPlayerModel, type LoadedPlayerModel } from '../player/playerModel';
import {
  PlayerController,
  type PlayerLocomotionState,
} from '../player/playerController';
import { ThirdPersonCamera } from '../camera/thirdPersonCamera';
import { CITY_METRICS, CollisionWorld } from '../world/collisionWorld';
import {
  createCityEnvironment,
  type EnvironmentStatus,
} from '../world/environment';
import {
  buildJapaneseCity,
  type CityBuildProgress,
} from '../world/cityBuilder';

export interface EngineStatus {
  isWebGL2: boolean;
  dpr: number;
  dracoReady: boolean;
  fps: number;
  playerLoaded: boolean;
  playerError: string | null;
  playerHeight: number;
  jointCount: number;
  playerState: PlayerLocomotionState;
  animationName: string;
  speed: number;
  position: { x: number; y: number; z: number };
  cityLoadedCount: number;
  cityTotalCount: number;
  cityFailedCount: number;
  colliderCount: number;
  envStatus: EnvironmentStatus;
}

export interface GameEngineHandle {
  setTouchMove: (x: number, y: number) => void;
  addLookDelta: (dx: number, dy: number) => void;
  setTouchSprint: (active: boolean) => void;
  triggerJump: () => void;
  dispose: () => void;
}

/**
 * 1-D / 1-E: WebGL2 基盤 + プレイヤー操作 + 160m四方の日本の街区（承認済みGLB全24種配置＆OBB衝突判定）
 * + Poly Haven 1K PBR・HDRI 環境仕上げ
 */
export function startGameEngine(
  canvas: HTMLCanvasElement,
  onStatusUpdate: (status: EngineStatus) => void,
): GameEngineHandle {
  const rendererBundle: RendererBundle = createWebGL2Renderer(canvas);
  const { renderer, isWebGL2 } = rendererBundle;
  let currentDpr = rendererBundle.dpr;

  // DRACOLoader 初期化確認
  const gltfLoader = getGltfLoader();
  const dracoReady = Boolean(gltfLoader);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    260,
  );
  const tpsCamera = new ThirdPersonCamera(camera, {
    initialDistance: 4.2,
    initialPitch: 0.24,
    targetHeight: 1.42,
  });

  // 1-E: 軽量ライティング (M1 iPad Air 最適化: シャドウマップ 1024px、SSR/SSAO/DoF 無効)
  const hemiLight = new THREE.HemisphereLight(0xdceeff, 0x5c6068, 0.72);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xfff4e0, 1.55);
  dirLight.position.set(18, 30, 14);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(
    RENDER_CONFIG.shadowMapSize,
    RENDER_CONFIG.shadowMapSize,
  );
  dirLight.shadow.bias = -0.0005;
  dirLight.shadow.normalBias = 0.025;
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = 90;
  const shadowExtent = 24;
  dirLight.shadow.camera.left = -shadowExtent;
  dirLight.shadow.camera.right = shadowExtent;
  dirLight.shadow.camera.top = shadowExtent;
  dirLight.shadow.camera.bottom = -shadowExtent;
  scene.add(dirLight);
  scene.add(dirLight.target);

  // 1-D: 衝突判定ワールド (160m x 160m 街区 + 歩道段差 + 建物/車両/小物 OBB)
  const collisionWorld = new CollisionWorld(CITY_METRICS.worldHalfExtent);

  let isDisposed = false;
  let loadedPlayer: LoadedPlayerModel | null = null;
  let playerController: PlayerController | null = null;
  let playerError: string | null = null;
  const playerPos = new THREE.Vector3(0, 0, 0);

  let cityProgress: CityBuildProgress = {
    loadedCount: 0,
    totalCount: 0,
    failedCount: 0,
    colliderCount: 0,
  };
  let envStatus: EnvironmentStatus = {
    asphalt: 'procedural',
    pavement: 'procedural',
    sky: 'procedural',
  };

  let rafId = 0;
  let frameCount = 0;
  let lastFrameTime = performance.now();
  let lastFpsTime = lastFrameTime;
  let lastHudUpdateTime = lastFrameTime;
  let lastDprAdjustTime = lastFrameTime;
  let currentFps = 0;

  const emitStatus = () => {
    if (isDisposed) return;
    const telemetry = playerController?.getTelemetry();
    onStatusUpdate({
      isWebGL2,
      dpr: currentDpr,
      dracoReady,
      fps: currentFps,
      playerLoaded: loadedPlayer !== null,
      playerError,
      playerHeight: loadedPlayer?.info.heightMeters ?? 0,
      jointCount: loadedPlayer?.info.jointCount ?? 0,
      playerState: telemetry?.state ?? 'idle',
      animationName: telemetry?.animationName ?? 'Loading...',
      speed: telemetry?.speed ?? 0,
      position: telemetry?.position ?? { x: 0, y: 0, z: 0 },
      cityLoadedCount: cityProgress.loadedCount,
      cityTotalCount: cityProgress.totalCount,
      cityFailedCount: cityProgress.failedCount,
      colliderCount: cityProgress.colliderCount,
      envStatus,
    });
  };

  // 1-E: Poly Haven 1K PBR (asphalt_01 / concrete_pavement / HDRI) + 日本の街区地面・交差点
  const cityEnv = createCityEnvironment(scene, renderer, (nextEnvStatus) => {
    envStatus = nextEnvStatus;
    emitStatus();
  });

  // 1-D: 承認済み全24 GLBモデルの街区配置 & OBB コライダー構築
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  const cityBuilder = buildJapaneseCity(
    scene,
    collisionWorld,
    maxAnisotropy,
    (progress) => {
      cityProgress = progress;
      emitStatus();
    },
  );

  const inputManager = new InputManager(canvas);

  // 初期カメラ位置を中央交差点のプレイヤー位置に合わせる
  tpsCamera.update(0.016, playerPos, collisionWorld.getGroundHeight(0, 0));

  // 1-B / 1-C: player.glb 非同期ロード（既存徒歩移動・アニメーション・コリジョン連携）
  loadPlayerModel(maxAnisotropy)
    .then((playerModel) => {
      if (isDisposed) {
        playerModel.dispose();
        return;
      }
      loadedPlayer = playerModel;
      scene.add(playerModel.root);
      playerController = new PlayerController(playerModel, {
        getGroundHeight: (x, z) => collisionWorld.getGroundHeight(x, z),
        worldHalfExtent: collisionWorld.worldHalfExtent,
        resolveHorizontalCollision: (x, y, z, radius, playerHeight) =>
          collisionWorld.resolveHorizontalCollision(
            x,
            y,
            z,
            radius,
            playerHeight,
          ),
      });
      playerController.getPosition(playerPos);
      tpsCamera.update(
        0.016,
        playerPos,
        collisionWorld.getGroundHeight(playerPos.x, playerPos.z),
      );
      emitStatus();
    })
    .catch((err: unknown) => {
      if (isDisposed) return;
      playerError =
        err instanceof Error ? err.message : 'Failed to load player.glb';
      emitStatus();
    });

  const handleResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    rendererBundle.resize(w, h);
  };
  window.addEventListener('resize', handleResize);

  emitStatus();

  const animate = (now: number) => {
    if (isDisposed) return;
    rafId = requestAnimationFrame(animate);

    const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
    lastFrameTime = now;

    const input = inputManager.consumeSnapshot();
    tpsCamera.applyLookDelta(input.lookDeltaX, input.lookDeltaY);
    tpsCamera.applyZoomDelta(input.zoomDelta);

    if (playerController) {
      playerController.update(dt, input, tpsCamera.getYaw());
      playerController.getPosition(playerPos);
    }

    const groundY = collisionWorld.getGroundHeight(playerPos.x, playerPos.z);
    tpsCamera.update(dt, playerPos, groundY);

    // リアルタイムシャドウカメラをプレイヤー周囲へ追従させる
    dirLight.position.set(playerPos.x + 18, playerPos.y + 30, playerPos.z + 14);
    dirLight.target.position.copy(playerPos);
    dirLight.target.updateMatrixWorld();

    renderer.render(scene, camera);

    frameCount += 1;
    const fpsElapsed = now - lastFpsTime;
    if (fpsElapsed >= 500) {
      currentFps = Math.round((frameCount * 1000) / fpsElapsed);
      frameCount = 0;
      lastFpsTime = now;

      // M1 iPad Air 最適化: 負荷に応じた動的 DPR 調整 (0.75〜1.25、標準 1.0)
      if (now - lastDprAdjustTime >= 2500 && currentFps > 0) {
        const nativeCap = Math.min(
          window.devicePixelRatio || 1,
          RENDER_CONFIG.maxDpr,
        );
        if (currentFps < RENDER_CONFIG.targetFps - 2 && currentDpr > RENDER_CONFIG.minDpr) {
          currentDpr = Math.max(RENDER_CONFIG.minDpr, Number((currentDpr - 0.1).toFixed(2)));
          rendererBundle.setDpr(currentDpr);
          lastDprAdjustTime = now;
        } else if (
          currentFps >= RENDER_CONFIG.idealFps - 4 &&
          currentDpr < nativeCap
        ) {
          currentDpr = Math.min(nativeCap, Number((currentDpr + 0.05).toFixed(2)));
          rendererBundle.setDpr(currentDpr);
          lastDprAdjustTime = now;
        }
      }
    }

    if (now - lastHudUpdateTime >= 250) {
      lastHudUpdateTime = now;
      emitStatus();
    }
  };

  rafId = requestAnimationFrame(animate);

  return {
    setTouchMove: (x: number, y: number) => {
      inputManager.setTouchMove(x, y);
    },
    addLookDelta: (dx: number, dy: number) => {
      inputManager.addLookDelta(dx, dy);
    },
    setTouchSprint: (active: boolean) => {
      inputManager.setTouchSprint(active);
    },
    triggerJump: () => {
      inputManager.triggerJump();
    },
    dispose: () => {
      isDisposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      inputManager.dispose();

      if (loadedPlayer) {
        scene.remove(loadedPlayer.root);
        loadedPlayer.dispose();
        loadedPlayer = null;
      }
      playerController = null;

      cityBuilder.dispose();
      cityEnv.dispose();
      rendererBundle.dispose();
      disposeLoaders();
    },
  };
}
