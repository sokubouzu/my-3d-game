import { useEffect, useRef, useState } from 'react';
import { startMinimalEngine, type EngineStatus } from './engine/scene';

export function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<EngineStatus>({
    isWebGL2: false,
    dpr: 1.0,
    dracoReady: false,
    fps: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handle = startMinimalEngine(canvas, setStatus);
    return () => {
      handle.dispose();
    };
  }, []);

  return (
    <div className="viewport-root">
      <canvas ref={canvasRef} className="webgl-canvas" />
      <aside className="hud-status" aria-label="Engine Status">
        <div className="hud-title">my-3d-game (Phase 1-A Bootstrap)</div>
        <div>API: {status.isWebGL2 ? 'WebGL2' : 'WebGL1 (Fallback)'}</div>
        <div>DPR: {status.dpr.toFixed(2)}</div>
        <div>DRACOLoader: {status.dracoReady ? 'Ready (CDN)' : 'Init...'}</div>
        <div>FPS: {status.fps || '--'}</div>
      </aside>
    </div>
  );
}

export default App;
