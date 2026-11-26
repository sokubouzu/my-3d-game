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
  controlMode: 'foot',
  canEnterVehicle: false,
  canExitVehicle: false,
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

  return (
    <div className="viewport-root">
      <canvas ref={canvasRef} className="webgl-canvas" />
      <TouchControls
        controlMode={status.controlMode}
        canEnterVehicle={status.canEnterVehicle}
        canExitVehicle={status.canExitVehicle}
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
    </div>
  );
}

export default App;
