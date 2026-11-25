import { useState } from 'react';
import type { EngineStatus } from '../engine/scene';

export interface DebugHudProps {
  status: EngineStatus;
}

/**
 * 画面左上: 開閉可能な軽量 FPS・状態表示 HUD。
 */
export function DebugHud({ status }: DebugHudProps) {
  const [expanded, setExpanded] = useState(false);

  const stateLabel = status.playerState.toUpperCase();
  const fpsLabel = status.fps > 0 ? `${status.fps} FPS` : '-- FPS';

  return (
    <aside className="hud-container" aria-label="Engine Status">
      <button
        type="button"
        className="hud-toggle"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        <span className="hud-badge-fps">{fpsLabel}</span>
        <span className="hud-badge-state">{stateLabel}</span>
        <span className="hud-toggle-icon">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="hud-details">
          <div className="hud-title">my-3d-game (Phase 1-D / 1-E)</div>
          <div>
            API: {status.isWebGL2 ? 'WebGL2' : 'WebGL1'} | DPR:{' '}
            {status.dpr.toFixed(2)}
          </div>
          <div>DRACO: {status.dracoReady ? 'Ready' : 'Init...'}</div>
          <div>
            Player:{' '}
            {status.playerLoaded
              ? `OK (${status.playerHeight.toFixed(2)}m, ${status.jointCount} bones)`
              : status.playerError
                ? `Error: ${status.playerError}`
                : 'Loading...'}
          </div>
          <div>
            City: {status.cityLoadedCount}/{status.cityTotalCount} GLB
            {status.cityFailedCount > 0
              ? ` (${status.cityFailedCount} err)`
              : ''}{' '}
            | Colliders: {status.colliderCount}
          </div>
          <div>
            Env: Sky={status.envStatus.sky} / Road={status.envStatus.asphalt}
          </div>
          <div>
            Anim: {status.animationName} ({status.speed.toFixed(2)} m/s)
          </div>
          <div>
            Pos: ({status.position.x.toFixed(1)}, {status.position.y.toFixed(2)}
            , {status.position.z.toFixed(1)})
          </div>
          <div className="hud-hint">
            PC: WASD / Shift / Space / Drag+Wheel
          </div>
        </div>
      )}
    </aside>
  );
}
