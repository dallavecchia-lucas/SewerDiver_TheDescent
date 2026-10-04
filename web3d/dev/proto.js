import * as THREE from 'three/webgpu';
import { Fn, uniform, uniformArray, texture, vec2, vec3, vec4, float, int, If, Loop, Break, screenUV, screenCoordinate, select } from 'three/tsl';
const forceWebGL = location.search.includes('webgl');
const cv = document.getElementById('cv');
const renderer = new THREE.WebGPURenderer({ canvas: cv, antialias: false, forceWebGL });
await renderer.init();
renderer.setPixelRatio(1); renderer.setSize(256, 256, false);
// source canvas texture: top half red, bottom half blue, green square top-left
const src = document.createElement('canvas'); src.width = 64; src.height = 64; const c = src.getContext('2d');
c.fillStyle = '#f00'; c.fillRect(0, 0, 64, 32); c.fillStyle = '#00f'; c.fillRect(0, 32, 64, 32); c.fillStyle = '#0f0'; c.fillRect(0, 0, 16, 16);
const tex = location.search.includes('data') ? new THREE.DataTexture(new Uint8Array(c.getImageData(0,0,64,64).data.buffer), 64, 64) : new THREE.CanvasTexture(src); tex.needsUpdate = true; tex.flipY = false; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
const rt = new THREE.RenderTarget(128, 128, { type: THREE.HalfFloatType, depthBuffer: false });
const arr = uniformArray([new THREE.Vector4(0.2, 0, 0, 0), new THREE.Vector4(0, 0.2, 0, 0), new THREE.Vector4(0, 0, 0.2, 0)], 'vec4');
const n = uniform(3, 'int');
// pass 1: write canvas texture into RT through screenUV + a loop sum
const m1 = new THREE.NodeMaterial();
m1.fragmentNode = Fn(() => {
  const s = vec3(0).toVar();
  Loop(n, ({ i }) => { s.addAssign(arr.element(i).xyz); });
  const t = texture(tex, screenUV).level(0);
  return vec4(t.rgb.mul(0.8).add(s), 1);
})();
const m2 = new THREE.NodeMaterial();
m2.fragmentNode = Fn(() => texture(rt.texture, screenUV).level(0))();
const q = new THREE.QuadMesh();
q.material = m1; renderer.setRenderTarget(rt); q.render(renderer);
q.material = m2; renderer.setRenderTarget(null); q.render(renderer);
window.__done = renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl';
const rt2 = new THREE.RenderTarget(256, 256, { depthBuffer: false });
renderer.setRenderTarget(rt2); q.render(renderer); renderer.setRenderTarget(null);
const px = await renderer.readRenderTargetPixelsAsync(rt2, 0, 0, 256, 256);
const at = (x, y) => { const i = (y * 256 + x) * 4; return [px[i], px[i + 1], px[i + 2]].join(','); };
window.__px = { r0: 'row0 (readback first row)', a: at(10, 10), b: at(200, 10), c: at(200, 200), d: at(10, 245) };
