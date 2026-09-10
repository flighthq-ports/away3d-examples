import type { AnimationClip, AnimationPlayer } from '@flighthq/sdk';
import { advanceAnimationPlayer, applyAnimationClipToScene3D, createAnimationPlayer } from '@flighthq/sdk';

export interface AnimationController {
  step(dt: number): void;
  play(name: string): void;
  current(): string;
}

// Input binding lives in app.ts, which owns the original's cursor/WSAD/ZSQD scheme; this only
// swaps clips and advances the player.
export function createAnimationController(
  animations: Record<string, AnimationClip | undefined>, initial: string,
): AnimationController {
  const clip = animations[initial];
  if (!clip) throw new Error(`Missing AWD animation: ${initial}`);
  let currentName = initial;
  let player: AnimationPlayer = createAnimationPlayer(clip, { loop: true });
  function play(name: string): void {
    if (name === currentName) return;
    const next = animations[name];
    if (!next) return;
    currentName = name;
    player = createAnimationPlayer(next, { loop: true });
  }
  return {
    play,
    current: () => currentName,
    step(dt) {
      advanceAnimationPlayer(player, dt);
      applyAnimationClipToScene3D(player.clip, player.time);
    },
  };
}
