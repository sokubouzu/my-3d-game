import * as THREE from 'three';
import { RENDER_CONFIG } from './config';
import { createWebGL2Renderer, type RendererBundle } from './renderer';
import { getGltfLoader, disposeLoaders } from './loaders';

export interface EngineStatus {
  isWebGL2: boolean;
  dpr: number;
  dracoReady: boolean;
  fps: number;
}

export interface GameBootstrapHandle {
  dispose: () => void;
}

/**
 * 1-A 最小起動基盤:
 * WebGL2 + DPR 1.0 + DRACOLoader 初期化 + 最小限のライト/デバッググリッドのみを構築。
 * 歩行・街区構築は 1-B 以降で実装する。
 */
export function startMinimalEngine(
  canvas: HTMLCanvasElement,
  onStatusUpdate: (status: EngineStatus) => void,
): GameBootstrapHandle {
  const rendererBundle: RendererBundle = createWebGL2Renderer(canvas);
  const { renderer, isWebGL2, dpr } = rendererBundle;

  // DRACOLoader 初期化確認
  const gltfLoader = getGltfLoader();
  const dracoReady = Boolean(gltfLoader);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87a8c4);
  scene.fog = new THREE.Fog(0x87a8c4, 40, 180);

  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    300,
  );
  camera.position.set(0, 3.5, 8);
  camera.lookAt(0, 1, 0);

  // 軽量ライティング (ポストプロセス SSR/SSAO/DoF は無効)
  const hemiLight = new THREE.HemisphereLight(0xdceeff, 0x444852, 0.85);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xfff6e5, 1.4);
  dirLight.position.set(18, 28, 16);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(
    RENDER_CONFIG.shadowMapSize,
    RENDER_CONFIG.shadowMapSize,
  );
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = 80;
  const shadowExtent = 20;
  dirLight.shadow.camera.left = -shadowExtent;
  dirLight.shadow.camera.right = shadowExtent;
  dirLight.shadow.camera.top = shadowExtent;
  dirLight.shadow.camera.bottom = -shadowExtent;
  scene.add(dirLight);

  // 開発用デバッググリッドのみ（箱モデル等の代用オブジェクトは配置しない）
  const gridHelper = new THREE.GridHelper(40, 40, 0x3b4d63, 0x263242);
  scene.add(gridHelper);

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
  let lastFpsTime = performance.now();
  let currentFps = 0;

  onStatusUpdate({
    isWebGL2,
    dpr,
    dracoReady,
    fps: 0,
  });

  const animate = (now: number) => {
    rafId = requestAnimationFrame(animate);
    renderer.render(scene, camera);

    frameCount += 1;
    const elapsed = now - lastFpsTime;
    if (elapsed >= 500) {
      currentFps = Math.round((frameCount * 1000) / elapsed);
      frameCount = 0;
      lastFpsTime = now;
      onStatusUpdate({
        isWebGL2,
        dpr: rendererBundle.dpr,
        dracoReady,
        fps: currentFps,
      });
    }
  };

  rafId = requestAnimationFrame(animate);

  return {
    dispose: () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      gridHelper.geometry.dispose();
      if (Array.isArray(gridHelper.material)) {
        gridHelper.material.forEach((m) => m.dispose());
      } else {
        gridHelper.material.dispose();
      }
      rendererBundle.dispose();
      disposeLoaders();
    },
  };
}
