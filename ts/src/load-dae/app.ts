export {};

const source = await fetch('away3d/LoadDAE/hobbelpaard.dae').then((response) => response.text());
const documentXml = new DOMParser().parseFromString(source, 'application/xml');
const counts = {
  geometries: documentXml.querySelectorAll('library_geometries geometry').length,
  materials: documentXml.querySelectorAll('library_materials material').length,
  animations: documentXml.querySelectorAll('library_animations animation').length,
  scenes: documentXml.querySelectorAll('library_visual_scenes visual_scene').length,
};
const root = document.getElementById('app')!;
root.innerHTML = `<main>
  <p class="eyebrow">Flight format gap</p>
  <h1>Load DAE</h1>
  <p>The original carousel horse is a COLLADA document. Flight can currently load AWD, OBJ, 3DS,
  MD2, MD5, and glTF scenes, but it does not expose a COLLADA scene importer yet.</p>
  <dl>
    <div><dt>Geometries</dt><dd>${counts.geometries}</dd></div>
    <div><dt>Materials</dt><dd>${counts.materials}</dd></div>
    <div><dt>Animations</dt><dd>${counts.animations}</dd></div>
    <div><dt>Visual scenes</dt><dd>${counts.scenes}</dd></div>
  </dl>
  <p class="detail">The asset is fetched and inspected here so the sample stays in the parity suite.
  Rendering it requires a Flight COLLADA importer; converting it ahead of time would hide the feature this sample tests.</p>
</main>`;
const style = document.createElement('style');
style.textContent = `body{margin:0;background:radial-gradient(circle at 70% 20%,#283149,#0b0d14 60%);color:#eef2ff;font:16px/1.6 system-ui}main{max-width:46rem;margin:12vh auto;padding:2rem}h1{font-size:3rem;margin:.1rem 0 1rem}.eyebrow{text-transform:uppercase;letter-spacing:.16em;color:#f7b955;font-size:.75rem;font-weight:700}dl{display:flex;gap:1rem;flex-wrap:wrap;margin:2rem 0}dl div{min-width:8rem;padding:1rem;border:1px solid #526079;border-radius:.6rem;background:#ffffff0b}dt{color:#aeb9cf;font-size:.8rem}dd{font-size:1.8rem;margin:0}.detail{color:#b8c0d1}`;
document.head.appendChild(style);
