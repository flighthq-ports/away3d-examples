import type { ImageResource, Node2D } from '@flighthq/sdk';
import { createImageResource, createMatrix, setMatrix, walkNodeDescendants } from '@flighthq/sdk';
import { gotoAndStopMovieClip } from '@flighthq/movieclip';
import {
  createCanvasRenderState,
  createCanvasRenderSurface,
  createCanvasTextureResolvers,
  renderCanvasScene2D,
  scene2dCanvasPipeline,
  setCanvasRenderTransform2D,
} from '@flighthq/scene2d-canvas';
import { createWebCanvasRenderSurfaceCreator } from '@flighthq/host-web';
import { prepareScene2DRender } from '@flighthq/render';
import { createScene2DFromSwf } from '@flighthq/swf';

// The original builds every animated texture in this sample at runtime out of digits.swf, using
// SpriteSheetHelper.generateFromMovieClip to lay a MovieClip's frames into a grid. Flight can read
// SWF directly, so this does the same thing rather than redrawing the artwork by hand: parse the
// file, find the named clip, step it frame by frame and rasterise each frame into one cell.
//
// The clip is measured before it is drawn. A MovieClip carries no precomputed bounds here, and its
// contents sit whereever the SWF's own coordinate space puts them, so the union of all frames is
// found by rasterising once at scale 1 and scanning for non-transparent pixels. Measuring the
// union rather than each frame separately is deliberate: it keeps a '1' in the same place a '8'
// would sit, instead of re-centring every frame and making the digits jitter as the clock runs.
const MEASURE_SIZE = 1024;
const MEASURE_ORIGIN = MEASURE_SIZE / 2;
// Measured at scale 1. Enlarging first was tried, to keep antialiased edges clear of a
// brightness threshold, and it silently broke the measurement: these clips place their contents
// hundreds of units from their own origin (pulse sits at y 169..233, delimiter at y 96..160), so
// at 4x they land outside the measuring canvas and rasterise as clipped or empty. Alpha needs no
// such help — the interior of a filled shape is fully opaque at any scale.
const MEASURE_SCALE = 1;
const placement = createMatrix();
// How much of its cell the artwork fills. The display quad maps the whole cell, so filling it
// edge to edge puts the digits hard against the bezel and reads as oversized.
const CONTENT_FILL = 0.84;

const surfaceCreator = createWebCanvasRenderSurfaceCreator();
function canvasStateFor(canvas: HTMLCanvasElement) {
  return createCanvasRenderState(
    createCanvasRenderSurface(surfaceCreator, canvas),
    scene2dCanvasPipeline,
    createCanvasTextureResolvers(surfaceCreator),
  );
}

function findClip(root: Node2D, name: string): Node2D | null {
  let found: Node2D | null = null;
  walkNodeDescendants(root, (node) => {
    if (found === null && (node as { name?: string }).name === name) found = node as Node2D;
    return found === null;
  });
  return found;
}

interface Bounds { maxX: number; maxY: number; minX: number; minY: number }

// How a clip's extent is measured, which decides what fills each cell.
//
// `opaque` is what SpriteSheetHelper does — it fits each frame by `sourceMC.width`/`height`, and
// in Flash those include every child, backdrop and all. That is right whenever the backdrop is
// what positions the artwork: the `delimiter` clip is a single dot fading out over six frames
// near the middle of a 17x65 black panel, and measured to the dot alone the cell becomes the dot
// and the colon loses one of its two dots.
//
// `lit` measures only the bright artwork, for clips whose backdrop is far larger than the art in
// front of it. The `digits` clip carries a 125x64 panel behind glyphs that occupy 52x40 — 41% of
// the width — so the opaque fit leaves the digits small and pushed to one side of the display.
//
// Which one a clip wants is a property of how that clip was authored, so it is stated per clip
// rather than guessed. A ratio test would pick `lit` for the delimiter too, where it is wrong.
export type SwfSheetFit = 'lit' | 'opaque';

function scanBounds(
  context: CanvasRenderingContext2D, size: number, fit: SwfSheetFit, into: Bounds,
): void {
  const { data } = context.getImageData(0, 0, size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      if (data[offset + 3]! <= 8) continue;
      // The backdrops are vector shapes filled pure black, so this only has to clear zero.
      if (fit === 'lit' && Math.max(data[offset]!, data[offset + 1]!, data[offset + 2]!) <= 8) {
        continue;
      }
      if (x < into.minX) into.minX = x;
      if (x > into.maxX) into.maxX = x;
      if (y < into.minY) into.minY = y;
      if (y > into.maxY) into.maxY = y;
    }
  }
}

export interface SwfSheet { columns: number; frames: number; resource: ImageResource; rows: number }

export function createSwfSheetBuilder(swf: Uint8Array) {
  const document_ = createScene2DFromSwf(swf);
  if (!document_) throw new Error('digits.swf could not be parsed');

  return function buildSheet(
    name: string, frames: number, columns: number, rows: number, sheetSize: number,
    fit: SwfSheetFit,
  ): SwfSheet {
    const clip = findClip(document_.root, name);
    if (!clip) throw new Error(`digits.swf has no clip named ${name}`);

    // Measure the union of every frame at scale 1.
    const measure = document.createElement('canvas');
    measure.width = MEASURE_SIZE;
    measure.height = MEASURE_SIZE;
    const measureContext = measure.getContext('2d', { willReadFrequently: true });
    if (!measureContext) throw new Error('A 2D canvas is required to measure the SWF clip');
    const measureState = canvasStateFor(measure);
    const bounds: Bounds = { maxX: -1, maxY: -1, minX: MEASURE_SIZE, minY: MEASURE_SIZE };
    // Place the clip with the render state's transform rather than by mutating the node. A node's
    // transform is captured into a cached render proxy when it is prepared, so re-assigning x/y/
    // scale between passes does not necessarily reach the draw — it produced silently empty
    // frames. The state transform is read per draw and always does.
    //
    // Draw at the centre of the measuring canvas, not at the clip's own origin: a SWF clip's
    // contents can sit anywhere in its coordinate space, including left of or above it, and
    // anything outside the canvas is simply not rasterised, so it measures as absent.
    setMatrix(placement, MEASURE_SCALE, 0, 0, MEASURE_SCALE, MEASURE_ORIGIN, MEASURE_ORIGIN);
    setCanvasRenderTransform2D(measureState, placement);
    for (let frame = 0; frame < frames; frame++) {
      gotoAndStopMovieClip(clip as never, frame + 1);
      measureContext.clearRect(0, 0, MEASURE_SIZE, MEASURE_SIZE);
      prepareScene2DRender(measureState, clip as never);
      renderCanvasScene2D(measureState, clip);
      scanBounds(measureContext, MEASURE_SIZE, fit, bounds);
    }
    if (bounds.maxX < bounds.minX) throw new Error(`digits.swf clip ${name} rasterised empty`);
    // A clip whose bounds reach the canvas edge was cut off rather than measured, and the sheet
    // built from it would be wrong in a way that is easy to miss. Fail loudly instead.
    if (bounds.minX === 0 || bounds.minY === 0
      || bounds.maxX === MEASURE_SIZE - 1 || bounds.maxY === MEASURE_SIZE - 1) {
      throw new Error(`digits.swf clip ${name} exceeded the ${MEASURE_SIZE}px measuring canvas`);
    }
    // Bounds are in measuring-canvas pixels at MEASURE_SCALE; convert back to the clip's space.
    const contentWidth = (bounds.maxX - bounds.minX + 1) / MEASURE_SCALE;
    const contentHeight = (bounds.maxY - bounds.minY + 1) / MEASURE_SCALE;
    const contentX = (bounds.minX - MEASURE_ORIGIN) / MEASURE_SCALE;
    const contentY = (bounds.minY - MEASURE_ORIGIN) / MEASURE_SCALE;

    // Size the cell to the content's own aspect rather than carving the sheet into square-ish
    // tiles: the digits are much wider than they are tall, and a tall cell wastes most of the
    // sheet and leaves each frame floating in empty space.
    const cellWidth = Math.floor(sheetSize / columns);
    const cellHeight = Math.max(1, Math.round(cellWidth * (contentHeight / contentWidth)));
    // SpriteSheetHelper scales each frame to fill its cell on both axes independently
    // (`sclw = destCellW/mcFrameW; sclh = destCellH/mcFrameH`), so the content fills the cell
    // exactly rather than being letterboxed inside it. The cell is sized to the content's own
    // aspect first, so this stays close to uniform and just removes the dead margin.
    const scaleX = (cellWidth / contentWidth) * CONTENT_FILL;
    const scaleY = (cellHeight / contentHeight) * CONTENT_FILL;
    const sheet = document.createElement('canvas');
    sheet.width = cellWidth * columns;
    sheet.height = cellHeight * rows;
    const sheetContext = sheet.getContext('2d');
    if (!sheetContext) throw new Error('A 2D canvas is required to assemble the sprite sheet');

    setMatrix(
      placement, scaleX, 0, 0, scaleY,
      (cellWidth - contentWidth * scaleX) / 2 - contentX * scaleX,
      (cellHeight - contentHeight * scaleY) / 2 - contentY * scaleY,
    );
    setCanvasRenderTransform2D(measureState, placement);
    for (let frame = 0; frame < frames; frame++) {
      gotoAndStopMovieClip(clip as never, frame + 1);
      measureContext.setTransform(1, 0, 0, 1, 0, 0);
      measureContext.clearRect(0, 0, MEASURE_SIZE, MEASURE_SIZE);
      prepareScene2DRender(measureState, clip as never);
      renderCanvasScene2D(measureState, clip);
      sheetContext.drawImage(
        measure, 0, 0, cellWidth, cellHeight,
        (frame % columns) * cellWidth, Math.floor(frame / columns) * cellHeight, cellWidth, cellHeight,
      );
    }
    return { columns, frames, resource: createImageResource(sheet), rows };
  };
}
