import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

export interface TouchControlsProps {
  onMoveChange: (x: number, y: number) => void;
  onLookDelta: (dx: number, dy: number) => void;
  onSprintChange: (active: boolean) => void;
  onJump: () => void;
}

const STICK_MAX_RADIUS = 46;

/**
 * 1-C: iPad 横画面（ランドスケープ）向けマルチタッチ操作 UI。
 * - 左下: 移動バーチャルスティック
 * - 右半分ドラッグ: カメラ回転
 * - 右下: ダッシュ・ジャンプボタン
 */
export function TouchControls({
  onMoveChange,
  onLookDelta,
  onSprintChange,
  onJump,
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

  const updateStickPosition = (clientX: number, clientY: number) => {
    const dx = clientX - stickCenterRef.current.x;
    const dy = clientY - stickCenterRef.current.y;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, STICK_MAX_RADIUS);
    const angle = Math.atan2(dy, dx);
    const offsetX = dist > 0.001 ? Math.cos(angle) * clampedDist : 0;
    const offsetY = dist > 0.001 ? Math.sin(angle) * clampedDist : 0;

    setKnobOffset({ x: offsetX, y: offsetY });
    // 上方向ドラッグが前進 (+Y)
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
      // ignore if pointer capture is unavailable
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

  return (
    <div className="touch-layer" aria-label="Touch Controls">
      {/* 画面右半分ドラッグ: カメラ回転 */}
      <div
        className="camera-drag-zone"
        onPointerDown={handleLookDown}
        onPointerMove={handleLookMove}
        onPointerUp={handleLookUp}
        onPointerCancel={handleLookUp}
        onLostPointerCapture={handleLookUp}
      />

      {/* 画面左下: 移動バーチャルスティック */}
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
        aria-valuenow={Math.round(
          Math.hypot(knobOffset.x, knobOffset.y) / STICK_MAX_RADIUS * 100,
        ) / 100}
      >
        <div className="virtual-stick-ring" />
        <div
          className="virtual-stick-knob"
          style={{
            transform: `translate3d(${knobOffset.x}px, ${knobOffset.y}px, 0)`,
          }}
        />
      </div>

      {/* 画面右下: ダッシュ・ジャンプボタン */}
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
    </div>
  );
}
