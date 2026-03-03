import { useEffect, useRef } from 'react';

export default function HologramPlanet({ size = 140 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !window.THREE) return;

    const THREE = window.THREE;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(size, size);
    renderer.setClearColor(0, 0);

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 3.6;

    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(1, 18, 14),
      new THREE.MeshBasicMaterial({ color: 0x00D4FF, wireframe: true, transparent: true, opacity: 0.35 })
    );
    scene.add(planet);
    scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(0.97, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x001828, transparent: true, opacity: 0.65 })
    ));

    function mkRing(rx, ry, rz, col, op) {
      const m = new THREE.Mesh(
        new THREE.TorusGeometry(1.5, 0.006, 4, 80),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op })
      );
      m.rotation.set(rx, ry, rz);
      scene.add(m);
      return m;
    }
    const r1 = mkRing(Math.PI / 2, 0, 0, 0xFF6200, 0.7);
    const r2 = mkRing(Math.PI / 3, Math.PI / 4, 0, 0x00D4FF, 0.5);
    const r3 = mkRing(Math.PI / 5, Math.PI / 2, Math.PI / 8, 0xFF6200, 0.3);

    function mkDot(sz, col) {
      const d = new THREE.Mesh(
        new THREE.SphereGeometry(sz, 8, 8),
        new THREE.MeshBasicMaterial({ color: col })
      );
      scene.add(d);
      return d;
    }
    const s1 = mkDot(0.055, 0xFFFFFF);
    const s2 = mkDot(0.04,  0xFF6200);

    [-0.5, 0, 0.5].forEach(y => {
      const r = Math.sqrt(1 - y * y);
      const lm = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.004, 4, 60),
        new THREE.MeshBasicMaterial({ color: 0x00D4FF, transparent: true, opacity: 0.15 })
      );
      lm.rotation.x = Math.PI / 2;
      lm.position.y = y;
      scene.add(lm);
    });

    let t = 0;
    let rafId;
    function animate() {
      rafId = requestAnimationFrame(animate);
      t += 0.008;
      planet.rotation.y += 0.003;
      planet.rotation.x += 0.0008;
      r1.rotation.z += 0.004;
      r2.rotation.x += 0.002;
      r3.rotation.y += 0.005;
      s1.position.set(Math.cos(t) * 1.5, Math.sin(t * 0.4) * 0.3, Math.sin(t) * 1.5);
      s2.position.set(Math.sin(t * 1.3) * 1.5, Math.cos(t * 0.6) * 0.5, Math.cos(t * 1.3) * 1.5);
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      renderer.dispose();
    };
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ display: 'block', willChange: 'transform' }}
    />
  );
}
