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
const placement = createMatrix();

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

// Measures the LIT artwork, not merely the opaque artwork. Each clip carries a black background
// shape that is much larger than the glyphs it sits behind — in the digits clip the background
// spans 125x64 while the two digit glyphs occupy only 52x40 of it, 41% of the width. Fitting the
// cell to that union renders the digits small and pushed to one side, which is what made the
// clock face look wrong. The backgrounds are black against a black display, so nothing is lost by
// excluding them, and the placeholder art shipped with the model (m_hours.jpg and friends) shows
// digits filling their texture.
function scanBounds(context: CanvasRenderingContext2D, size: number, into: Bounds): void {
  const { data } = context.getImageData(0, 0, size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      const lit = Math.max(data[offset]!, data[offset + 1]!, data[offset + 2]!) > 24;
      if (lit && data[offset + 3]! > 8) {
        if (x < into.minX) into.minX = x;
        if (x > into.maxX) into.maxX = x;
        if (y < into.minY) into.minY = y;
        if (y > into.maxY) into.maxY = y;
      }
    }
  }
}

export interface SwfSheet { columns: number; frames: number; resource: ImageResource; rows: number }

export function createSwfSheetBuilder(swf: Uint8Array) {
  const document_ = createScene2DFromSwf(swf);
  if (!document_) throw new Error('digits.swf could not be parsed');

  return function buildSheet(name: string, frames: number, columns: number, rows: number, sheetSize: number): SwfSheet {
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
    setMatrix(placement, 1, 0, 0, 1, MEASURE_ORIGIN, MEASURE_ORIGIN);
    setCanvasRenderTransform2D(measureState, placement);
    for (let frame = 0; frame < frames; frame++) {
      gotoAndStopMovieClip(clip as never, frame + 1);
      measureContext.clearRect(0, 0, MEASURE_SIZE, MEASURE_SIZE);
      prepareScene2DRender(measureState, clip as never);
      renderCanvasScene2D(measureState, clip);
      scanBounds(measureContext, MEASURE_SIZE, bounds);
    }
    if (bounds.maxX < bounds.minX) throw new Error(`digits.swf clip ${name} rasterised empty`);
    const contentWidth = bounds.maxX - bounds.minX + 1;
    const contentHeight = bounds.maxY - bounds.minY + 1;
    // Bounds are in measuring-canvas pixels; convert back to the clip's own space.
    const contentX = bounds.minX - MEASURE_ORIGIN;
    const contentY = bounds.minY - MEASURE_ORIGIN;

    // Size the cell to the content's own aspect rather than carving the sheet into square-ish
    // tiles: the digits are much wider than they are tall, and a tall cell wastes most of the
    // sheet and leaves each frame floating in empty space.
    const cellWidth = Math.floor(sheetSize / columns);
    const cellHeight = Math.max(1, Math.round(cellWidth * (contentHeight / contentWidth)));
    // SpriteSheetHelper scales each frame to fill its cell on both axes independently
    // (`sclw = destCellW/mcFrameW; sclh = destCellH/mcFrameH`), so the content fills the cell
    // exactly rather than being letterboxed inside it. The cell is sized to the content's own
    // aspect first, so this stays close to uniform and just removes the dead margin.
    const scaleX = cellWidth / contentWidth;
    const scaleY = cellHeight / contentHeight;
    const sheet = document.createElement('canvas');
    sheet.width = cellWidth * columns;
    sheet.height = cellHeight * rows;
    const sheetContext = sheet.getContext('2d');
    if (!sheetContext) throw new Error('A 2D canvas is required to assemble the sprite sheet');

    setMatrix(placement, scaleX, 0, 0, scaleY, -contentX * scaleX, -contentY * scaleY);
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
