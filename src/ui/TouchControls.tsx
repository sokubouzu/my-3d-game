import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { ControlMode } from '../engine/scene';
import type { VehicleGear } from '../vehicle';

export interface TouchControlsProps {
  controlMode: ControlMode;
  canEnterVehicle: boolean;
  canExitVehicle: boolean;
  nearbyVehicleName: string | null;
  vehicleSpeedKmh: number;
  vehicleGear: VehicleGear;
  onMoveChange: (x: number, y: number) => void;
  onLookDelta: (dx: number, dy: number) => void;
  onSprintChange: (active: boolean) => void;
  onJump: () => void;
  onInteract: () => void;
  onVehicleSteerChange: (steer: number) => void;
  onVehicleThrottleChange: (throttle: number) => void;
  onVehicleBrakeChange: (brake: number) => void;
}

const STICK_MAX_RADIUS = 46;

/**
 * 1-C / 2-B / 2-C: iPad 横画面（ランドスケープ）向けマルチタッチ操作 UI。
 * - 徒歩モード: 左下移動スティック / 右半分カメラ回転 / 右下 DASH・JUMP・（近接時）乗車ボタン
 * - 運転モード: 左下左右ステアリングボタン / 右半分カメラ回転 / 右下 ブレーキ(バック)・アクセル・降車ボタン / 下部中央スピードメーター
 */
export function TouchControls({
  controlMode,
  canEnterVehicle,
  canExitVehicle,
  nearbyVehicleName,
  vehicleSpeedKmh,
  vehicleGear,
  onMoveChange,
  onLookDelta,
  onSprintChange,
  onJump,
  onInteract,
  onVehicleSteerChange,
  onVehicleThrottleChange,
  onVehicleBrakeChange,
}: TouchControlsProps) {
  const stickBaseRef = useRef<HTMLDivElement | null>(null);
  const stickPointerIdRef = useRef<number | null>(null);
  const stickCenterRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [stickActive, setStickActive] = useState(false);

  const lookPointerIdRef = useRef<number | null>(null);
  const lastLookPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const sprintPointerIdRef = useRef<number | null>(null);
  const [sprintPressed, setSprintPressed] = useState(false);
  const [jumpPressed, setJumpPressed] = useState(false);

  // 運転モード用ポインタ管理（マルチタッチ同時押し対応）
  const steerLeftPointerIdRef = useRef<number | null>(null);
  const steerRightPointerIdRef = useRef<number | null>(null);
  const accelPointerIdRef = useRef<number | null>(null);
  const brakePointerIdRef = useRef<number | null>(null);

  const [steerLeftPressed, setSteerLeftPressed] = useState(false);
  const [steerRightPressed, setSteerRightPressed] = useState(false);
  const [accelPressed, setAccelPressed] = useState(false);
  const [brakePressed, setBrakePressed] = useState(false);

  // モード切替時に押しっぱなしタッチ状態を確実にリセット
  useEffect(() => {
    stickPointerIdRef.current = null;
    setStickActive(false);
    setKnobOffset({ x: 0, y: 0 });
    onMoveChange(0, 0);

    sprintPointerIdRef.current = null;
    setSprintPressed(false);
    onSprintChange(false);

    steerLeftPointerIdRef.current = null;
    steerRightPointerIdRef.current = null;
    setSteerLeftPressed(false);
    setSteerRightPressed(false);
    onVehicleSteerChange(0);

    accelPointerIdRef.current = null;
    setAccelPressed(false);
    onVehicleThrottleChange(0);

    brakePointerIdRef.current = null;
    setBrakePressed(false);
    onVehicleBrakeChange(0);
  }, [
    controlMode,
    onMoveChange,
    onSprintChange,
    onVehicleSteerChange,
    onVehicleThrottleChange,
    onVehicleBrakeChange,
  ]);

  const emitSteerState = (leftActive: boolean, rightActive: boolean) => {
    const steer = (rightActive ? 1 : 0) - (leftActive ? 1 : 0);
    onVehicleSteerChange(steer);
  };

  const updateStickPosition = (clientX: number, clientY: number) => {
    const dx = clientX - stickCenterRef.current.x;
    const dy = clientY - stickCenterRef.current.y;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, STICK_MAX_RADIUS);
    const angle = Math.atan2(dy, dx);
    const offsetX = dist > 0.001 ? Math.cos(angle) * clampedDist : 0;
    const offsetY = dist > 0.001 ? Math.sin(angle) * clampedDist : 0;

    setKnobOffset({ x: offsetX, y: offsetY });
    onMoveChange(offsetX / STICK_MAX_RADIUS, -offsetY / STICK_MAX_RADIUS);
  };

  const resetStick = () => {
    stickPointerIdRef.current = null;
    setStickActive(false);
    setKnobOffset({ x: 0, y: 0 });
    onMoveChange(0, 0);
  };

  const handleStickDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (stickPointerIdRef.current !== null) return;
    event.preventDefault();
    event.stopPropagation();

    const base = stickBaseRef.current;
    if (base) {
      const rect = base.getBoundingClientRect();
      stickCenterRef.current = {
        x: rect.left + rect.width * 0.5,
        y: rect.top + rect.height * 0.5,
      };
    } else {
      stickCenterRef.current = { x: event.clientX, y: event.clientY };
    }

    stickPointerIdRef.current = event.pointerId;
    setStickActive(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }
    updateStickPosition(event.clientX, event.clientY);
  };

  const handleStickMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (stickPointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    updateStickPosition(event.clientX, event.clientY);
  };

  const handleStickUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (stickPointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
    resetStick();
  };

  const handleLookDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (lookPointerIdRef.current !== null) return;
    event.preventDefault();
    lookPointerIdRef.current = event.pointerId;
    lastLookPosRef.current = { x: event.clientX, y: event.clientY };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  const handleLookMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (lookPointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    const dx = event.clientX - lastLookPosRef.current.x;
    const dy = event.clientY - lastLookPosRef.current.y;
    lastLookPosRef.current = { x: event.clientX, y: event.clientY };
    onLookDelta(dx, dy);
  };

  const handleLookUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (lookPointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    lookPointerIdRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  const handleSprintDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (sprintPointerIdRef.current !== null) return;
    event.preventDefault();
    event.stopPropagation();
    sprintPointerIdRef.current = event.pointerId;
    setSprintPressed(true);
    onSprintChange(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  const handleSprintUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (sprintPointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    sprintPointerIdRef.current = null;
    setSprintPressed(false);
    onSprintChange(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  const handleJumpDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setJumpPressed(true);
    onJump();
  };

  const handleJumpUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setJumpPressed(false);
  };

  const handleInteractDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onInteract();
  };

  const handleSteerLeftDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (steerLeftPointerIdRef.current !== null) return;
    event.preventDefault();
    event.stopPropagation();
    steerLeftPointerIdRef.current = event.pointerId;
    setSteerLeftPressed(true);
    emitSteerState(true, steerRightPointerIdRef.current !== null);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  const handleSteerLeftUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (steerLeftPointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    steerLeftPointerIdRef.current = null;
    setSteerLeftPressed(false);
    emitSteerState(false, steerRightPointerIdRef.current !== null);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  const handleSteerRightDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (steerRightPointerIdRef.current !== null) return;
    event.preventDefault();
    event.stopPropagation();
    steerRightPointerIdRef.current = event.pointerId;
    setSteerRightPressed(true);
    emitSteerState(steerLeftPointerIdRef.current !== null, true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  const handleSteerRightUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (steerRightPointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    steerRightPointerIdRef.current = null;
    setSteerRightPressed(false);
    emitSteerState(steerLeftPointerIdRef.current !== null, false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  const handleAccelDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (accelPointerIdRef.current !== null) return;
    event.preventDefault();
    event.stopPropagation();
    accelPointerIdRef.current = event.pointerId;
    setAccelPressed(true);
    onVehicleThrottleChange(1);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  const handleAccelUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (accelPointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    accelPointerIdRef.current = null;
    setAccelPressed(false);
    onVehicleThrottleChange(0);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  const handleBrakeDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (brakePointerIdRef.current !== null) return;
    event.preventDefault();
    event.stopPropagation();
    brakePointerIdRef.current = event.pointerId;
    setBrakePressed(true);
    onVehicleBrakeChange(1);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  const handleBrakeUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (brakePointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    brakePointerIdRef.current = null;
    setBrakePressed(false);
    onVehicleBrakeChange(0);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  return (
    <div className="touch-layer" aria-label="Touch Controls">
      {/* 画面右半分ドラッグ: カメラ回転（徒歩・運転共通） */}
      <div
        className="camera-drag-zone"
        onPointerDown={handleLookDown}
        onPointerMove={handleLookMove}
        onPointerUp={handleLookUp}
        onPointerCancel={handleLookUp}
        onLostPointerCapture={handleLookUp}
      />

      {controlMode === 'foot' ? (
        <>
          {/* 徒歩: 画面左下 移動バーチャルスティック */}
          <div
            ref={stickBaseRef}
            className={`virtual-stick-base${stickActive ? ' is-active' : ''}`}
            onPointerDown={handleStickDown}
            onPointerMove={handleStickMove}
            onPointerUp={handleStickUp}
            onPointerCancel={handleStickUp}
            onLostPointerCapture={handleStickUp}
            role="slider"
            aria-label="Movement Stick"
            aria-valuemin={-1}
            aria-valuemax={1}
            aria-valuenow={
              Math.round(
                (Math.hypot(knobOffset.x, knobOffset.y) / STICK_MAX_RADIUS) *
                  100,
              ) / 100
            }
          >
            <div className="virtual-stick-ring" />
            <div
              className="virtual-stick-knob"
              style={{
                transform: `translate3d(${knobOffset.x}px, ${knobOffset.y}px, 0)`,
              }}
            />
          </div>

          {/* 徒歩: 車両近接時の乗車ボタン */}
          {canEnterVehicle && (
            <button
              type="button"
              className="interact-btn interact-btn-enter"
              onPointerDown={handleInteractDown}
              aria-label="Enter Vehicle"
            >
              <span className="interact-btn-main">乗る</span>
              <span className="interact-btn-key">
                {nearbyVehicleName ? `${nearbyVehicleName} (E/F)` : 'E / F'}
              </span>
            </button>
          )}

          {/* 徒歩: 画面右下 ダッシュ・ジャンプボタン */}
          <div className="action-buttons">
            <button
              type="button"
              className={`action-btn action-btn-sprint${sprintPressed ? ' is-pressed' : ''}`}
              onPointerDown={handleSprintDown}
              onPointerUp={handleSprintUp}
              onPointerCancel={handleSprintUp}
              onLostPointerCapture={handleSprintUp}
              aria-label="Dash"
            >
              <span className="action-btn-label">DASH</span>
            </button>

            <button
              type="button"
              className={`action-btn action-btn-jump${jumpPressed ? ' is-pressed' : ''}`}
              onPointerDown={handleJumpDown}
              onPointerUp={handleJumpUp}
              onPointerCancel={handleJumpUp}
              aria-label="Jump"
            >
              <span className="action-btn-label">JUMP</span>
            </button>
          </div>
        </>
      ) : (
        <>
          {/* 運転: 画面左下 左右ステアリングボタン */}
          <div className="drive-steer-group" aria-label="Steering Controls">
            <button
              type="button"
              className={`drive-steer-btn${steerLeftPressed ? ' is-pressed' : ''}`}
              onPointerDown={handleSteerLeftDown}
              onPointerUp={handleSteerLeftUp}
              onPointerCancel={handleSteerLeftUp}
              onLostPointerCapture={handleSteerLeftUp}
              aria-label="Steer Left"
            >
              <span className="drive-steer-arrow">◀</span>
              <span className="drive-steer-sub">LEFT</span>
            </button>

            <button
              type="button"
              className={`drive-steer-btn${steerRightPressed ? ' is-pressed' : ''}`}
              onPointerDown={handleSteerRightDown}
              onPointerUp={handleSteerRightUp}
              onPointerCancel={handleSteerRightUp}
              onLostPointerCapture={handleSteerRightUp}
              aria-label="Steer Right"
            >
              <span className="drive-steer-arrow">▶</span>
              <span className="drive-steer-sub">RIGHT</span>
            </button>
          </div>

          {/* 運転: 画面下部中央 軽量デジタル速度計 */}
          <div className="drive-speedometer" aria-label="Speedometer">
            <span className={`drive-gear drive-gear-${vehicleGear.toLowerCase()}`}>
              {vehicleGear}
            </span>
            <span className="drive-speed-value">{vehicleSpeedKmh}</span>
            <span className="drive-speed-unit">km/h</span>
          </div>

          {/* 運転: 画面右下 降車ボタン + ブレーキ/バック + アクセルペダル */}
          <div className="drive-right-controls">
            <button
              type="button"
              className={`interact-btn interact-btn-exit${canExitVehicle ? '' : ' is-disabled'}`}
              onPointerDown={canExitVehicle ? handleInteractDown : undefined}
              disabled={!canExitVehicle}
              aria-label="Exit Vehicle"
            >
              <span className="interact-btn-main">降りる</span>
              <span className="interact-btn-key">
                {canExitVehicle ? 'E / F' : '停車で降車'}
              </span>
            </button>

            <div className="drive-pedal-group">
              <button
                type="button"
                className={`drive-pedal drive-pedal-brake${brakePressed ? ' is-pressed' : ''}`}
                onPointerDown={handleBrakeDown}
                onPointerUp={handleBrakeUp}
                onPointerCancel={handleBrakeUp}
                onLostPointerCapture={handleBrakeUp}
                aria-label="Brake or Reverse"
              >
                <span className="drive-pedal-title">BRAKE</span>
                <span className="drive-pedal-sub">長押し: バック</span>
              </button>

              <button
                type="button"
                className={`drive-pedal drive-pedal-accel${accelPressed ? ' is-pressed' : ''}`}
                onPointerDown={handleAccelDown}
                onPointerUp={handleAccelUp}
                onPointerCancel={handleAccelUp}
                onLostPointerCapture={handleAccelUp}
                aria-label="Accelerate"
              >
                <span className="drive-pedal-title">ACCEL</span>
                <span className="drive-pedal-sub">前進</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
