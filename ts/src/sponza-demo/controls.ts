import type { FirstPersonController } from '../../shared/camera';
import { AWAY_MOUSE_SENSITIVITY } from '../../shared/camera';

const WALK_INCREMENT = 10;
const STRAFE_INCREMENT = 10;
const DRAG = 0.5;

export function bindFirstPersonControls(canvas: HTMLCanvasElement, fps: FirstPersonController): () => void {
  let dragging = false;
  let lastMouseX = 0;
  let lastMouseY = 0;
  let savedYaw = fps.yaw;
  let savedPitch = fps.pitch;

  canvas.addEventListener('mousedown', (e: MouseEvent) => {
    dragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    savedYaw = fps.yaw;
    savedPitch = fps.pitch;
  });

  canvas.addEventListener('mousemove', (e: MouseEvent) => {
    if (!dragging) return;
    fps.yaw = AWAY_MOUSE_SENSITIVITY * (e.clientX - lastMouseX) + savedYaw;
    fps.pitch = AWAY_MOUSE_SENSITIVITY * (e.clientY - lastMouseY) + savedPitch;
  });

  window.addEventListener('mouseup', () => {
    dragging = false;
  });

  const keysDown = new Set<string>();

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    keysDown.add(e.key.toLowerCase());
  });

  window.addEventListener('keyup', (e: KeyboardEvent) => {
    keysDown.delete(e.key.toLowerCase());
  });

  const fwd = { x: 0, y: 0, z: 0 };
  const rgt = { x: 0, y: 0, z: 0 };
  let walkSpeed = 0;
  let strafeSpeed = 0;

  return function step(): void {
    let walkAccel = 0;
    let strafeAccel = 0;

    if (keysDown.has('w') || keysDown.has('arrowup')) walkAccel = WALK_INCREMENT;
    if (keysDown.has('s') || keysDown.has('arrowdown')) walkAccel = -WALK_INCREMENT;
    if (keysDown.has('a') || keysDown.has('arrowleft')) strafeAccel = -STRAFE_INCREMENT;
    if (keysDown.has('d') || keysDown.has('arrowright')) strafeAccel = STRAFE_INCREMENT;

    walkSpeed = (walkSpeed + walkAccel) * DRAG;
    if (Math.abs(walkSpeed) < 0.01) walkSpeed = 0;

    strafeSpeed = (strafeSpeed + strafeAccel) * DRAG;
    if (Math.abs(strafeSpeed) < 0.01) strafeSpeed = 0;

    fps.forward(fwd);
    fps.right(rgt);

    fps.position.x += fwd.x * walkSpeed + rgt.x * strafeSpeed;
    fps.position.z += fwd.z * walkSpeed + rgt.z * strafeSpeed;

    fps.update();
  };
}
