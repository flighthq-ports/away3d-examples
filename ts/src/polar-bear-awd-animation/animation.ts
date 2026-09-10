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

  function play(name: string): void {
    const next = animations[name];
    if (!next) return;
    const speed = player.speed;
    player = createAnimationPlayer(next, { loop: true });
    player.speed = speed;
    extractor = rootMotionExtractorFor(next);
  }

  return {
    play,
    setSpeed(speed) { player.speed = speed; },
    step(dt, outDelta) {
      const startTime = player.time;
      advanceAnimationPlayer(player, dt);
      applyAnimationClipToScene3D(player.clip, player.time);
      outDelta.x = 0;
      outDelta.y = 0;
      outDelta.z = 0;
      if (!extractor) return;
      const endTime = player.time;
      // extractAnimationRootMotion only reads a range FORWARDS, so reverse playback (the original
      // backs up with a negative playbackSpeed) has to be expressed as a forward range and
      // negated. The subtlety is the loop point: a backward step that runs past zero wraps to the
      // END of the clip, so endTime lands ABOVE startTime and a naive swap hands the extractor a
      // decreasing range. It reads that as a wrap and returns nearly a whole cycle of FORWARD
      // travel — one 283-unit lurch the instant the key goes down, which is what made backing up
      // look like a forward jump. A wrapped reverse step is therefore summed in two pieces.
      if (player.speed >= 0) {
        if (!extractAnimationRootMotion(motion, extractor, startTime, endTime)) return;
        outDelta.x = motion[0]!;
        outDelta.y = motion[1]!;
        outDelta.z = motion[2]!;
        return;
      }
      let x = 0;
      let y = 0;
      let z = 0;
      if (endTime <= startTime) {
        if (!extractAnimationRootMotion(motion, extractor, endTime, startTime)) return;
        x = motion[0]!; y = motion[1]!; z = motion[2]!;
      } else {
        if (extractAnimationRootMotion(motion, extractor, 0, startTime)) {
          x += motion[0]!; y += motion[1]!; z += motion[2]!;
        }
        if (extractAnimationRootMotion(motion, extractor, endTime, player.clip.duration)) {
          x += motion[0]!; y += motion[1]!; z += motion[2]!;
        }
      }
      outDelta.x = -x;
      outDelta.y = -y;
      outDelta.z = -z;
    },
  };
}
