import type { RequirementCatalogEntry, SwfTagHandler } from '@flighthq/sdk';
import { RequirementFacet } from '@flighthq/sdk';
import {
  getAwd2BlockName,
  awd2CameraHandler,
  awd2ContainerHandler,
  awd2LightHandler,
  awd2LightPickerHandler,
  awd2MaterialHandler,
  awd2MeshInstanceHandler,
  awd2SkeletonAnimationHandler,
  awd2SkeletonBlockHandler,
  awd2SkeletonPoseHandler,
  awd2TextureHandler,
  awd2TriangleGeometryHandler,
} from '@flighthq/scene3d-formats/contract';
import {
  getSwfTagName,
  swfControlHandler,
  swfDefineMorphShapeHandler,
  swfDefineShapeHandler,
  swfEditTextHandler,
  swfFontHandler,
  swfJpegBitmapHandler,
  swfLosslessBitmapHandler,
  swfPlaceObject3Handler,
  swfPlaceObjectHandler,
  swfScriptHandler,
  swfSoundHandler,
  swfSpriteHandler,
  swfStaticTextHandler,
  swfVideoHandler,
} from '@flighthq/swf/contract';

// The ownership rows @flighthq/requirement-catalog ships empty ("Stage 4 builds the mechanism only;
// built-in ownership rows remain deliberately unpopulated"), authored here so the manifest plugin has
// something to resolve against. A row says: this backend satisfies this requirement kind with this
// symbol from this module.
//
// Only the SYMBOL NAMES are written by hand -- a handler object does not carry its own export name,
// and that mapping is the one fact no walk can recover. The KINDS are derived from each handler's own
// `tags` / `blockTypes` through the same naming functions the requirement parsers use, so the catalog
// cannot drift from what `parseSwfRequirements` and `parseAwd2Requirements` report.
//
// Array order is load-bearing and mirrors the SDK's own presets: `swfAllTagHandlers` (text, bitmap,
// video, shape, sprite, control, font, placement, script, sound) decides which handler claims a
// contested character, and `awd2AllBlockHandlers` (materials, skeleton, geometry, scene structure,
// lighting, camera) is a genuine build-phase dependency order.

const PARSER = 'parser';

function swfRows(symbol: string, handler: SwfTagHandler): RequirementCatalogEntry[] {
  return handler.tags.map((code) => ({
    backend: PARSER,
    facet: RequirementFacet.DocumentFormat,
    implementationImport: '@flighthq/swf',
    implementationSymbol: symbol,
    kind: getSwfTagName(code),
    registrarImport: '@flighthq/swf',
    registrarSymbol: 'createScene2DFromSwf',
  }));
}

function awdRows(symbol: string, handler: { blockTypes: readonly number[] }): RequirementCatalogEntry[] {
  return handler.blockTypes.map((type) => ({
    backend: PARSER,
    facet: RequirementFacet.DocumentFormat,
    implementationImport: '@flighthq/sdk',
    implementationSymbol: symbol,
    kind: getAwd2BlockName(0, type),
    registrarImport: '@flighthq/sdk',
    registrarSymbol: 'createScene3DFromAwd2',
  }));
}

export const FLIGHT_CATALOG_ENTRIES: readonly RequirementCatalogEntry[] = [
  // SWF, in swfAllTagHandlers order.
  ...swfRows('swfStaticTextHandler', swfStaticTextHandler),
  ...swfRows('swfEditTextHandler', swfEditTextHandler),
  ...swfRows('swfJpegBitmapHandler', swfJpegBitmapHandler),
  ...swfRows('swfLosslessBitmapHandler', swfLosslessBitmapHandler),
  ...swfRows('swfVideoHandler', swfVideoHandler),
  ...swfRows('swfDefineShapeHandler', swfDefineShapeHandler),
  ...swfRows('swfDefineMorphShapeHandler', swfDefineMorphShapeHandler),
  ...swfRows('swfSpriteHandler', swfSpriteHandler),
  ...swfRows('swfControlHandler', swfControlHandler),
  ...swfRows('swfFontHandler', swfFontHandler),
  ...swfRows('swfPlaceObjectHandler', swfPlaceObjectHandler),
  ...swfRows('swfPlaceObject3Handler', swfPlaceObject3Handler),
  ...swfRows('swfScriptHandler', swfScriptHandler),
  ...swfRows('swfSoundHandler', swfSoundHandler),

  // AWD2, in awd2AllBlockHandlers order.
  ...awdRows('awd2MaterialHandler', awd2MaterialHandler),
  ...awdRows('awd2TextureHandler', awd2TextureHandler),
  ...awdRows('awd2SkeletonBlockHandler', awd2SkeletonBlockHandler),
  ...awdRows('awd2SkeletonPoseHandler', awd2SkeletonPoseHandler),
  ...awdRows('awd2SkeletonAnimationHandler', awd2SkeletonAnimationHandler),
  ...awdRows('awd2TriangleGeometryHandler', awd2TriangleGeometryHandler),
  ...awdRows('awd2ContainerHandler', awd2ContainerHandler),
  ...awdRows('awd2MeshInstanceHandler', awd2MeshInstanceHandler),
  ...awdRows('awd2LightHandler', awd2LightHandler),
  ...awdRows('awd2LightPickerHandler', awd2LightPickerHandler),
  ...awdRows('awd2CameraHandler', awd2CameraHandler),
];
