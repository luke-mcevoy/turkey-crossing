// Rendering pipeline: physical sky + image-based lighting, day/night cycle, post-processing
// (ambient occlusion, bloom, colour grading, SMAA). Quality 'low' skips the expensive parts for phones.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, ToneMappingEffect, ToneMappingMode,
  VignetteEffect, HueSaturationEffect, BrightnessContrastEffect } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { clamp } from './util.js';

const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function makeSky() {
  const sky = new Sky();
  sky.scale.setScalar(1000);
  const u = sky.material.uniforms;
  u.turbidity.value = 5.5; u.rayleigh.value = 1.4; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.82;
  return sky;
}

export function createGraphics(canvas, scene, camera, quality = 'high') {
  const high = quality === 'high';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, high ? 1.5 : 1.1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NoToneMapping; // done in post

  // ---------- sky, sun, moon, stars ----------
  const sky = makeSky();
  scene.add(sky);
  const envScene = new THREE.Scene();
  const envSky = makeSky();
  envScene.add(envSky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envTarget = null;

  const hemi = new THREE.HemisphereLight(0xdfe9ff, 0x7a6a58, 1);
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(high ? 4096 : 1536, high ? 4096 : 1536);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  const moon = new THREE.DirectionalLight(0x8fa8ff, 0);
  moon.position.set(120, 200, -80);
  scene.add(hemi, sun, sun.target, moon);

  const starGeo = new THREE.BufferGeometry();
  const sp = [];
  for (let i = 0; i < 1800; i++) {
    const v = new THREE.Vector3().randomDirection();
    if (v.y < 0.05) v.y = Math.abs(v.y) + 0.05;
    v.multiplyScalar(900);
    sp.push(v.x, v.y, v.z);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }));
  scene.add(stars);
  const moonDisc = new THREE.Mesh(new THREE.CircleGeometry(22, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff6e0).multiplyScalar(3), fog: false, transparent: true }));
  scene.add(moonDisc);

  // ---------- post-processing ----------
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
  composer.addPass(new RenderPass(scene, camera));
  let ao = null;
  if (high) {
    ao = new N8AOPostPass(scene, camera, innerWidth, innerHeight);
    ao.configuration.aoRadius = 3.5;
    ao.configuration.distanceFalloff = 1.2;
    ao.configuration.intensity = 2.6;
    ao.configuration.aoSamples = 12;
    ao.configuration.denoiseSamples = 4;
    ao.configuration.halfRes = true;
    ao.configuration.gammaCorrection = false;
    composer.addPass(ao);
  }
  const bloom = new BloomEffect({ intensity: 1.1, luminanceThreshold: 0.92, luminanceSmoothing: 0.25, mipmapBlur: true, radius: 0.72 });
  const grade = new HueSaturationEffect({ saturation: 0.14 });
  const contrast = new BrightnessContrastEffect({ contrast: 0.07 });
  const vignette = new VignetteEffect({ darkness: 0.5, offset: 0.28 });
  const toneMap = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
  composer.addPass(new EffectPass(camera, bloom, grade, contrast, vignette, toneMap));
  composer.addPass(new EffectPass(camera, new SMAAEffect()));

  // ---------- day / night ----------
  const state = { tod: 17.2, night: 0, dusk: 0, sunDir: new THREE.Vector3() };
  let lastEnvTod = -99;
  const warm = new THREE.Color(0xffa860), white = new THREE.Color(0xfff4e6);
  const fogDay = new THREE.Color(0xc9dcef), fogDusk = new THREE.Color(0xf0b88a), fogNight = new THREE.Color(0x0d1426);

  function setTime(tod) {
    state.tod = ((tod % 24) + 24) % 24;
    const a = ((state.tod - 6) / 12) * Math.PI;        // 6am = 0, noon = PI/2, 6pm = PI
    const dir = state.sunDir.set(Math.cos(a), Math.sin(a) * 0.85, Math.sin(a) * 0.5 + 0.25).normalize();
    const y = dir.y;
    state.night = smooth(0.02, -0.14, y);
    state.dusk = smooth(0.45, 0.05, y) * (1 - state.night);
    sky.material.uniforms.sunPosition.value.copy(dir);
    envSky.material.uniforms.sunPosition.value.copy(dir);
    sun.intensity = 3.4 * smooth(-0.03, 0.18, y);
    sun.color.copy(white).lerp(warm, state.dusk);
    sun.castShadow = y > -0.02;
    hemi.intensity = 0.55 + 0.85 * (1 - state.night);
    hemi.color.setRGB(0.87, 0.91, 1).lerp(new THREE.Color(0x5a6ea8), state.night);
    moon.intensity = 0.9 * state.night;
    stars.material.opacity = state.night;
    moonDisc.material.opacity = state.night;
    const fog = fogDay.clone().lerp(fogDusk, state.dusk).lerp(fogNight, state.night);
    scene.fog.color.copy(fog);
    bloom.intensity = 1.0 + state.night * 1.4;
    // re-light the scene from the sky every half hour of game time
    if (Math.abs(state.tod - lastEnvTod) > 0.5) {
      lastEnvTod = state.tod;
      if (envTarget) envTarget.dispose();
      envTarget = pmrem.fromScene(envScene, 0.04);
      scene.environment = envTarget.texture;
      scene.environmentIntensity = 0.35 + 0.65 * (1 - state.night);
    }
  }
  setTime(state.tod);

  return {
    renderer, state, quality,
    setTime,
    // Time of day stays put (always daytime); the T key picks a preset.
    update(dt, focus) {
      sun.position.copy(focus).addScaledVector(state.sunDir, 160);
      sun.target.position.copy(focus);
      sky.position.copy(camera.position);
      stars.position.copy(camera.position);
      moonDisc.position.copy(camera.position).add(moon.position.clone().normalize().multiplyScalar(850));
      moonDisc.lookAt(camera.position);
    },
    resize(w, h) {
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
    },
    render(dt) { composer.render(dt); },
    clockText() {
      const h = Math.floor(state.tod), m = Math.floor((state.tod - h) * 60);
      return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
    },
  };
}
