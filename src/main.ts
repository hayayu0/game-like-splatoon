import * as THREE from 'three';
import './style.css';
import { Game } from './game/Game';

const canvas = document.getElementById('game') as HTMLCanvasElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f1320);
scene.fog = new THREE.Fog(0x0f1320, 60, 110);

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  300,
);

const game = new Game(scene, camera, canvas);

let last = performance.now();
function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
