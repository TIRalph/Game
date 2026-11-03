import * as THREE from 'three';

// Constrói a geometria de cada sala: chão, paredes, pilares e portais de saída.
function gridTexture(base, line) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#' + base.toString(16).padStart(6, '0');
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 4 + Math.random() * 10, 4 + Math.random() * 10);
  }
  g.strokeStyle = '#' + line.toString(16).padStart(6, '0');
  g.globalAlpha = 0.35;
  g.lineWidth = 3;
  g.strokeRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function labelSprite(lines, color = '#fff') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.textAlign = 'center';
  g.fillStyle = color;
  g.shadowColor = '#000'; g.shadowBlur = 8;
  g.font = 'bold 64px Segoe UI, sans-serif';
  g.fillText(lines[0], 256, 90);
  if (lines[1]) { g.font = '36px Segoe UI, sans-serif'; g.fillStyle = '#ddd'; g.fillText(lines[1], 256, 150); }
  if (lines[2]) { g.font = '32px Segoe UI, sans-serif'; g.fillStyle = '#aaa'; g.fillText(lines[2], 256, 200); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(4, 2, 1);
  return s;
}

export class Room {
  constructor(scene, theme, layout = 'arena', size = 34) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.half = size / 2;
    this.pillars = []; // {x, z, r}
    this.towers = []; // posições elevadas para arqueiros
    this.doors = [];
    this.theme = theme;

    const floorTex = gridTexture(theme.floor, theme.accent);
    floorTex.repeat.set(size / 4, size / 4);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    const wallTex = gridTexture(theme.wall, theme.accent);
    wallTex.repeat.set(size / 4, 2);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 });
    const wallH = 8;
    for (let i = 0; i < 4; i++) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(size + 2, wallH, 1), wallMat);
      const a = (i * Math.PI) / 2;
      w.position.set(Math.sin(a) * (this.half + 0.5), wallH / 2, Math.cos(a) * (this.half + 0.5));
      w.rotation.y = a;
      w.receiveShadow = true;
      this.group.add(w);
    }
    // Faixa luminosa na base das paredes
    const stripMat = new THREE.MeshBasicMaterial({ color: theme.accent });
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(size, 0.08, 0.05), stripMat);
      const a = (i * Math.PI) / 2;
      s.position.set(Math.sin(a) * (this.half - 0.02), 0.6, Math.cos(a) * (this.half - 0.02));
      s.rotation.y = a;
      this.group.add(s);
    }

    const pillarMat = new THREE.MeshStandardMaterial({ color: theme.wall, roughness: 0.8 });
    const addPillar = (x, z, r = 0.9, h = 8) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, h, 10), pillarMat);
      p.position.set(x, h / 2, z);
      p.castShadow = true; p.receiveShadow = true;
      this.group.add(p);
      const cap = new THREE.Mesh(new THREE.TorusGeometry(r * 1.05, 0.06, 6, 20), stripMat);
      cap.rotation.x = Math.PI / 2; cap.position.set(x, 1.2, z);
      this.group.add(cap);
      this.pillars.push({ x, z, r });
    };

    if (layout === 'arena') {
      const d = size * 0.22;
      addPillar(d, d); addPillar(-d, d); addPillar(d, -d); addPillar(-d, -d);
    } else if (layout === 'ring') {
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; addPillar(Math.cos(a) * size * 0.3, Math.sin(a) * size * 0.3, 0.7); }
    } else if (layout === 'towers') {
      // Torres para arqueiros (colisão no chão)
      const d = size * 0.32;
      const towerMat = new THREE.MeshStandardMaterial({ color: theme.wall, roughness: 0.8 });
      [[d, d], [-d, d], [d, -d], [-d, -d], [d * 1.15, 0], [-d * 1.15, 0]].forEach(([x, z]) => {
        const t = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3, 2.4), towerMat);
        t.position.set(x, 1.5, z);
        t.castShadow = true; t.receiveShadow = true;
        this.group.add(t);
        this.pillars.push({ x, z, r: 1.75 });
        this.towers.push(new THREE.Vector3(x, 3, z));
      });
    } else if (layout === 'boss') {
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; addPillar(Math.cos(a) * (this.half - 2.5), Math.sin(a) * (this.half - 2.5), 0.8); }
    }
    // 'open' = sem pilares

    // Luzes
    const lightColor = theme.light;
    for (const [x, z] of [[0, 0], [this.half * 0.6, this.half * 0.6], [-this.half * 0.6, -this.half * 0.6]]) {
      const l = new THREE.PointLight(lightColor, 160, size * 1.2, 1.2);
      l.position.set(x, 6, z);
      this.group.add(l);
    }
  }

  // Portais de saída na parede norte (z negativo).
  addDoors(options, roomTypes) {
    const n = options.length;
    const spacing = Math.min(8, (this.half * 2 - 6) / Math.max(1, n));
    options.forEach((opt, i) => {
      const x = (i - (n - 1) / 2) * spacing;
      const z = -this.half + 1.2;
      const rt = roomTypes[opt.type];
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const frameMat = new THREE.MeshStandardMaterial({ color: 0x222233, roughness: 0.6 });
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.4, 0.6), frameMat); l.position.set(-1.6, 2.2, 0); g.add(l);
      const r = l.clone(); r.position.x = 1.6; g.add(r);
      const top = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.4, 0.6), frameMat); top.position.y = 4.4; g.add(top);
      const portal = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 4), new THREE.MeshBasicMaterial({ color: rt.color, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
      portal.position.y = 2.1; portal.position.z = 0.05;
      g.add(portal);
      const light = new THREE.PointLight(rt.color, 15, 8, 2);
      light.position.set(0, 2.5, 1.5); g.add(light);
      const label = labelSprite([rt.name, opt.rewardText || '', rt.desc], '#' + rt.color.toString(16).padStart(6, '0'));
      label.position.set(0, 6, 0);
      g.add(label);
      this.group.add(g);
      this.doors.push({ x, z, opt, portal, group: g });
    });
  }

  collide(pos, radius) {
    const lim = this.half - radius - 0.05;
    pos.x = Math.max(-lim, Math.min(lim, pos.x));
    pos.z = Math.max(-lim, Math.min(lim, pos.z));
    for (const p of this.pillars) {
      const dx = pos.x - p.x, dz = pos.z - p.z;
      const d = Math.hypot(dx, dz);
      const min = p.r + radius;
      if (d < min && d > 1e-5) {
        pos.x = p.x + (dx / d) * min;
        pos.z = p.z + (dz / d) * min;
      }
    }
  }

  // Linha de visão bloqueada por pilares? (2D)
  blocked(a, b) {
    for (const p of this.pillars) {
      const abx = b.x - a.x, abz = b.z - a.z;
      const len2 = abx * abx + abz * abz || 1;
      let t = ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2;
      t = Math.max(0, Math.min(1, t));
      const cx = a.x + abx * t, cz = a.z + abz * t;
      if (Math.hypot(cx - p.x, cz - p.z) < p.r * 0.9 && t > 0.05 && t < 0.95) return true;
    }
    return false;
  }

  update(t) {
    for (const d of this.doors) d.portal.material.opacity = 0.45 + Math.sin(t * 3 + d.x) * 0.15;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
      }
    });
  }
}
