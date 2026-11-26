import { useCallback, useEffect, useRef, useState } from 'react';
import {
  startGameEngine,
  type EngineStatus,
  type GameEngineHandle,
} from './engine/scene';
import { DebugHud } from './ui/DebugHud';
import { Minimap, type MinimapSnapshot } from './ui/Minimap';
import { TouchControls } from './ui/TouchControls';

const INITIAL_STATUS: EngineStatus = {
  isWebGL2: false,
  dpr: 1.0,
  dracoReady: false,
  fps: 0,
  controlMode: 'foot',
  canEnterVehicle: false,
  canExitVehicle: false,
  activeVehicleName: null,
  nearbyVehicleName: null,
  vehicleSpeedKmh: 0,
  vehicleGear: 'P',
  playerLoaded: false,
  playerError: null,
  playerHeight: 0,
  jointCount: 0,
  playerState: 'idle',
  animationName: 'Loading...',
  speed: 0,
  position: { x: 0, y: 0, z: 0 },
  cityLoadedCount: 0,
  cityTotalCount: 0,
  cityFailedCount: 0,
  colliderCount: 0,
  envStatus: {
    asphalt: 'procedural',
    pavement: 'procedural',
    sky: 'procedural',
  },
  heroVehicleLoaded: false,
  heroVehicleError: null,
  heroVehicleWheels: 0,
  drivableVehicleCount: 0,
  drivableVehicleTotal: 3,
  trafficLoadedCount: 0,
  trafficTotalCount: 4,
  pedestrianLoadedCount: 0,
  pedestrianTotalCount: 6,
  trafficLightLabel: '南北:青 / 東西:赤',
  audioMuted: false,
  audioUnlocked: false,
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

    // 3-D: iPadOS Safari 自動再生制限解除（touchstart / pointerdown / click / keydown の同期コールバック内でアンロック＆running まで再試行）
    const handleFirstGesture = () => {
      handle.unlockAudio();
    };
    window.addEventListener('touchstart', handleFirstGesture, {
      capture: true,
      passive: true,
    });
    window.addEventListener('pointerdown', handleFirstGesture, {
      capture: true,
      passive: true,
    });
    window.addEventListener('click', handleFirstGesture, {
      capture: true,
      passive: true,
    });
    window.addEventListener('keydown', handleFirstGesture, {
      capture: true,
      passive: true,
    });

    return () => {
      window.removeEventListener('touchstart', handleFirstGesture, true);
      window.removeEventListener('pointerdown', handleFirstGesture, true);
      window.removeEventListener('click', handleFirstGesture, true);
      window.removeEventListener('keydown', handleFirstGesture, true);
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

  const handleInteract = useCallback(() => {
    engineRef.current?.triggerInteract();
  }, []);

  const handleVehicleSteerChange = useCallback((steer: number) => {
    engineRef.current?.setTouchVehicleSteer(steer);
  }, []);

  const handleVehicleThrottleChange = useCallback((throttle: number) => {
    engineRef.current?.setTouchVehicleThrottle(throttle);
  }, []);

  const handleVehicleBrakeChange = useCallback((brake: number) => {
    engineRef.current?.setTouchVehicleBrake(brake);
  }, []);

  const handleGetMinimapSnapshot = useCallback((out: MinimapSnapshot) => {
    engineRef.current?.getMinimapSnapshot(out);
  }, []);

  const handleToggleAudioMute = useCallback(() => {
    engineRef.current?.toggleAudioMute();
  }, []);

  return (
    <div className="viewport-root">
      <canvas ref={canvasRef} className="webgl-canvas" />
      <TouchControls
        controlMode={status.controlMode}
        canEnterVehicle={status.canEnterVehicle}
        canExitVehicle={status.canExitVehicle}
        nearbyVehicleName={status.nearbyVehicleName}
        vehicleSpeedKmh={status.vehicleSpeedKmh}
        vehicleGear={status.vehicleGear}
        onMoveChange={handleMoveChange}
        onLookDelta={handleLookDelta}
        onSprintChange={handleSprintChange}
        onJump={handleJump}
        onInteract={handleInteract}
        onVehicleSteerChange={handleVehicleSteerChange}
        onVehicleThrottleChange={handleVehicleThrottleChange}
        onVehicleBrakeChange={handleVehicleBrakeChange}
      />
      <DebugHud status={status} />
      <button
        type="button"
        className={`audio-mute-btn${status.audioMuted ? ' is-muted' : ''}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={handleToggleAudioMute}
        aria-label={status.audioMuted ? '音声をオンにする' : '音声をミュートにする'}
        aria-pressed={status.audioMuted}
        title={status.audioMuted ? 'Sound OFF' : 'Sound ON'}
      >
        {status.audioMuted ? (
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="22" y1="9" x2="16" y2="15" />
            <line x1="16" y1="9" x2="22" y2="15" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        )}
      </button>
      <Minimap getSnapshot={handleGetMinimapSnapshot} />
    </div>
  );
}

export default App;
