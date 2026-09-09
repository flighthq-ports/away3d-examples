import type { Camera3D, Vector3Like } from '@flighthq/sdk';
import {
  createCamera3D,
  createPerspectiveProjection,
  createVector3,
  DEG_TO_RAD,
  setCamera3DViewMatrix4FromLookAt,
} from '@flighthq/sdk';

// AwayJS uses a left-handed coordinate system (+Z into screen).
// Flight uses right-handed (+Z out of screen). These helpers accept
// AwayJS-convention values and produce correct Flight equivalents
// so the original numbers stay readable in the call site.

export interface AwayPerspectiveCameraOptions {
  x?: number;
  y?: number;
  z?: number;
  targetX?: number;
  targetY?: number;
  targetZ?: number;
  fov?: number;
  near?: number;
  far?: number;
  aspect?: number;
}

export function createCameraFromAway(opts: Readonly<AwayPerspectiveCameraOptions>): Camera3D {
  const fovDeg = opts.fov ?? 60;
  const near = opts.near ?? 20;
  const far = opts.far ?? 3000;
  const aspect = opts.aspect ?? window.innerWidth / window.innerHeight;

  const camera = createCamera3D({
    near,
    far,
    projection: createPerspectiveProjection({
      fovY: fovDeg * DEG_TO_RAD,
      aspect,
    }),
  });

  const eye = createVector3(opts.x ?? 0, opts.y ?? 0, -(opts.z ?? 0));
  const target = createVector3(opts.targetX ?? 0, opts.targetY ?? 0, -(opts.targetZ ?? 0));
  const up = createVector3(0, 1, 0);
  setCamera3DViewMatrix4FromLookAt(camera, eye, target, up);

  return camera;
}

export interface AwayOrbitOptions {
  distance: number;
  panAngle?: number;
  tiltAngle?: number;
  minTiltAngle?: number;
  maxTiltAngle?: number;
  targetX?: number;
  targetY?: number;
  targetZ?: number;
  mouseSensitivity?: number;
  // AwayJS HoverController defaults — vertical travel multiplier and easing step count.
  yFactor?: number;
  steps?: number;
}

export interface OrbitController {
  readonly camera: Camera3D;
  readonly eye: Vector3Like;
  readonly target: Vector3Like;
  readonly up: Vector3Like;
  distance: number;
  panAngle: number;
  tiltAngle: number;
  update(): void;
}

export function createOrbitControllerFromAway(camera: Camera3D, opts: Readonly<AwayOrbitOptions>): OrbitController {
  const minTilt = (opts.minTiltAngle ?? -90) * DEG_TO_RAD;
  const maxTilt = (opts.maxTiltAngle ?? 90) * DEG_TO_RAD;

  // AwayJS HoverController defaults: yFactor 2 doubles the vertical orbit travel, and steps 8
  // eases the applied angles toward the target over steps+1 frames (the drag's glide). Omitting
  // these made the camera move noticeably less than the AwayJS original when panning/tilting.
  const yFactor = opts.yFactor ?? 2;
  const steps = Math.max(1, opts.steps ?? 8);
  const SNAP_ANGLE = 0.01 * DEG_TO_RAD;

  const eye = createVector3(0, 0, 0);
  const target = createVector3(opts.targetX ?? 0, opts.targetY ?? 0, -(opts.targetZ ?? 0));
  const up = createVector3(0, 1, 0);

  // Applied angles that ease toward the public target angles, seeded to the initial target so
  // there is no startup glide (matches HoverController seeding current = target in its ctor).
  let currentPan = (opts.panAngle ?? 0) * DEG_TO_RAD;
  let currentTilt = (opts.tiltAngle ?? 0) * DEG_TO_RAD;

  const controller: OrbitController = {
    camera,
    eye,
    target,
    up,
    distance: opts.distance,
    panAngle: (opts.panAngle ?? 0) * DEG_TO_RAD,
    tiltAngle: (opts.tiltAngle ?? 0) * DEG_TO_RAD,

    update() {
      // AwayJS clamps the target tilt in its setter; clamp before easing toward it.
      this.tiltAngle = Math.max(minTilt, Math.min(maxTilt, this.tiltAngle));

      currentPan += (this.panAngle - currentPan) / (steps + 1);
      currentTilt += (this.tiltAngle - currentTilt) / (steps + 1);
      if (Math.abs(this.panAngle - currentPan) < SNAP_ANGLE && Math.abs(this.tiltAngle - currentTilt) < SNAP_ANGLE) {
        currentPan = this.panAngle;
        currentTilt = this.tiltAngle;
      }

      const sinPan = Math.sin(currentPan);
      const cosPan = Math.cos(currentPan);
      const sinTilt = Math.sin(currentTilt);
      const cosTilt = Math.cos(currentTilt);

      eye.x = target.x + this.distance * sinPan * cosTilt;
      eye.y = target.y + this.distance * sinTilt * yFactor;
      eye.z = target.z - this.distance * cosPan * cosTilt;

      // HoverController rolls the up axis by tilt so lookAt stays well-defined up to tilt = 90°
      // (a fixed +Y up collapses when looking straight down). Z is negated to match the eye's
      // negated Z term above (Flight right-handed vs AwayJS left-handed).
      up.x = -sinPan * sinTilt;
      up.y = cosTilt;
      up.z = cosPan * sinTilt;

      setCamera3DViewMatrix4FromLookAt(camera, eye, target, up);
    },
  };

  controller.update();
  return controller;
}

export const AWAY_MOUSE_SENSITIVITY = 0.3 * DEG_TO_RAD;

export interface AwayFirstPersonOptions {
  x?: number;
  y?: number;
  z?: number;
  yaw?: number;
  pitch?: number;
  minPitch?: number;
  maxPitch?: number;
}

export interface FirstPersonController {
  readonly camera: Camera3D;
  readonly position: Vector3Like;
  yaw: number;
  pitch: number;
  update(): void;
  forward(out: Vector3Like): void;
  right(out: Vector3Like): void;
}

export function createFirstPersonControllerFromAway(
  camera: Camera3D,
  opts: Readonly<AwayFirstPersonOptions>,
): FirstPersonController {
  const minPitch = (opts.minPitch ?? -80) * DEG_TO_RAD;
  const maxPitch = (opts.maxPitch ?? 80) * DEG_TO_RAD;

  const pos = createVector3(opts.x ?? 0, opts.y ?? 0, -(opts.z ?? 0));
  const eye = createVector3(0, 0, 0);
  const up = createVector3(0, 1, 0);

  const controller: FirstPersonController = {
    camera,
    position: pos,
    yaw: (opts.yaw ?? 0) * DEG_TO_RAD,
    pitch: (opts.pitch ?? 0) * DEG_TO_RAD,

    update() {
      this.pitch = Math.max(minPitch, Math.min(maxPitch, this.pitch));

      eye.x = pos.x + Math.sin(this.yaw) * Math.cos(this.pitch);
      eye.y = pos.y - Math.sin(this.pitch);
      eye.z = pos.z - Math.cos(this.yaw) * Math.cos(this.pitch);

      setCamera3DViewMatrix4FromLookAt(camera, pos, eye, up);
    },

    forward(out: Vector3Like) {
      out.x = Math.sin(this.yaw);
      out.y = 0;
      out.z = -Math.cos(this.yaw);
    },

    right(out: Vector3Like) {
      out.x = Math.cos(this.yaw);
      out.y = 0;
      out.z = Math.sin(this.yaw);
    },
  };

  controller.update();
  return controller;
}

export function awayDirection(x: number, y: number, z: number): { x: number; y: number; z: number } {
  return { x, y, z: -z };
}

export function awayPosition(x: number, y: number, z: number): [number, number, number] {
  return [x, y, -z];
}

export function setAwayPosition(out: Vector3Like, x: number, y: number, z: number): void {
  out.x = x;
  out.y = y;
  out.z = -z;
}

export interface BindOrbitDragOptions {
  minDistance?: number;
  maxDistance?: number;
}

export function bindOrbitDrag(
  canvas: HTMLCanvasElement,
  orbit: OrbitController,
  opts?: Readonly<BindOrbitDragOptions>,
): void {
  let dragging = false;
  let lastMouseX = 0;
  let lastMouseY = 0;
  let savedPan = orbit.panAngle;
  let savedTilt = orbit.tiltAngle;

  canvas.addEventListener('mousedown', (e: MouseEvent) => {
    dragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    savedPan = orbit.panAngle;
    savedTilt = orbit.tiltAngle;
  });

  canvas.addEventListener('mousemove', (e: MouseEvent) => {
    if (!dragging) return;
    orbit.panAngle = AWAY_MOUSE_SENSITIVITY * (e.clientX - lastMouseX) + savedPan;
    orbit.tiltAngle = AWAY_MOUSE_SENSITIVITY * (e.clientY - lastMouseY) + savedTilt;
  });

  window.addEventListener('mouseup', () => {
    dragging = false;
  });

  if (opts) {
    const minDist = opts.minDistance ?? 100;
    const maxDist = opts.maxDistance ?? 2000;
    canvas.addEventListener('wheel', (e: WheelEvent) => {
      orbit.distance -= e.deltaY / 2;
      if (orbit.distance < minDist) orbit.distance = minDist;
      else if (orbit.distance > maxDist) orbit.distance = maxDist;
    });
  }
}
