import type { DirectionalLight, PointLight, Scene3DLights } from '@flighthq/sdk';
import { createScene3DLights } from '@flighthq/sdk';

import { awayDirection, setAwayPosition } from '../../shared/camera';
import { createDirectionalLightFromAway, createPointLightFromAway } from '../../shared/lighting';

export interface Md5LightRig {
  directional: DirectionalLight;
  lights: Scene3DLights;
  update(timeSeconds: number): void;
}

export function createMd5LightRig(): Md5LightRig {
  // AwayJS authors these as 0xff1111 and 0x1111ff — primaries at full chroma. Reproduced literally they
  // lay a neon pink and electric blue rim over the hide, which is the single most artificial thing left
  // in the frame and reads as a tech demo rather than a place. Pulled back toward earth: the same two
  // hues, the same roles, at a chroma that lets the diffuse texture stay the thing you are looking at.
  // Deliberate deviation, and the one the eye notices most, so it is stated here rather than buried.
  const redLight = createPointLightFromAway({
    color: 0xb8483a,
    diffuse: 1.05,
    range: 5000,
    referenceDistance: 900,
  });
  const blueLight = createPointLightFromAway({
    color: 0x3f4a9e,
    diffuse: 1.05,
    range: 5000,
    referenceDistance: 900,
  });
  const { directional, ambient } = createDirectionalLightFromAway({
    direction: awayDirection(-50, -20, 10),
    color: 0xffffee,
    diffuse: 1,
    ambient: 1,
    ambientColor: 0x303040,
    // Retain just enough cool fill to read the diffuse texture while giving the white key enough
    // weight for a legible cast shadow and directional normal-map relief. The roaming red/blue lights
    // still define the Doom-like character silhouette.
    //
    // The key's share matters more than its absolute level, for two reasons. Flight's shadow map
    // attenuates only the DIRECTIONAL term, where AwayJS's shadow method darkened the composed lighting,
    // so the ground must take enough of its light from this one light for the shadow to register at all.
    // And this is the ONLY light that casts, while the red/blue pair orbits, so if they dominate the
    // character's shading its lit side swings around with them while the shadow stays pinned left.
    //
    // But the key cannot simply be made dominant either. awayDirection(-50, -20, 10) sits only ~21°
    // above the horizon — a hard side light — so on its own it leaves half the character in near-black
    // and that dead half stays put as the character turns. The source fills exactly that half with two
    // full-strength point lights plus ambient. Hence this balance: the key leads enough to own the form
    // and agree with the shadow, while the roaming pair stays strong enough to keep the off-key side
    // alive and coloured, as in the original.
    //
    // Ambient carries more weight here than its AwayJS value suggests because it is the scene's ONLY
    // fill. Every emitter points inward from above or from the side — the key sits ~21° up, the red
    // light orbits near y=400 over a ~131-unit character, and the blue light swings out to ~950 units
    // horizontally — so nothing reaches a downward-facing surface. Under the cheekbones and jaw, the
    // belly and the underside received no direct light at all and crushed to black. Raising this fills
    // them without touching the key/point balance above, which is what the geometry actually needs.
    //
    // Baking the skybox as an IBL instead does not work: the environment fill replaces the ambient
    // term rather than adding to it, and grimnight is dark enough that the trade loses more fill than
    // it gains while giving up this dial. Hence a flat ambient, deliberately.
    //
    // The colour is a warm grey rather than the source's blue-grey because this fill is now the only
    // thing opposing the roaming blue light on the surfaces the key never reaches. Left cool, those
    // surfaces went blue-grey and the hide stopped reading as hide. Level and colour are both set
    // against character.ts's material — the two were balanced together and moving one alone will
    // over- or under-expose the body.
    tuning: { diffuse: 2.0, ambient: 2.6, ambientColor: 0x504a4c },
  });

  const lights = createScene3DLights({ ambient, directional, point: [redLight, blueLight] });

  function update(timeSeconds: number): void {
    // AwayJS advanced this phase by 0.01 per 60 Hz frame. Preserve that pace while bringing the
    // orbit inward: Flight point lights use physical inverse-square attenuation whereas AwayJS's
    // enormous default radius kept these lights at full power throughout their 1,500-unit orbit.
    const count = timeSeconds * 0.6;
    setLightPosition(redLight, Math.sin(count) * 950, 250 + Math.sin(count * 0.54) * 180, Math.cos(count * 0.7) * 950);
    setLightPosition(
      blueLight,
      -Math.sin(count * 0.8) * 950,
      250 - Math.sin(count * 0.65) * 180,
      -Math.cos(count * 0.9) * 950,
    );
  }

  update(0);
  return { directional, lights, update };
}

function setLightPosition(light: PointLight, x: number, y: number, z: number): void {
  setAwayPosition(light.position, x, y, z);
}
