import type { AnimationClip, AnimationPlayer } from '@flighthq/sdk';
import { advanceAnimationPlayer, applyAnimationClipToScene3D, createAnimationPlayer } from '@flighthq/sdk';

export interface AnimationController {
  play(name: string): void;
  setSpeed(speed: number): void;
  step(dt: number): void;
}

export function createAnimationController(
  animations: Record<string, AnimationClip | undefined>, initial: string,
): AnimationController {
  const clip = animations[initial];
  if (!clip) throw new Error(`Missing AWD animation: ${initial}`);
  let player: AnimationPlayer = createAnimationPlayer(clip, { loop: true });
  function play(name: string): void {
    const next = animations[name]; if (!next) return;
    player = createAnimationPlayer(next, { loop: true });
  }
  return {
    play,
    setSpeed(speed) { player.speed = speed; },
    step(dt) { advanceAnimationPlayer(player, dt); applyAnimationClipToScene3D(player.clip, player.time); },
  };
}
