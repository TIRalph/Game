import * as THREE from 'three';

// Partículas simples (pool de meshes), números de dano e efeitos de tela.
export class FX {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.parts = [];
    this.geo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    this.shake = 0;
    this.dmgLayer = document.getElementById('dmg-layer');
    this.flashEl = document.getElementById('flash');
    this.vignette = document.getElementById('vignette');
    this.calloutEl = document.getElementById('callout');
    this.calloutTimer = 0;
    this.flashV = 0;
    this.hurtV = 0;
    this.nums = [];
    this.rings = [];
  }

  burst(pos, color, count = 12, speed = 6, life = 0.5, size = 1) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color, transparent: true }));
      m.position.copy(pos);
      m.scale.setScalar(size * (0.6 + Math.random() * 0.8));
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      this.scene.add(m);
      this.parts.push({ m, v, life, max: life });
    }
  }

  // Anel visual (sem dano) que expande.
  ring(pos, color, maxR = 4, dur = 0.35) {
    const geo = new THREE.RingGeometry(0.9, 1, 48);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.copy(pos); m.position.y = Math.max(0.05, pos.y);
    this.scene.add(m);
    this.rings.push({ m, t: 0, dur, maxR });
  }

  number(worldPos, text, crit = false, color = null) {
    const el = document.createElement('div');
    el.className = 'dmg' + (crit ? ' crit' : '');
    el.textContent = text;
    if (color) el.style.color = color;
    this.dmgLayer.appendChild(el);
    this.nums.push({ el, pos: worldPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6)), t: 0 });
  }

  flash(strength = 0.5, color = '#fff') {
    this.flashEl.style.background = color;
    this.flashV = Math.max(this.flashV, strength);
  }
  hurt() { this.hurtV = 1; }
  addShake(v) { this.shake = Math.min(1.2, this.shake + v); }

  callout(text, color = '#ffd34a', dur = 0.7) {
    this.calloutEl.textContent = text;
    this.calloutEl.style.color = color;
    this.calloutEl.classList.add('show');
    this.calloutTimer = dur;
  }

  update(dt, realDt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      p.v.y -= 14 * dt;
      p.m.position.addScaledVector(p.v, dt);
      if (p.m.position.y < 0.04) { p.m.position.y = 0.04; p.v.y *= -0.3; p.v.x *= 0.7; p.v.z *= 0.7; }
      p.m.material.opacity = Math.max(0, p.life / p.max);
      if (p.life <= 0) { this.scene.remove(p.m); p.m.material.dispose(); this.parts.splice(i, 1); }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const k = r.t / r.dur;
      r.m.scale.setScalar(0.2 + k * r.maxR);
      r.m.material.opacity = 1 - k;
      if (k >= 1) { this.scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); this.rings.splice(i, 1); }
    }
    const v = new THREE.Vector3();
    const w = innerWidth, h = innerHeight;
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i];
      n.t += realDt;
      v.copy(n.pos); v.y += 1.6 + n.t * 1.2;
      v.project(this.camera);
      if (v.z > 1 || n.t > 0.8) {
        if (n.t > 0.8) { n.el.remove(); this.nums.splice(i, 1); continue; }
        n.el.style.display = 'none';
      } else {
        n.el.style.display = '';
        n.el.style.left = ((v.x + 1) / 2 * w) + 'px';
        n.el.style.top = ((1 - v.y) / 2 * h) + 'px';
        n.el.style.opacity = String(1 - Math.max(0, n.t - 0.5) / 0.3);
      }
    }
    this.flashV = Math.max(0, this.flashV - realDt * 4);
    this.flashEl.style.opacity = String(this.flashV);
    this.hurtV = Math.max(0, this.hurtV - realDt * 2);
    this.vignette.style.boxShadow = `inset 0 0 160px 40px rgba(180,0,20,${(this.hurtV * 0.7).toFixed(3)})`;
    this.shake = Math.max(0, this.shake - realDt * 3);
    if (this.calloutTimer > 0) {
      this.calloutTimer -= realDt;
      if (this.calloutTimer <= 0) this.calloutEl.classList.remove('show');
    }
  }

  clear() {
    for (const p of this.parts) { this.scene.remove(p.m); p.m.material.dispose(); }
    this.parts = [];
    for (const r of this.rings) { this.scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); }
    this.rings = [];
    for (const n of this.nums) n.el.remove();
    this.nums = [];
  }
}
