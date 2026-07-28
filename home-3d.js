import * as THREE from 'https://unpkg.com/three@0.169.0/build/three.module.js';

const heroVisual = document.querySelector('.hero-visual');
const canvas = document.getElementById('hero3d');

if (heroVisual && canvas && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0.25, 8.8);

  const root = new THREE.Group();
  scene.add(root);

  const ambient = new THREE.AmbientLight(0xf2edff, 1.35);
  const keyLight = new THREE.PointLight(0xa26bff, 10, 24, 2);
  keyLight.position.set(-2.8, 2.2, 4.6);
  const fillLight = new THREE.PointLight(0x7dc8ff, 5.5, 24, 2);
  fillLight.position.set(3.4, -1.2, 3.5);
  const rimLight = new THREE.DirectionalLight(0xffffff, 0.95);
  rimLight.position.set(0.5, 2.6, 6);

  scene.add(ambient, keyLight, fillLight, rimLight);

  const materials = {
    violet: new THREE.MeshPhysicalMaterial({
      color: 0xae86ff,
      roughness: 0.18,
      metalness: 0.28,
      transmission: 0.22,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      emissive: 0x23103f,
      emissiveIntensity: 0.62
    }),
    rose: new THREE.MeshPhysicalMaterial({
      color: 0xff9bd1,
      roughness: 0.16,
      metalness: 0.2,
      transmission: 0.24,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      emissive: 0x351229,
      emissiveIntensity: 0.58
    }),
    pearl: new THREE.MeshPhysicalMaterial({
      color: 0xf6e6ff,
      roughness: 0.14,
      metalness: 0.16,
      transmission: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      emissive: 0x221230,
      emissiveIntensity: 0.36
    })
  };

  function createHeartGeometry() {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.28);
    shape.bezierCurveTo(0, 0.1, -0.34, -0.1, -0.62, 0.14);
    shape.bezierCurveTo(-0.92, 0.4, -0.84, 0.92, -0.38, 1.18);
    shape.bezierCurveTo(-0.12, 1.34, -0.02, 1.5, 0, 1.66);
    shape.bezierCurveTo(0.02, 1.5, 0.12, 1.34, 0.38, 1.18);
    shape.bezierCurveTo(0.84, 0.92, 0.92, 0.4, 0.62, 0.14);
    shape.bezierCurveTo(0.34, -0.1, 0, 0.1, 0, 0.28);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.18,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.04,
      bevelThickness: 0.04
    });
    geometry.center();
    return geometry;
  }

  const heartGeometry = createHeartGeometry();
  const heartConfigs = [
    { position: [-1.9, 1.18, -0.7], scale: 0.32, material: materials.violet, speed: [0.0012, 0.0032, 0.001], offset: 0.2 },
    { position: [-1.1, 1.72, -1.2], scale: 0.18, material: materials.pearl, speed: [0.0016, 0.0038, 0.0012], offset: 0.9 },
    { position: [1.72, 1.04, -0.8], scale: 0.3, material: materials.rose, speed: [-0.001, 0.0034, -0.0009], offset: 1.5 },
    { position: [1.14, 1.62, -1.45], scale: 0.16, material: materials.pearl, speed: [0.0014, -0.0036, 0.0008], offset: 2.3 },
    { position: [-0.82, -0.18, -1.4], scale: 0.22, material: materials.violet, speed: [0.0013, 0.0028, 0.0007], offset: 2.8 },
    { position: [0.92, -0.32, -1.7], scale: 0.24, material: materials.rose, speed: [-0.0012, 0.0026, -0.0008], offset: 3.5 },
    { position: [0.08, -1.18, -2.1], scale: 0.2, material: materials.pearl, speed: [0.001, 0.003, 0.0006], offset: 4.1 },
    { position: [-0.2, 1.98, -2.2], scale: 0.12, material: materials.violet, speed: [0.0018, 0.004, 0.0014], offset: 4.8 }
  ];

  const hearts = heartConfigs.map((config) => {
    const mesh = new THREE.Mesh(heartGeometry, config.material);
    mesh.scale.setScalar(config.scale);
    mesh.position.set(...config.position);
    mesh.rotation.x = -0.08;
    mesh.rotation.z = (Math.random() - 0.5) * 0.35;
    root.add(mesh);
    return {
      mesh,
      basePosition: new THREE.Vector3(...config.position),
      rotationSpeed: new THREE.Vector3(...config.speed),
      floatOffset: config.offset
    };
  });

  const targetRotation = new THREE.Vector2(0, 0);
  const currentRotation = new THREE.Vector2(0, 0);

  function resize() {
    const width = heroVisual.clientWidth || 640;
    const height = heroVisual.clientHeight || 320;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function onPointerMove(event) {
    const rect = heroVisual.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    targetRotation.x = y * 0.1;
    targetRotation.y = x * 0.14;
  }

  function onPointerLeave() {
    targetRotation.set(0, 0);
  }

  let rafId = 0;
  const clock = new THREE.Clock();

  function animate() {
    rafId = window.requestAnimationFrame(animate);
    const elapsed = clock.getElapsedTime();

    currentRotation.x += (targetRotation.x - currentRotation.x) * 0.045;
    currentRotation.y += (targetRotation.y - currentRotation.y) * 0.045;
    root.rotation.x = currentRotation.x;
    root.rotation.y = currentRotation.y;

    hearts.forEach((item, index) => {
      item.mesh.rotation.x += item.rotationSpeed.x;
      item.mesh.rotation.y += item.rotationSpeed.y;
      item.mesh.rotation.z += item.rotationSpeed.z;
      item.mesh.position.y = item.basePosition.y + Math.sin(elapsed * 0.92 + item.floatOffset) * 0.12;
      item.mesh.position.x = item.basePosition.x + Math.cos(elapsed * 0.56 + item.floatOffset) * (0.05 + index * 0.003);
    });

    renderer.render(scene, camera);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(heroVisual);
  resize();
  animate();

  heroVisual.addEventListener('pointermove', onPointerMove);
  heroVisual.addEventListener('pointerleave', onPointerLeave);

  window.addEventListener('beforeunload', () => {
    if (rafId) window.cancelAnimationFrame(rafId);
    resizeObserver.disconnect();
    renderer.dispose();
  });
}
