import type { AnimationClip, AnimationPlayer, AnimationRootMotionExtractor, Vector3Like } from '@flighthq/sdk';
import {
  advanceAnimationPlayer,
  applyAnimationClipToScene3D,
  createAnimationPlayer,
  createAnimationRootMotionExtractor,
  extractAnimationRootMotion,
} from '@flighthq/sdk';

export interface AnimationController {
  play(name: string): void;
  setSpeed(speed: number): void;
  // Advances the clip and writes this step's root-motion translation into `outDelta`, in the
  // skeleton's own space. Zero when the active clip carries no root motion.
  step(dt: number, outDelta: Vector3Like): void;
}

// The AWD walk and run clips carry their forward travel on channel 0, a three-component
// translation track — that is what makes the bear cross the snow rather than tread in place.
// applyAnimationClipToScene3D does not apply it (its target does not resolve to a scene node), so
// reading it here and moving the mesh with it cannot double-count against the posed skeleton.
const ROOT_MOTION_CHANNEL = 0;

function rootMotionExtractorFor(clip: AnimationClip): AnimationRootMotionExtractor | null {
  const channel = clip.channels[ROOT_MOTION_CHANNEL];
  if (!channel || channel.track.quaternion || channel.track.components !== 3) return null;
  return createAnimationRootMotionExtractor(clip, ROOT_MOTION_CHANNEL);
}

export function createAnimationController(
  animations: Record<string, AnimationClip | undefined>, initial: string,
): AnimationController {
  const clip = animations[initial];
  if (!clip) throw new Error(`Missing AWD animation: ${initial}`);
  let player: AnimationPlayer = createAnimationPlayer(clip, { loop: true });
  let extractor = rootMotionExtractorFor(clip);
  const motion = new Float32Array(3);

  // extractAnimationRootMotion wants an UNWRAPPED clock — "times may cross any number of repeat
  // boundaries or run backward" — not the player's time, which wraps back to zero every cycle.
  // Feeding it the wrapped time makes each loop look like a jump to the start of the clip, and it
  // answers with a whole cycle of travel in reverse: the bear crept forward for five frames and
  // then snapped back to where he started, over and over. Tracking the monotonic clock here also
  // makes reverse playback fall out for free, since the same call handles a decreasing range.
  let unwrappedTime = 0;

  function play(name: string): void {
    const next = animations[name];
    if (!next) return;
    const speed = player.speed;
    player = createAnimationPlayer(next, { loop: true });
    player.speed = speed;
    extractor = rootMotionExtractorFor(next);
    unwrappedTime = player.time;
  }

  return {
    play,
    setSpeed(speed) { player.speed = speed; },
    step(dt, outDelta) {
      const startTime = unwrappedTime;
      advanceAnimationPlayer(player, dt);
      applyAnimationClipToScene3D(player.clip, player.time);
      if (player.playing) unwrappedTime += dt * player.speed;

      outDelta.x = 0;
      outDelta.y = 0;
      outDelta.z = 0;
      if (!extractor) return;
      if (!extractAnimationRootMotion(motion, extractor, startTime, unwrappedTime)) return;
      outDelta.x = motion[0]!;
      outDelta.y = motion[1]!;
      outDelta.z = motion[2]!;
    },
  };
}
