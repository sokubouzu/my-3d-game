import * as THREE from 'three';
import type { InputSnapshot } from '../input/inputManager';
import type { LoadedPlayerModel } from './playerModel';

export type PlayerLocomotionState = 'idle' | 'walk' | 'run' | 'jump' | 'fall';

export interface PlayerTelemetry {
  state: PlayerLocomotionState;
  animationName: string;
  speed: number;
  isGrounded: boolean;
  position: { x: number; y: number; z: number };
}

export interface GroundCollisionProvider {
  /** 指定 (x, z) 座標における地面の高さ Y を返す */
  getGroundHeight: (x: number, z: number) => number;
  /** 移動可能領域の半径（m） */
  worldHalfExtent: number;
  /** 建物・車両等の水平押し出し衝突解決（任意） */
  resolveHorizontalCollision?: (
    x: number,
    y: number,
    z: number,
    radius: number,
    playerHeight: number,
  ) => { x: number; z: number; collided: boolean };
}

const PLAYER_COLLISION_RADIUS = 0.38; // m
const WALK_SPEED = 1.85; // m/s
const RUN_SPEED = 4.8; // m/s
const ACCELERATION = 14.0; // m/s^2
const DECELERATION = 16.0; // m/s^2
const TURN_SPEED = 11.0; // rad/s
const GRAVITY = -18.0; // m/s^2
const JUMP_VELOCITY = 6.2; // m/s

const IDLE_SPEED_THRESHOLD = 0.15;
const RUN_SPEED_THRESHOLD = 3.0;
const CROSS_FADE_DURATION = 0.22;
const COYOTE_TIME = 0.12; // 秒: 接地判定の微小な猶予時間
const STEP_OFFSET = 0.2; // m: 縁石・段差を接地維持のまま吸収する最大高さ

/**
 * 1-C: 徒歩移動・加減速・Idle/Walk/Run/Jump スムーズ切替・基本地面衝突を管理する独立モジュール。
 */
export class PlayerController {
  private readonly player: LoadedPlayerModel;
  private readonly ground: GroundCollisionProvider;

  private readonly velocity = new THREE.Vector3();
  private readonly desiredVelocity = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();

  private yaw = 0; // +Z 正面向き
  private verticalVelocity = 0;
  private isGrounded = true;
  private coyoteTimer = COYOTE_TIME;
  private airborneTime = 0;
  private isJumping = false;
  private state: PlayerLocomotionState = 'idle';
  private activeAction: THREE.AnimationAction | null = null;
  private activeClipName = 'None';

  constructor(
    player: LoadedPlayerModel,
    ground: GroundCollisionProvider = {
      getGroundHeight: () => 0,
      worldHalfExtent: 48,
    },
  ) {
    this.player = player;
    this.ground = ground;

    const initialY = this.ground.getGroundHeight(0, 0);
    this.player.root.position.set(0, initialY, 0);
    this.player.root.rotation.set(0, this.yaw, 0);

    // 初期モーションを Idle で開始
    this.transitionToClip('Idle', true, 0.0);
  }

  /** プレイヤーの現在ワールド座標を取得 */
  public getPosition(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(this.player.root.position);
  }

  /** 乗車・降車時のプレイヤー表示切替 */
  public setVisible(visible: boolean): void {
    this.player.root.visible = visible;
    if (!visible) {
      this.velocity.set(0, 0, 0);
      this.verticalVelocity = 0;
    }
  }

  /** 降車時等にプレイヤーを指定位置・向きへ安全に再配置する */
  public teleportTo(x: number, y: number, z: number, yaw?: number): void {
    this.player.root.position.set(x, y, z);
    if (yaw !== undefined) {
      this.yaw = normalizeAngle(yaw);
      this.player.root.rotation.y = this.yaw;
    }
    this.velocity.set(0, 0, 0);
    this.verticalVelocity = 0;
    this.isGrounded = true;
    this.isJumping = false;
    this.coyoteTimer = COYOTE_TIME;
    this.airborneTime = 0;
    this.state = 'idle';
    this.transitionToClip('Idle', true, 0.0);
  }

  /** 現在の状態スナップショットを取得 */
  public getTelemetry(): PlayerTelemetry {
    const pos = this.player.root.position;
    return {
      state: this.state,
      animationName: this.activeClipName,
      speed: Math.hypot(this.velocity.x, this.velocity.z),
      isGrounded: this.isGrounded,
      position: {
        x: pos.x,
        y: pos.y,
        z: pos.z,
      },
    };
  }

  /**
   * 毎フレーム更新
   * @param dt 経過時間（秒）
   * @param input 統合入力スナップショット
   * @param cameraYaw カメラの水平角度（+Z 向きが 0）
   */
  public update(dt: number, input: InputSnapshot, cameraYaw: number): void {
    const clampedDt = Math.min(dt, 0.05);

    // カメラ基準の水平前方・右方向ベクトル（右手系 Y-up）
    this.forward.set(Math.sin(cameraYaw), 0, Math.cos(cameraYaw));
    this.right.set(-Math.cos(cameraYaw), 0, Math.sin(cameraYaw));

    const inputMag = Math.min(1, Math.hypot(input.moveX, input.moveY));
    const maxSpeed = input.sprint ? RUN_SPEED : WALK_SPEED;

    if (inputMag > 0.02) {
      this.desiredVelocity
        .set(0, 0, 0)
        .addScaledVector(this.right, input.moveX)
        .addScaledVector(this.forward, input.moveY);

      const dirLen = this.desiredVelocity.length();
      if (dirLen > 0.0001) {
        this.desiredVelocity.multiplyScalar((maxSpeed * inputMag) / dirLen);
      }
    } else {
      this.desiredVelocity.set(0, 0, 0);
    }

    // 加減速補間
    const accelRate = inputMag > 0.02 ? ACCELERATION : DECELERATION;
    const blend = 1 - Math.exp(-accelRate * clampedDt);
    this.velocity.x += (this.desiredVelocity.x - this.velocity.x) * blend;
    this.velocity.z += (this.desiredVelocity.z - this.velocity.z) * blend;

    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (horizontalSpeed < 0.02 && inputMag <= 0.02) {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }

    // 進行方向へスムーズに旋回（+Z がモデル正面）
    if (horizontalSpeed > 0.08) {
      const targetYaw = Math.atan2(this.velocity.x, this.velocity.z);
      const deltaAngle = normalizeAngle(targetYaw - this.yaw);
      const maxStep = TURN_SPEED * clampedDt;
      if (Math.abs(deltaAngle) <= maxStep) {
        this.yaw = targetYaw;
      } else {
        this.yaw += Math.sign(deltaAngle) * maxStep;
      }
      this.yaw = normalizeAngle(this.yaw);
      this.player.root.rotation.y = this.yaw;
    }

    // ジャンプ入力（接地中またはコヨーテタイム内なら許可）
    const canJump = this.isGrounded || this.coyoteTimer > 0;
    if (input.jumpPressed && canJump) {
      this.verticalVelocity = JUMP_VELOCITY;
      this.isGrounded = false;
      this.isJumping = true;
      this.coyoteTimer = 0;
      this.airborneTime = COYOTE_TIME;
    }

    const wasGrounded = this.isGrounded;

    // 重力と位置更新
    if (!this.isGrounded) {
      this.verticalVelocity += GRAVITY * clampedDt;
    }

    const pos = this.player.root.position;
    pos.x += this.velocity.x * clampedDt;
    pos.z += this.velocity.z * clampedDt;
    pos.y += this.verticalVelocity * clampedDt;

    // 建物・車両・小物との水平押し出し衝突解決（壁ずり対応）
    if (this.ground.resolveHorizontalCollision) {
      const resolved = this.ground.resolveHorizontalCollision(
        pos.x,
        pos.y,
        pos.z,
        PLAYER_COLLISION_RADIUS,
        this.player.info.heightMeters || 1.7,
      );
      pos.x = resolved.x;
      pos.z = resolved.z;
    }

    // ワールド基本境界クランプ
    const limit = this.ground.worldHalfExtent;
    pos.x = Math.max(-limit, Math.min(limit, pos.x));
    pos.z = Math.max(-limit, Math.min(limit, pos.z));

    // 基本地面衝突判定（ステップオフセット 0.2m による段差吸収 + コヨーテタイム 0.12s）
    const groundY = this.ground.getGroundHeight(pos.x, pos.z);
    const heightAboveGround = pos.y - groundY;

    if (this.verticalVelocity <= 0 && heightAboveGround <= 0) {
      pos.y = groundY;
      this.verticalVelocity = 0;
      this.isGrounded = true;
      this.isJumping = false;
      this.coyoteTimer = COYOTE_TIME;
      this.airborneTime = 0;
    } else if (
      wasGrounded &&
      !this.isJumping &&
      this.verticalVelocity <= 0 &&
      heightAboveGround > 0 &&
      heightAboveGround <= STEP_OFFSET
    ) {
      // 歩道・車道境界などの低い下り段差（<= 0.2m）を接地維持のまま吸着吸収
      pos.y = groundY;
      this.verticalVelocity = 0;
      this.isGrounded = true;
      this.coyoteTimer = COYOTE_TIME;
      this.airborneTime = 0;
    } else if (heightAboveGround > 0.02 || this.verticalVelocity > 0) {
      this.isGrounded = false;
      this.coyoteTimer = Math.max(0, this.coyoteTimer - clampedDt);
      this.airborneTime += clampedDt;
    }

    // 移動速度・接地状態に応じたアニメーション状態遷移
    this.updateLocomotionAnimation(horizontalSpeed);
    this.player.mixer.update(clampedDt);
  }

  private updateLocomotionAnimation(horizontalSpeed: number): void {
    if (!this.isGrounded) {
      if (this.verticalVelocity > 0.1 || this.isJumping) {
        if (this.verticalVelocity > 0.1) {
          this.state = 'jump';
          this.transitionToClip('Jumping', false, 0.12);
        } else {
          this.state = 'fall';
          if (this.activeClipName !== 'Jumping') {
            this.transitionToClip('FallingToLanding', false, 0.15);
          }
        }
        return;
      }

      // 意図しない微小な段差・コライダー継ぎ目での一瞬の浮きはコヨーテタイム中なら落下モーションへ遷移させない
      if (this.airborneTime >= COYOTE_TIME) {
        this.state = 'fall';
        if (this.activeClipName !== 'Jumping') {
          this.transitionToClip('FallingToLanding', false, 0.15);
        }
        return;
      }
    }

    if (horizontalSpeed >= RUN_SPEED_THRESHOLD) {
      this.state = 'run';
      this.transitionToClip('Running', true, CROSS_FADE_DURATION);
      if (this.activeAction) {
        const ratio = horizontalSpeed / RUN_SPEED;
        this.activeAction.timeScale = Math.max(0.75, Math.min(1.25, ratio));
      }
    } else if (horizontalSpeed >= IDLE_SPEED_THRESHOLD) {
      this.state = 'walk';
      this.transitionToClip('Walking', true, CROSS_FADE_DURATION);
      if (this.activeAction) {
        const ratio = horizontalSpeed / WALK_SPEED;
        this.activeAction.timeScale = Math.max(0.65, Math.min(1.4, ratio));
      }
    } else {
      this.state = 'idle';
      this.transitionToClip('Idle', true, CROSS_FADE_DURATION);
      if (this.activeAction) {
        this.activeAction.timeScale = 1.0;
      }
    }
  }

  private transitionToClip(
    clipName: string,
    loop: boolean,
    fadeDuration: number,
  ): void {
    const nextAction = this.player.actions.get(clipName);
    if (!nextAction) return;
    if (this.activeAction === nextAction && this.activeClipName === clipName) {
      return;
    }

    nextAction.enabled = true;
    nextAction.setLoop(
      loop ? THREE.LoopRepeat : THREE.LoopOnce,
      loop ? Infinity : 1,
    );
    nextAction.clampWhenFinished = !loop;
    nextAction.timeScale = 1.0;
    nextAction.reset();

    if (this.activeAction && fadeDuration > 0) {
      nextAction.play();
      this.activeAction.crossFadeTo(nextAction, fadeDuration, false);
    } else {
      if (this.activeAction) {
        this.activeAction.stop();
      }
      nextAction.play();
    }

    this.activeAction = nextAction;
    this.activeClipName = clipName;
  }
}

function normalizeAngle(angle: number): number {
  let result = angle;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}
