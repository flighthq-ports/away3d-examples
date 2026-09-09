import type { Billboard, ShadedMaterial, UnlitMaterial } from '@flighthq/sdk';
import {
  createBillboard,
  createImageResourceFromCanvas,
  createPlaneMeshGeometry,
  createShadedMaterial,
  createTexture,
  createUnlitMaterial,
  loadImageResourceFromUrl,
} from '@flighthq/sdk';

export interface AtmosphereBillboard {
  material: UnlitMaterial;
  mesh: Billboard;
}

// Atmosphere: a soft blue glow fading outward into space. A shaded rim shell can only add COLOR
// (not alpha), so it reads as a hard opaque ring; instead this is a camera-facing billboard textured
// with a radial-gradient alpha halo. The opaque earth masks its bright centre, leaving a soft limb glow.
export function createAtmosphere(): AtmosphereBillboard {
  const haloCanvas = document.createElement('canvas');
  haloCanvas.width = 256;
  haloCanvas.height = 256;
  const haloCtx = haloCanvas.getContext('2d');
  if (haloCtx) {
    const haloGradient = haloCtx.createRadialGradient(128, 128, 0, 128, 128, 128);
    haloGradient.addColorStop(0.0, 'rgba(70,140,220,0.85)');
    haloGradient.addColorStop(0.5, 'rgba(70,140,220,0.32)');
    haloGradient.addColorStop(1.0, 'rgba(70,140,220,0.0)');
    haloCtx.fillStyle = haloGradient;
    haloCtx.fillRect(0, 0, 256, 256);
  }
  const material = createUnlitMaterial({ baseColor: 0xffffffff });
  material.baseColorMap = createTexture({
    source: createImageResourceFromCanvas(haloCanvas),
  });
  material.alphaMode = 'blend';

  const mesh = createBillboard(createPlaneMeshGeometry(900, 900, 1, 1), [material], 'screenAligned');

  return { material, mesh };
}

// Clouds: a lit shell just above the surface (AwayJS cloudMaterial). The source cloud map is an
// opaque JPG, so an alpha channel is derived from its luminance below (transparent where there is no
// cloud); a plain 'blend' material over the opaque earth then composites correctly in the renderer's
// sorted transparent pass.
export async function loadCloudTexture(): Promise<ShadedMaterial> {
  const cloudMaterial: ShadedMaterial = createShadedMaterial({
    diffuse: 0xffffffff,
    specular: 0x000000ff,
    shininess: 5,
  });
  cloudMaterial.alphaMode = 'blend';
  cloudMaterial.doubleSided = false;

  const cloudSource = await loadImageResourceFromUrl('globe/cloud_combined_2048.jpg');
  const cloudCanvas = document.createElement('canvas');
  cloudCanvas.width = cloudSource.width;
  cloudCanvas.height = cloudSource.height;
  const cloudCtx = cloudCanvas.getContext('2d');
  if (cloudCtx && cloudSource.source) {
    cloudCtx.drawImage(cloudSource.source, 0, 0);
    const cloudData = cloudCtx.getImageData(0, 0, cloudCanvas.width, cloudCanvas.height);
    const px = cloudData.data;
    for (let i = 0; i < px.length; i += 4) {
      const luminance = (px[i]! + px[i + 1]! + px[i + 2]!) / 3;
      px[i] = 255;
      px[i + 1] = 255;
      px[i + 2] = 255;
      px[i + 3] = luminance;
    }
    cloudCtx.putImageData(cloudData, 0, 0);
    cloudMaterial.diffuseMap = createTexture({
      source: createImageResourceFromCanvas(cloudCanvas),
    });
  }

  return cloudMaterial;
}
