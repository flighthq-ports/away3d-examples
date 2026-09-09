import type { AnimationClip, AnimationPlayer } from '@flighthq/sdk';
import { advanceAnimationPlayer, applyAnimationClipToScene3D, createAnimationPlayer } from '@flighthq/sdk';

export interface AnimationController { step(dt: number): void; play(name: string): void; }

export function createAnimationController(
  animations: Record<string, AnimationClip | undefined>, initial: string, keys: readonly string[],
): AnimationController {
  const clip = animations[initial];
  if (!clip) throw new Error(`Missing AWD animation: ${initial}`);
  let player: AnimationPlayer = createAnimationPlayer(clip, { loop: true });
  function play(name: string): void {
    const next = animations[name]; if (!next) return;
    player = createAnimationPlayer(next, { loop: true });
  }
  document.addEventListener('keydown', (event) => {
    const index = Number(event.key) - 1; if (index >= 0 && index < keys.length) play(keys[index]!);
  });
  return {
    play,
    step(dt) {
      advanceAnimationPlayer(player, dt); applyAnimationClipToScene3D(player.clip, player.time);
    },
  };
}
