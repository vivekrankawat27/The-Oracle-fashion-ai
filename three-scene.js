/**
 * The Oracle — Three.js Oracle Orb Scene
 * Pulsating 3D orb with gold shaders, particle field, and mouse reactivity
 */

import * as THREE from 'https://esm.sh/three@0.160.0';
import { EffectComposer } from 'https://esm.sh/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://esm.sh/three@0.160.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://esm.sh/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js';

let scene, camera, renderer, composer;
let orbMesh, orbWireframe, particleSystem;
let mouse = new THREE.Vector2();
let clock = new THREE.Clock();
let isActive = true;

const GOLD = new THREE.Color(0xD4AF37);
const DEEP_GOLD = new THREE.Color(0xA07820);
const MIDNIGHT = new THREE.Color(0x0A0E1A);

export function initOrbScene(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const W = canvas.clientWidth || window.innerWidth;
  const H = canvas.clientHeight || window.innerHeight;

  // Scene
  scene = new THREE.Scene();
  scene.background = null; // transparent

  // Camera
  camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 100);
  camera.position.set(0, 0, 4.5);

  // Renderer
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  // Orb geometry — Icosahedron
  const geom = new THREE.IcosahedronGeometry(1.5, 4);

  // Main orb – gold holographic material
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0x1a1200),
    emissive: DEEP_GOLD,
    emissiveIntensity: 0.5,
    metalness: 0.9,
    roughness: 0.15,
    transparent: true,
    opacity: 0.92,
    wireframe: false,
    envMapIntensity: 1.5,
  });

  orbMesh = new THREE.Mesh(geom, mat);
  scene.add(orbMesh);

  // Wireframe shell
  const wireMat = new THREE.MeshBasicMaterial({
    color: GOLD,
    wireframe: true,
    transparent: true,
    opacity: 0.18,
  });
  orbWireframe = new THREE.Mesh(geom, wireMat);
  orbWireframe.scale.setScalar(1.02);
  scene.add(orbWireframe);

  // Inner glow sphere
  const glowGeom = new THREE.SphereGeometry(1.2, 32, 32);
  const glowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x6040A0),
    transparent: true,
    opacity: 0.15,
  });
  const glowSphere = new THREE.Mesh(glowGeom, glowMat);
  scene.add(glowSphere);

  // Particle field
  createParticles();

  // Lighting
  const ambientLight = new THREE.AmbientLight(0x1a1025, 1.5);
  scene.add(ambientLight);

  const goldLight = new THREE.PointLight(0xD4AF37, 4, 20);
  goldLight.position.set(3, 3, 3);
  scene.add(goldLight);

  const purpleLight = new THREE.PointLight(0x7B2FBE, 3, 15);
  purpleLight.position.set(-3, -2, 2);
  scene.add(purpleLight);

  const rimLight = new THREE.PointLight(0xFFFFFF, 1, 10);
  rimLight.position.set(0, 0, 5);
  scene.add(rimLight);

  // Post-processing bloom
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.8, 0.4, 0.2);
  composer.addPass(bloom);

  // Mouse tracking
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('resize', onResize);

  // Start loop
  animate();
}

function createParticles() {
  const count = 800;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    // Spherical distribution
    const phi = Math.acos(2 * Math.random() - 1);
    const theta = Math.random() * Math.PI * 2;
    const r = 2 + Math.random() * 3;

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    // Gold to white color randomization
    const t = Math.random();
    colors[i * 3] = 0.83 + t * 0.17;     // R
    colors[i * 3 + 1] = 0.69 + t * 0.31;  // G
    colors[i * 3 + 2] = 0.22 + t * 0.28;  // B

    sizes[i] = Math.random() * 3 + 1;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.PointsMaterial({
    size: 0.05,
    vertexColors: true,
    transparent: true,
    opacity: 0.7,
    sizeAttenuation: true,
  });

  particleSystem = new THREE.Points(geo, mat);
  scene.add(particleSystem);
}

function onMouseMove(e) {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
}

function onResize() {
  const canvas = renderer.domElement;
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  renderer.setSize(W, H, false);
  composer.setSize(W, H);
}

function animate() {
  if (!isActive) return;
  requestAnimationFrame(animate);

  const t = clock.getElapsedTime();

  // Pulsate scale
  const pulse = 1 + 0.06 * Math.sin(t * 1.8);
  orbMesh.scale.setScalar(pulse);
  orbWireframe.scale.setScalar(pulse * 1.015);

  // Gentle auto-rotation
  orbMesh.rotation.y = t * 0.18;
  orbMesh.rotation.x = Math.sin(t * 0.3) * 0.15;
  orbWireframe.rotation.y = t * 0.12;
  orbWireframe.rotation.z = t * 0.08;

  // Mouse-reactive tilt
  orbMesh.rotation.x += mouse.y * 0.3;
  orbMesh.rotation.y += mouse.x * 0.3;

  // Particle slow orbit
  particleSystem.rotation.y = t * 0.04;
  particleSystem.rotation.x = Math.sin(t * 0.05) * 0.1;

  // Emissive breathe
  orbMesh.material.emissiveIntensity = 0.4 + 0.25 * Math.sin(t * 2.2);

  composer.render();
}

export function destroyOrbScene() {
  isActive = false;
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('resize', onResize);
  if (renderer) renderer.dispose();
}
