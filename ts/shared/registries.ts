import type { GlRenderStateOptions, Kind } from '@flighthq/sdk';

/**
 * Combines the render registries generated from an asset with the ones an example adds itself.
 *
 * The manifest fragment describes what the FILE needs. Several of these ports then depart from the
 * file — substituting their own materials, adding a custom shader, choosing a texture resolver the
 * content cannot imply — so the two have to be merged rather than one replacing the other. Later
 * arguments win per kind, which is what lets an example override a renderer the importer would
 * otherwise have supplied.
 */
export function mergeGlRegistries(
  ...parts: readonly Readonly<GlRenderStateOptions>[]
): GlRenderStateOptions {
  const merged: GlRenderStateOptions = {};
  for (const part of parts) {
    for (const [key, value] of Object.entries(part)) {
      const existing = (merged as Record<string, unknown>)[key];
      (merged as Record<string, unknown>)[key] =
        existing instanceof Map && value instanceof Map
          ? new Map<Kind, unknown>([...existing, ...value])
          : value;
    }
  }
  return merged;
}
