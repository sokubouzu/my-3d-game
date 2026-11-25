import * as THREE from 'three';
import { RENDER_CONFIG } from './config';

export interface RendererBundle {
  renderer: THREE.WebGLRenderer;
  isWebGL2: boolean;
  dpr: number;
  setDpr: (nextDpr: number) => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

export function createWebGL2Renderer(canvas: HTMLCanvasElement): RendererBundle {
  const gl2 = canvas.getContext('webgl2', {
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });

  const renderer = new THREE.WebGLRenderer({
    canvas,
    context: gl2 ?? undefined,
    antialias: true,
    powerPreference: 'high-performance',
  });

  const isWebGL2 = renderer.capabilities.isWebGL2;
  const initialDpr = Math.min(window.devicePixelRatio || 1, RENDER_CONFIG.defaultDpr);

  renderer.setPixelRatio(initialDpr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  // リアルタイムシャドウは 1024px 基準 (GEMINI.md)
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  let currentDpr = initialDpr;

  const setDpr = (nextDpr: number) => {
    const clamped = Math.max(
      RENDER_CONFIG.minDpr,
      Math.min(RENDER_CONFIG.maxDpr, nextDpr),
    );
    currentDpr = clamped;
    renderer.setPixelRatio(clamped);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  };

  const resize = (width: number, height: number) => {
    renderer.setSize(width, height, false);
  };

  const dispose = () => {
    renderer.dispose();
  };

  return {
    renderer,
    isWebGL2,
    dpr: currentDpr,
    setDpr,
    resize,
    dispose,
  };
}
