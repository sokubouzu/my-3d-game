import { useCallback, useEffect, useRef, useState } from 'react';
import {
  startGameEngine,
  type EngineStatus,
  type GameEngineHandle,
} from './engine/scene';
import { DebugHud } from './ui/DebugHud';
import { TouchControls } from './ui/TouchControls';

const INITIAL_STATUS: EngineStatus = {
  isWebGL2: false,
  dpr: 1.0,
  dracoReady: false,
  fps: 0,
  playerLoaded: false,
  playerError: null,
  playerHeight: 0,
  jointCount: 0,
  playerState: 'idle',
  animationName: 'Loading...',
  speed: 0,
  position: { x: 0, y: 0, z: 0 },
};

export function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngineHandle | null>(null);
  const [status, setStatus] = useState<EngineStatus>(INITIAL_STATUS);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handle = startGameEngine(canvas, setStatus);
    engineRef.current = handle;
    return () => {
      engineRef.current = null;
      handle.dispose();
    };
  }, []);

  const handleMoveChange = useCallback((x: number, y: number) => {
    engineRef.current?.setTouchMove(x, y);
  }, []);

  const handleLookDelta = useCallback((dx: number, dy: number) => {
    engineRef.current?.addLookDelta(dx, dy);
  }, []);

  const handleSprintChange = useCallback((active: boolean) => {
    engineRef.current?.setTouchSprint(active);
  }, []);

  const handleJump = useCallback(() => {
    engineRef.current?.triggerJump();
  }, []);

  return (
    <div className="viewport-root">
      <canvas ref={canvasRef} className="webgl-canvas" />
      <TouchControls
        onMoveChange={handleMoveChange}
        onLookDelta={handleLookDelta}
        onSprintChange={handleSprintChange}
        onJump={handleJump}
      />
      <DebugHud status={status} />
    </div>
  );
}

export default App;
