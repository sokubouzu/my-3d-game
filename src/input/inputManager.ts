export interface InputSnapshot {
  /** 左(-1)〜右(+1)の移動軸（カメラ基準の左右） */
  moveX: number;
  /** 後(-1)〜前(+1)の移動軸（カメラ基準の前後） */
  moveY: number;
  /** ダッシュ（Run）入力中か */
  sprint: boolean;
  /** 今回のフレームでジャンプが要求されたか（消費型） */
  jumpPressed: boolean;
  /** 今回のフレームで乗降インタラクト（E/F/タッチボタン）が要求されたか（消費型） */
  interactPressed: boolean;
  /** 車両ステアリング (-1 = 左, +1 = 右) */
  vehicleSteer: number;
  /** 車両アクセル (0..1) */
  vehicleThrottle: number;
  /** 車両ブレーキ / 停車後長押しでバック (0..1) */
  vehicleBrake: number;
  /** 車両サイドブレーキ / 強ブレーキ (Space) */
  vehicleHandbrake: boolean;
  /** 今回のフレームのカメラ水平回転量（px 相当、消費型） */
  lookDeltaX: number;
  /** 今回のフレームのカメラ垂直回転量（px 相当、消費型） */
  lookDeltaY: number;
  /** 今回のフレームのカメラズーム変化量（消費型） */
  zoomDelta: number;
}

/**
 * iPad タッチUI と PC（WASD + マウス + E/F + Space）の入力を統合する独立モジュール。
 */
export class InputManager {
  private readonly keysPressed = new Set<string>();
  private touchMoveX = 0;
  private touchMoveY = 0;
  private touchSprint = false;
  private jumpQueued = false;
  private interactQueued = false;
  private touchVehicleSteer = 0;
  private touchVehicleThrottle = 0;
  private touchVehicleBrake = 0;
  private lookDeltaX = 0;
  private lookDeltaY = 0;
  private zoomDelta = 0;

  private isMouseDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private readonly canvas: HTMLCanvasElement;

  private readonly handleKeyDown: (event: KeyboardEvent) => void;
  private readonly handleKeyUp: (event: KeyboardEvent) => void;
  private readonly handleWindowBlur: () => void;
  private readonly handleMouseDown: (event: MouseEvent) => void;
  private readonly handleMouseMove: (event: MouseEvent) => void;
  private readonly handleMouseUp: () => void;
  private readonly handleWheel: (event: WheelEvent) => void;
  private readonly handleContextMenu: (event: MouseEvent) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    this.handleKeyDown = (event: KeyboardEvent) => {
      const code = event.code;
      if (
        code === 'Space' ||
        code === 'ArrowUp' ||
        code === 'ArrowDown' ||
        code === 'ArrowLeft' ||
        code === 'ArrowRight'
      ) {
        event.preventDefault();
      }
      if (code === 'Space' && !this.keysPressed.has('Space')) {
        this.jumpQueued = true;
      }
      if (
        (code === 'KeyE' || code === 'KeyF') &&
        !this.keysPressed.has(code)
      ) {
        this.interactQueued = true;
      }
      this.keysPressed.add(code);
    };

    this.handleKeyUp = (event: KeyboardEvent) => {
      this.keysPressed.delete(event.code);
    };

    this.handleWindowBlur = () => {
      this.keysPressed.clear();
      this.isMouseDragging = false;
      this.touchVehicleSteer = 0;
      this.touchVehicleThrottle = 0;
      this.touchVehicleBrake = 0;
    };

    this.handleMouseDown = (event: MouseEvent) => {
      if (event.button === 0 || event.button === 2) {
        this.isMouseDragging = true;
        this.lastMouseX = event.clientX;
        this.lastMouseY = event.clientY;
      }
    };

    this.handleMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement === this.canvas) {
        this.lookDeltaX += event.movementX;
        this.lookDeltaY += event.movementY;
        return;
      }
      if (!this.isMouseDragging) return;
      const dx = event.clientX - this.lastMouseX;
      const dy = event.clientY - this.lastMouseY;
      this.lastMouseX = event.clientX;
      this.lastMouseY = event.clientY;
      this.lookDeltaX += dx;
      this.lookDeltaY += dy;
    };

    this.handleMouseUp = () => {
      this.isMouseDragging = false;
    };

    this.handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      this.zoomDelta += event.deltaY * 0.0025;
    };

    this.handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mouseup', this.handleMouseUp);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', this.handleContextMenu);
  }

  /** 仮想スティックからの移動軸を設定（x: 右+, y: 前+、各 -1〜1） */
  public setTouchMove(x: number, y: number): void {
    this.touchMoveX = Math.max(-1, Math.min(1, x));
    this.touchMoveY = Math.max(-1, Math.min(1, y));
  }

  /** タッチのダッシュボタン状態を設定 */
  public setTouchSprint(active: boolean): void {
    this.touchSprint = active;
  }

  /** タッチのジャンプボタン押下を通知 */
  public triggerJump(): void {
    this.jumpQueued = true;
  }

  /** タッチの乗降ボタン押下を通知 */
  public triggerInteract(): void {
    this.interactQueued = true;
  }

  /** 運転タッチUIからのステアリング (-1=左, +1=右) を設定 */
  public setTouchVehicleSteer(steer: number): void {
    this.touchVehicleSteer = Math.max(-1, Math.min(1, steer));
  }

  /** 運転タッチUIからのアクセル (0..1) を設定 */
  public setTouchVehicleThrottle(throttle: number): void {
    this.touchVehicleThrottle = Math.max(0, Math.min(1, throttle));
  }

  /** 運転タッチUIからのブレーキ／バック (0..1) を設定 */
  public setTouchVehicleBrake(brake: number): void {
    this.touchVehicleBrake = Math.max(0, Math.min(1, brake));
  }

  /** 右半分ドラッグからのカメラ回転量を加算 */
  public addLookDelta(dx: number, dy: number): void {
    this.lookDeltaX += dx;
    this.lookDeltaY += dy;
  }

  /** 現フレームの入力スナップショットを取得し、消費型イベントをリセット */
  public consumeSnapshot(): InputSnapshot {
    let keyX = 0;
    let keyY = 0;

    if (this.keysPressed.has('KeyD') || this.keysPressed.has('ArrowRight')) {
      keyX += 1;
    }
    if (this.keysPressed.has('KeyA') || this.keysPressed.has('ArrowLeft')) {
      keyX -= 1;
    }
    if (this.keysPressed.has('KeyW') || this.keysPressed.has('ArrowUp')) {
      keyY += 1;
    }
    if (this.keysPressed.has('KeyS') || this.keysPressed.has('ArrowDown')) {
      keyY -= 1;
    }

    // 車両運転用入力（タッチ優先、なければキーボード WASD + Space）
    const vehicleSteer =
      Math.abs(this.touchVehicleSteer) > 0.01 ? this.touchVehicleSteer : keyX;
    const vehicleThrottle =
      this.touchVehicleThrottle > 0.01
        ? this.touchVehicleThrottle
        : keyY > 0
          ? 1
          : 0;
    const vehicleBrake =
      this.touchVehicleBrake > 0.01
        ? this.touchVehicleBrake
        : keyY < 0
          ? 1
          : 0;
    const vehicleHandbrake = this.keysPressed.has('Space');

    // キーボード斜め入力を単位円に正規化（徒歩移動用）
    const keyLen = Math.hypot(keyX, keyY);
    if (keyLen > 1) {
      keyX /= keyLen;
      keyY /= keyLen;
    }

    // タッチ入力とキーボード入力を合成（より大きい方を優先）
    const touchLen = Math.hypot(this.touchMoveX, this.touchMoveY);
    let moveX = touchLen > 0.01 ? this.touchMoveX : keyX;
    let moveY = touchLen > 0.01 ? this.touchMoveY : keyY;

    const totalLen = Math.hypot(moveX, moveY);
    if (totalLen > 1) {
      moveX /= totalLen;
      moveY /= totalLen;
    }

    const keySprint =
      this.keysPressed.has('ShiftLeft') || this.keysPressed.has('ShiftRight');

    const snapshot: InputSnapshot = {
      moveX,
      moveY,
      sprint: this.touchSprint || keySprint,
      jumpPressed: this.jumpQueued,
      interactPressed: this.interactQueued,
      vehicleSteer,
      vehicleThrottle,
      vehicleBrake,
      vehicleHandbrake,
      lookDeltaX: this.lookDeltaX,
      lookDeltaY: this.lookDeltaY,
      zoomDelta: this.zoomDelta,
    };

    this.jumpQueued = false;
    this.interactQueued = false;
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.zoomDelta = 0;

    return snapshot;
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mouseup', this.handleMouseUp);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
  }
}
