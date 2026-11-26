import { useCallback, useEffect, useRef, useState } from 'react';
import {
  startGameEngine,
  type EngineStatus,
  type GameEngineHandle,
} from './engine/scene';
import { DebugHud } from './ui/DebugHud';
import { Minimap, type MinimapSnapshot } from './ui/Minimap';
import { TouchControls } from './ui/TouchControls';
import { TIME_OF_DAY_LABELS } from './world/timeOfDay';

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
  vehicleSpeedMode: 'CITY',
  vehicleSpeedLimitKmh: 45,
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
  pedestrianTotalCount: 8,
  trafficLightLabel: '南北:青 / 東西:赤',
  audioMuted: false,
  audioUnlocked: false,
  timeOfDay: 'day',
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

  const handleCycleVehicleSpeedMode = useCallback(() => {
    engineRef.current?.cycleVehicleSpeedMode();
  }, []);

  const handleGetMinimapSnapshot = useCallback((out: MinimapSnapshot) => {
    engineRef.current?.getMinimapSnapshot(out);
  }, []);

  const handleToggleAudioMute = useCallback(() => {
    engineRef.current?.toggleAudioMute();
  }, []);

  const handleCycleTimeOfDay = useCallback(() => {
    engineRef.current?.cycleTimeOfDay();
  }, []);

  const timeLabel = TIME_OF_DAY_LABELS[status.timeOfDay];

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
        vehicleSpeedMode={status.vehicleSpeedMode}
        vehicleSpeedLimitKmh={status.vehicleSpeedLimitKmh}
        onMoveChange={handleMoveChange}
        onLookDelta={handleLookDelta}
        onSprintChange={handleSprintChange}
        onJump={handleJump}
        onInteract={handleInteract}
        onVehicleSteerChange={handleVehicleSteerChange}
        onVehicleThrottleChange={handleVehicleThrottleChange}
        onVehicleBrakeChange={handleVehicleBrakeChange}
        onCycleVehicleSpeedMode={handleCycleVehicleSpeedMode}
      />
      <DebugHud status={status} />
      <button
        type="button"
        className={`time-of-day-btn is-time-${status.timeOfDay}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={handleCycleTimeOfDay}
        aria-label={`時間帯を切替（現在: ${timeLabel.ja}）`}
        title={`Time: ${timeLabel.ja} (${timeLabel.en})`}
      >
        {status.timeOfDay === 'day' && (
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="4" />
            <line x1="12" y1="2" x2="12" y2="5" />
            <line x1="12" y1="19" x2="12" y2="22" />
            <line x1="4.93" y1="4.93" x2="7.05" y2="7.05" />
            <line x1="16.95" y1="16.95" x2="19.07" y2="19.07" />
            <line x1="2" y1="12" x2="5" y2="12" />
            <line x1="19" y1="12" x2="22" y2="12" />
            <line x1="4.93" y1="19.07" x2="7.05" y2="16.95" />
            <line x1="16.95" y1="7.05" x2="19.07" y2="4.93" />
          </svg>
        )}
        {status.timeOfDay === 'sunset' && (
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M17 18a5 5 0 0 0-10 0" />
            <line x1="12" y1="9" x2="12" y2="4" />
            <line x1="4.22" y1="10.22" x2="5.64" y2="11.64" />
            <line x1="1" y1="18" x2="23" y2="18" />
            <line x1="18.36" y1="11.64" x2="19.78" y2="10.22" />
            <line x1="5" y1="22" x2="19" y2="22" />
          </svg>
        )}
        {status.timeOfDay === 'night' && (
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
        <span className="time-of-day-label">{timeLabel.ja}</span>
      </button>
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
