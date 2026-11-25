import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RENDER_CONFIG } from './config';

let sharedDracoLoader: DRACOLoader | null = null;
let sharedGltfLoader: GLTFLoader | null = null;

/**
 * Colab等でDraco圧縮されたGLBを読み込むための DRACOLoader / GLTFLoader を取得する。
 * デコーダは public/draco/ にローカル配置されたファイルを使用する。
 */
export function getDracoLoader(): DRACOLoader {
  if (!sharedDracoLoader) {
    sharedDracoLoader = new DRACOLoader();
    sharedDracoLoader.setDecoderPath(RENDER_CONFIG.dracoDecoderPath);
    sharedDracoLoader.setDecoderConfig({ type: 'wasm' });
    sharedDracoLoader.preload();
  }
  return sharedDracoLoader;
}

export function getGltfLoader(): GLTFLoader {
  if (!sharedGltfLoader) {
    sharedGltfLoader = new GLTFLoader();
    sharedGltfLoader.setDRACOLoader(getDracoLoader());
  }
  return sharedGltfLoader;
}

export function disposeLoaders(): void {
  if (sharedDracoLoader) {
    sharedDracoLoader.dispose();
    sharedDracoLoader = null;
  }
  sharedGltfLoader = null;
}
