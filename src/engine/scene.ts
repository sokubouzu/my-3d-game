import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
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
}

export interface GameEngineHandle {
  setTouchMove: (x: number, y: number) => void;
  addLookDelta: (dx: number, dy: number) => void;
  setTouchSprint: (active: boolean) => void;
  triggerJump: () => void;
  dispose: () => void;
}

const WORLD_HALF_EXTENT = 48;

/**
 * 1-B / 1-C: WebGL2 基盤 + プレイヤー表示 + 徒歩移動・TPSカメラ・タッチ/PC入力統合
 */
export function startGameEngine(
  canvas: HTMLCanvasElement,
  onStatusUpdate: (status: EngineStatus) => void,
): GameEngineHandle {
  const rendererBundle: RendererBundle = createWebGL2Renderer(canvas);
  const { renderer, isWebGL2 } = rendererBundle;

  // DRACOLoader 初期化確認
  const gltfLoader = getGltfLoader();
  const dracoReady = Boolean(gltfLoader);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87a8c4);
  scene.fog = new THREE.Fog(0x87a8c4, 38, 160);

  // 軽量 PBR 環境光 (外部 HDRI なしの軽量 PMREM)
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  const envRenderTarget = pmremGenerator.fromScene(roomEnv, 0.04);
  scene.environment = envRenderTarget.texture;
  roomEnv.dispose();

  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    250,
  );
  const tpsCamera = new ThirdPersonCamera(camera, {
    initialDistance: 4.2,
    initialPitch: 0.24,
    targetHeight: 1.42,
  });

  // 軽量ライティング (ポストプロセス SSR/SSAO/DoF は無効)
  const hemiLight = new THREE.HemisphereLight(0xdceeff, 0x4b515c, 0.75);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xfff5e4, 1.5);
  dirLight.position.set(12, 20, 10);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(
    RENDER_CONFIG.shadowMapSize,
    RENDER_CONFIG.shadowMapSize,
  );
  dirLight.shadow.bias = -0.0005;
  dirLight.shadow.normalBias = 0.02;
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = 60;
  const shadowExtent = 12;
  dirLight.shadow.camera.left = -shadowExtent;
  dirLight.shadow.camera.right = shadowExtent;
  dirLight.shadow.camera.top = shadowExtent;
  dirLight.shadow.camera.bottom = -shadowExtent;
  scene.add(dirLight);
  scene.add(dirLight.target);

  // 開発用デバッググリッド（1mマス）＋接地シャドウ受けプレーン（Y=0）
  const gridHelper = new THREE.GridHelper(
    WORLD_HALF_EXTENT * 2,
    WORLD_HALF_EXTENT * 2,
    0x3b4d63,
    0x273545,
  );
  gridHelper.position.y = 0.002;
  scene.add(gridHelper);

  const shadowPlaneGeo = new THREE.PlaneGeometry(
    WORLD_HALF_EXTENT * 2,
    WORLD_HALF_EXTENT * 2,
  );
  const shadowPlaneMat = new THREE.ShadowMaterial({ opacity: 0.34 });
  const shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0;
  shadowPlane.receiveShadow = true;
  scene.add(shadowPlane);

  const inputManager = new InputManager(canvas);

  let isDisposed = false;
  let loadedPlayer: LoadedPlayerModel | null = null;
  let playerController: PlayerController | null = null;
  let playerError: string | null = null;
  const playerPos = new THREE.Vector3(0, 0, 0);

  // 初期カメラ位置を原点プレイヤー位置に合わせる
  tpsCamera.update(0.016, playerPos, 0);

  // 1-B: player.glb 非同期ロード
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  loadPlayerModel(maxAnisotropy)
    .then((playerModel) => {
      if (isDisposed) {
        playerModel.dispose();
        return;
      }
      loadedPlayer = playerModel;
      scene.add(playerModel.root);
      playerController = new PlayerController(playerModel, {
        getGroundHeight: () => 0,
        worldHalfExtent: WORLD_HALF_EXTENT,
      });
      playerController.getPosition(playerPos);
      tpsCamera.update(0.016, playerPos, 0);
      emitStatus();
    })
    .catch((err: unknown) => {
      if (isDisposed) return;
      playerError = err instanceof Error ? err.message : 'Failed to load player.glb';
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

  let rafId = 0;
  let frameCount = 0;
  let lastFrameTime = performance.now();
  let lastFpsTime = lastFrameTime;
  let lastHudUpdateTime = lastFrameTime;
  let currentFps = 0;

  const emitStatus = () => {
    const telemetry = playerController?.getTelemetry();
    onStatusUpdate({
      isWebGL2,
      dpr: rendererBundle.dpr,
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
    });
  };

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

    tpsCamera.update(dt, playerPos, 0);

    // リアルタイムシャドウカメラをプレイヤー周囲へ追従させる
    dirLight.position.set(playerPos.x + 12, playerPos.y + 20, playerPos.z + 10);
    dirLight.target.position.copy(playerPos);
    dirLight.target.updateMatrixWorld();

    renderer.render(scene, camera);

    frameCount += 1;
    const fpsElapsed = now - lastFpsTime;
    if (fpsElapsed >= 500) {
      currentFps = Math.round((frameCount * 1000) / fpsElapsed);
      frameCount = 0;
      lastFpsTime = now;
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

      gridHelper.geometry.dispose();
      if (Array.isArray(gridHelper.material)) {
        gridHelper.material.forEach((m) => m.dispose());
      } else {
        gridHelper.material.dispose();
      }
      shadowPlaneGeo.dispose();
      shadowPlaneMat.dispose();
      envRenderTarget.dispose();
      pmremGenerator.dispose();
      rendererBundle.dispose();
      disposeLoaders();
    },
  };
}
