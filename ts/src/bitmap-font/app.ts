import type { BitmapText, GlyphSource } from '@flighthq/sdk';
import {
  addNodeChild,
  BitmapTextKind,
  createBitmapText,
  createDisplayObject,
  createGlCanvasElement,
  createGlRenderState,
  createTextureAtlasFromImageResource,
  defaultGlBitmapTextRenderer,
  getBitmapFontGlyph,
  getBitmapFontKerning,
  getBitmapFontMetrics,
  getBitmapFontPage,
  invalidateNodeLocalTransform,
  loadImageResourceFromUrl,
  parseBitmapFontFnt,
  prepareScene2DRender,
  registerGlStandardMaterial,
  registerRenderer,
  registerStandardGlTextureResolvers,
  renderGlBackground,
  renderGlScene2D,
} from '@flighthq/sdk';

let width = innerWidth; let height = innerHeight; const pixelRatio = devicePixelRatio || 1;
const canvas = createGlCanvasElement(width, height, pixelRatio);
document.getElementById('app')?.replaceWith(canvas);
const state = createGlRenderState(canvas, { backgroundColor: 0x111827ff, pixelRatio });
registerStandardGlTextureResolvers(state); registerGlStandardMaterial(state);
registerRenderer(state, BitmapTextKind, defaultGlBitmapTextRenderer);

const image = await loadImageResourceFromUrl('away3d/BitmapFont/fonts/BerberRevKC_260.png');
const atlas = createTextureAtlasFromImageResource(image);
const fnt = await fetch('away3d/BitmapFont/fonts/BerberRevKC_260.fnt').then((r) => r.text());
const font = parseBitmapFontFnt(fnt, { resolvePage: () => atlas });
if (!font) throw new Error('Could not parse BerberRevKC_260.fnt');
const glyphs: GlyphSource = {
  getGlyphAtlasImage: (page = 0) => getBitmapFontPage(font, page)?.texture?.source ?? null,
  getGlyphEntry: (codepoint) => getBitmapFontGlyph(font, codepoint),
  getGlyphKerning: (left, right) => getBitmapFontKerning(font, left, right),
  getGlyphMetrics: () => getBitmapFontMetrics(font),
};
const root = createDisplayObject(); const labels: BitmapText[] = [];
for (let i = 0; i < 12; i++) {
  const text = createBitmapText(glyphs, { text: i % 2 ? 'Away3D' : 'Bitmap Font' });
  addNodeChild(root, text); labels.push(text);
}
function frame(ts: number): void {
  const t = ts / 1000;
  for (let i = 0; i < labels.length; i++) {
    const item = labels[i]!; const angle = t * 0.35 + (i / labels.length) * Math.PI * 2;
    const depth = 0.55 + (Math.cos(angle) + 1) * 0.32;
    item.x = width / 2 + Math.sin(angle) * Math.min(width * 0.38, 430);
    item.y = height / 2 + Math.sin(angle * 2) * Math.min(height * 0.32, 220);
    item.scaleX = depth; item.scaleY = depth; item.alpha = 0.4 + depth * 0.65;
    invalidateNodeLocalTransform(item);
  }
  prepareScene2DRender(state, root); renderGlBackground(state); renderGlScene2D(state, root); requestAnimationFrame(frame);
}
window.addEventListener('resize', () => {
  width = innerWidth; height = innerHeight; const pr = devicePixelRatio || 1;
  canvas.width = width * pr; canvas.height = height * pr; canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  state.pixelRatio = pr; state.gl.viewport(0, 0, canvas.width, canvas.height);
});
requestAnimationFrame(frame);
