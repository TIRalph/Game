import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

/*
 * CAMADA DE MODELOS
 * -----------------
 * Toda criatura do jogo é criada por createCharacter(chave, opçõesProcedurais).
 * Se o MANIFESTO tiver um `url` para a chave e o .glb carregar, usa o modelo 3D
 * com AnimationMixer. Senão, usa um boneco procedural feito de primitivas.
 * Os dois expõem a MESMA interface, então a lógica do jogo não muda:
 *
 *   model.root                    Object3D (o dono posiciona e gira; frente = -Z)
 *   model.play(estado, {duration}) troca a animação (ver lista ESTADOS)
 *   model.update(dt, {speed})     avança a animação
 *   model.setGlow(cor|null, k)    brilho de aviso (aparável/inaparável/atordoado)
 *   model.flinch(k)               tranco ao levar golpe
 *   model.socket(nome)            Object3D de encaixe: handR, handL, head, chest
 *   model.dispose()
 *
 * Veja docs/MODELOS.md para o passo a passo de como trocar por modelos próprios.
 */

// Estados de animação que o jogo usa. No manifesto, `anims` mapeia cada estado
// para o nome do clipe no .glb. Pode usar só um trecho do clipe: { clip, from, to } (0..1).
export const ESTADOS = [
  'idle', 'run', 'jump', 'dodge', 'hit', 'stagger', 'death', 'talk',
  'attack1', 'attack2', 'attack3', 'parry', // jogador
  'windup', 'strike', 'windup_heavy', 'strike_heavy', 'aim', 'lunge', // inimigos
  'cast1', 'cast2', 'cast3', // mãos do mago (primeira pessoa)
];

// Para trocar um placeholder por um modelo, preencha `url` (ex.: 'assets/models/mestre.glb').
export const MODEL_MANIFEST = {
  // Jogador
  // Protagonista: convertido de um STL em T-pose por tools/stl_to_segmented_glb.py.
  // rig 'segmented' = cada parte do .glb é presa a uma articulação do rig procedural.
  aprendiz_punhos: {
    url: 'assets/models/protagonista.glb', rig: 'segmented', height: 1.8,
    joints: { hipY: 0.7642, chestY: 0.5844, neckY: 0.1528, shoulderX: 0.2338, upperArm: 0.2607, foreArm: 0.241, hipX: 0.1259, thigh: 0.4226 },
  },
  // Mesmo modelo, usado no menu e em cenas.
  protagonista: {
    url: 'assets/models/protagonista.glb', rig: 'segmented', height: 1.8,
    joints: { hipY: 0.7642, chestY: 0.5844, neckY: 0.1528, shoulderX: 0.2338, upperArm: 0.2607, foreArm: 0.241, hipX: 0.1259, thigh: 0.4226 },
  },
  aprendiz_mago_maos: { url: null, scale: 1, rotY: Math.PI, offset: [0, 0, 0], anims: {}, sockets: {} }, // braços em 1ª pessoa
  // NPCs
  mestre: { url: null, scale: 1, rotY: Math.PI, offsetY: 0, anims: {}, sockets: {} },
  boneco: { url: null, scale: 1, rotY: Math.PI, offsetY: 0, anims: {}, sockets: {} },
  // Inimigos
  carcereiro: { url: null, scale: 1, rotY: Math.PI, offsetY: 0, anims: {}, sockets: {} },
  atirador: { url: null, scale: 1, rotY: Math.PI, offsetY: 0, anims: {}, sockets: {} },
  bruto: { url: null, scale: 1, rotY: Math.PI, offsetY: 0, anims: {}, sockets: {} },
  duelista: { url: null, scale: 1, rotY: Math.PI, offsetY: 0, anims: {}, sockets: {} },
  arauto: { url: null, scale: 1, rotY: Math.PI, offsetY: 0, anims: {}, sockets: {} },
};

// Se um estado não existir no modelo, tenta estes no lugar.
const FALLBACK = {
  attack2: 'attack1', attack3: 'attack1', attack1: 'strike', strike: 'attack1',
  windup: 'attack1', windup_heavy: 'windup', strike_heavy: 'strike', aim: 'windup', lunge: 'strike',
  cast1: 'attack1', cast2: 'cast1', cast3: 'cast1', parry: 'idle', dodge: 'run', jump: 'idle',
  hit: 'idle', stagger: 'hit', talk: 'idle', run: 'idle', death: 'hit',
};

const cache = {};
let loader = null;

// Carrega todos os .glb do manifesto. Falhas viram aviso e caem no placeholder.
export async function preloadModels(onProgress) {
  const entries = Object.entries(MODEL_MANIFEST).filter(([, c]) => c.url);
  let done = 0;
  for (const [key, cfg] of entries) {
    try {
      loader = loader || new GLTFLoader();
      cache[key] = await loader.loadAsync(cfg.url);
    } catch (e) {
      console.warn(`[modelos] Falha ao carregar ${key} (${cfg.url}); usando placeholder.`, e);
    }
    done++;
    if (onProgress) onProgress(done / entries.length, key);
  }
}

export function hasModel(key) { return !!cache[key]; }

export function createCharacter(key, procOpts = {}) {
  const cfg = MODEL_MANIFEST[key];
  if (cfg && cache[key]) {
    if (cfg.rig === 'segmented') return new SegmentedCharacter(cache[key], cfg, procOpts);
    return new GltfCharacter(cache[key], cfg);
  }
  return new ProceduralCharacter(procOpts);
}

export function createFirstPersonHands(key, procOpts = {}) {
  const cfg = MODEL_MANIFEST[key];
  if (cfg && cache[key]) {
    const c = new GltfCharacter(cache[key], cfg);
    if (cfg.offset) c.root.position.fromArray(cfg.offset);
    return c;
  }
  return new ProceduralHands(procOpts);
}

// ---------------------------------------------------------------------------
// Modelo .glb
// ---------------------------------------------------------------------------
class GltfCharacter {
  constructor(gltf, cfg) {
    this.cfg = cfg;
    this.root = new THREE.Group();
    this.model = SkeletonUtils.clone(gltf.scene);
    this.model.scale.setScalar(cfg.scale || 1);
    this.model.rotation.y = cfg.rotY ?? Math.PI;
    this.model.position.y = cfg.offsetY || 0;
    this.root.add(this.model);
    this.mats = [];
    this.model.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true;
        o.material = o.material.clone();
        if (o.material.emissive) { this.mats.push(o.material); o.material.userData.baseEmissive = o.material.emissive.clone(); }
      }
    });
    this.mixer = new THREE.AnimationMixer(this.model);
    this.clips = {};
    for (const c of gltf.animations) this.clips[c.name.toLowerCase()] = c;
    this.current = null;
    this.range = null;
    this.sockets = {};
    for (const [name, bone] of Object.entries(cfg.sockets || {})) {
      const b = this.model.getObjectByName(bone);
      if (b) this.sockets[name] = b;
    }
  }

  resolve(state) {
    let s = state;
    for (let i = 0; i < 6 && s; i++) {
      const m = this.cfg.anims[s];
      const spec = typeof m === 'string' ? { clip: m } : m;
      if (spec && this.clips[spec.clip.toLowerCase()]) return { clip: this.clips[spec.clip.toLowerCase()], from: spec.from ?? 0, to: spec.to ?? 1 };
      if (this.clips[s]) return { clip: this.clips[s], from: 0, to: 1 };
      s = FALLBACK[s];
    }
    return null;
  }

  play(state, { duration = 0, loop } = {}) {
    if (this.state === state && loop !== false && !duration) return;
    this.state = state;
    const r = this.resolve(state);
    if (!r) return;
    const looping = loop ?? ['idle', 'run', 'talk', 'stagger', 'aim'].includes(state);
    const action = this.mixer.clipAction(r.clip);
    action.reset();
    action.enabled = true;
    const D = r.clip.duration;
    action.time = r.from * D;
    action.setLoop(looping ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = true;
    action.timeScale = duration > 0 ? ((r.to - r.from) * D) / duration : 1;
    action.paused = false;
    if (this.current && this.current !== action) action.crossFadeFrom(this.current, 0.12, false);
    action.play();
    this.current = action;
    this.range = looping ? null : { end: r.to * D, action };
  }

  update(dt) {
    this.mixer.update(dt);
    if (this.range && this.range.action.time >= this.range.end) { this.range.action.paused = true; this.range = null; }
  }

  setGlow(color, k = 1) {
    for (const m of this.mats) {
      if (color) { m.emissive.copy(color); m.emissiveIntensity = k * 0.35; }
      else { m.emissive.copy(m.userData.baseEmissive); m.emissiveIntensity = 1; }
    }
  }

  flinch() {}
  socket(name) { return this.sockets[name] || this.root; }
  dispose() { this.mixer.stopAllAction(); this.root.removeFromParent(); }
}

// ---------------------------------------------------------------------------
// Boneco procedural (placeholder)
// ---------------------------------------------------------------------------
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);

function weaponMesh(kind, h, mat, glowMat) {
  const w = new THREE.Group();
  if (kind === 'blade') {
    const len = h * 0.45;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, len), mat); b.position.z = -len / 2; w.add(b);
  } else if (kind === 'rapier') {
    const len = h * 0.55;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, len), mat); b.position.z = -len / 2; w.add(b);
    const g = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 4, 10), mat); w.add(g);
  } else if (kind === 'club') {
    const len = h * 0.45;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.08, len, 7), mat); b.rotation.x = Math.PI / 2; b.position.z = -len / 2; w.add(b);
  } else if (kind === 'greatsword') {
    const len = h * 0.6;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, len), mat); b.position.z = -len / 2; w.add(b);
    const g = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.08), glowMat); w.add(g);
  } else if (kind === 'bow') {
    const b = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 4, 14, Math.PI), mat);
    b.rotation.y = Math.PI / 2; b.rotation.x = Math.PI / 2; w.add(b);
  } else if (kind === 'staff') {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, h * 0.95, 6), new THREE.MeshStandardMaterial({ color: 0x5a3e24, roughness: 0.9 }));
    b.position.y = h * 0.1; w.add(b);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), glowMat); orb.position.y = h * 0.58; w.add(orb);
  }
  return w;
}

export class ProceduralCharacter {
  constructor(o = {}) {
    const h = this.h = o.height || 1.8;
    this.o = o;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);

    const bodyMat = this.bodyMat = new THREE.MeshStandardMaterial({ color: o.color ?? 0x6a6480, roughness: 0.7, metalness: 0.15 });
    const skinMat = new THREE.MeshStandardMaterial({ color: o.skin ?? o.color ?? 0x6a6480, roughness: 0.8 });
    this.eyeIdle = new THREE.Color(o.eyeColor ?? 0xffe0a0);
    const glowMat = this.glowMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: this.eyeIdle.clone(), emissiveIntensity: 1.2 });
    const bladeMat = this.bladeMat = new THREE.MeshStandardMaterial({ color: 0x9a9aa8, metalness: 0.7, roughness: 0.3, emissive: new THREE.Color(0), emissiveIntensity: 0 });
    // Sem `skeletonOnly`, desenha o boneco de primitivas; com ele, só cria as articulações
    // (usado pelo SegmentedCharacter, que pendura as partes de um modelo real nelas).
    const prim = !o.skeletonOnly;
    const mesh = (geo, mat, parent, y = 0, x = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true;
      if (prim) parent.add(m); else geo.dispose();
      return m;
    };
    // Posição das articulações (metros). Padrão proporcional à altura; um modelo pode trazer as suas.
    const J = this.J = Object.assign({
      hipY: h * 0.5, chestY: h * 0.28, neckY: h * 0.04, shoulderX: h * 0.2,
      upperArm: h * 0.16, foreArm: h * 0.16, hipX: h * 0.065, thigh: h * 0.25,
    }, o.joints || {});

    // Quadril e tronco
    this.hips = new THREE.Group(); this.hips.position.y = J.hipY; this.body.add(this.hips);
    this.torso = new THREE.Group(); this.hips.add(this.torso);
    mesh(new THREE.CylinderGeometry(h * 0.12, h * 0.1, h * 0.12, 8), bodyMat, this.hips, h * 0.0);
    mesh(new THREE.CylinderGeometry(h * 0.15, h * 0.12, h * 0.3, 8), bodyMat, this.torso, h * 0.16);
    this.chest = new THREE.Group(); this.chest.position.y = J.chestY; this.torso.add(this.chest);
    this.headG = new THREE.Group(); this.headG.position.y = J.neckY; this.chest.add(this.headG);
    mesh(new THREE.SphereGeometry(h * 0.1, 12, 10), skinMat, this.headG, h * 0.1);
    const eyeGeo = new THREE.BoxGeometry(h * 0.04, h * 0.018, h * 0.02);
    mesh(eyeGeo, glowMat, this.headG, h * 0.11, -h * 0.035, -h * 0.09);
    mesh(eyeGeo, glowMat, this.headG, h * 0.11, h * 0.035, -h * 0.09);

    // Braços: ombro → cotovelo → mão (soquete)
    const arm = (side) => {
      const sh = new THREE.Group(); sh.position.set(side * J.shoulderX, 0, 0); this.chest.add(sh);
      mesh(new THREE.CylinderGeometry(h * 0.04, h * 0.035, h * 0.16, 6), bodyMat, sh, -h * 0.08);
      const el = new THREE.Group(); el.position.y = -J.upperArm; sh.add(el);
      mesh(new THREE.CylinderGeometry(h * 0.035, h * 0.03, h * 0.15, 6), skinMat, el, -h * 0.075);
      const hand = new THREE.Group(); hand.position.y = -J.foreArm; el.add(hand);
      if (o.fighter) {
        const g = new THREE.Mesh(new THREE.BoxGeometry(h * 0.07, h * 0.07, h * 0.07), new THREE.MeshStandardMaterial({ color: o.gloveColor ?? 0xb04a2a, roughness: 0.6 }));
        g.castShadow = true; hand.add(g); // luvas aparecem também sobre modelos reais
      } else mesh(new THREE.SphereGeometry(h * 0.035, 6, 5), skinMat, hand);
      return { sh, el, hand };
    };
    this.armL = arm(-1); this.armR = arm(1);

    // Pernas
    const leg = (side) => {
      const hip = new THREE.Group(); hip.position.set(side * J.hipX, 0, 0); this.hips.add(hip);
      mesh(new THREE.CylinderGeometry(h * 0.05, h * 0.042, h * 0.25, 6), bodyMat, hip, -h * 0.125);
      const knee = new THREE.Group(); knee.position.y = -J.thigh; hip.add(knee);
      mesh(new THREE.CylinderGeometry(h * 0.04, h * 0.035, h * 0.25, 6), bodyMat, knee, -h * 0.125);
      return { hip, knee };
    };
    this.legL = leg(-1); this.legR = leg(1);

    // Acessórios (só no boneco de primitivas)
    if (!prim) { this.initState(); return; }
    if (o.robe) {
      const robeMat = new THREE.MeshStandardMaterial({ color: o.robe, roughness: 0.9, side: THREE.DoubleSide });
      mesh(new THREE.CylinderGeometry(h * 0.14, h * 0.24, h * 0.48, 10, 1, true), robeMat, this.hips, -h * 0.22);
    }
    if (o.beard) mesh(new THREE.ConeGeometry(h * 0.06, h * 0.14, 6), new THREE.MeshStandardMaterial({ color: o.beard, roughness: 1 }), this.headG, h * 0.02, 0, -h * 0.07).rotation.x = Math.PI;
    if (o.hood) mesh(new THREE.SphereGeometry(h * 0.115, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), new THREE.MeshStandardMaterial({ color: o.hood, roughness: 0.9, side: THREE.DoubleSide }), this.headG, h * 0.11, 0, h * 0.01);
    if (o.crown) { const c = mesh(new THREE.TorusGeometry(h * 0.1, h * 0.015, 4, 8), glowMat, this.headG, h * 0.2); c.rotation.x = Math.PI / 2; }
    if (o.cape) mesh(new THREE.PlaneGeometry(h * 0.35, h * 0.6), new THREE.MeshStandardMaterial({ color: o.cape, side: THREE.DoubleSide, roughness: 0.9 }), this.torso, h * 0.0, 0, h * 0.14);
    if (o.weapon && o.weapon !== 'none') {
      const wm = weaponMesh(o.weapon, h, bladeMat, glowMat);
      (o.weaponHand === 'L' ? this.armL.hand : this.armR.hand).add(wm);
      if (o.weapon === 'staff') { wm.rotation.x = 0; }
    }

    this.initState();
  }

  initState() {
    this.state = 'idle'; this.t = 0; this.dur = 1;
    this.flinchK = 0;
    this.walk = 0;
    this.time = Math.random() * 10;
    this.p = this.blankPose();
  }

  blankPose() {
    return { bodyY: 0, bodyX: 0, lean: 0, twist: 0, headX: 0, aLx: 0, aLz: 0, aRx: 0, aRz: 0, eL: 0.2, eR: 0.2, lL: 0, lR: 0, kL: 0, kR: 0 };
  }

  play(state, { duration = 0.3 } = {}) {
    if (this.state === state && ['idle', 'run', 'talk', 'stagger', 'aim', 'jump'].includes(state)) return;
    this.state = state; this.t = 0; this.dur = Math.max(0.01, duration);
  }

  flinch(k = 1) { this.flinchK = Math.max(this.flinchK, k); }

  setGlow(color, k = 1) {
    if (color) {
      this.glowMat.emissive.copy(color); this.glowMat.emissiveIntensity = k;
      this.bladeMat.emissive.copy(color); this.bladeMat.emissiveIntensity = k * 0.6;
    } else {
      this.glowMat.emissive.copy(this.eyeIdle); this.glowMat.emissiveIntensity = 1.2;
      this.bladeMat.emissiveIntensity = 0;
    }
  }

  socket(name) {
    if (name === 'handR') return this.armR.hand;
    if (name === 'handL') return this.armL.hand;
    if (name === 'head') return this.headG;
    return this.chest;
  }

  // Pose alvo para cada estado
  target(dt, speed) {
    const P = this.blankPose();
    const k = Math.min(1, this.t / this.dur);
    const t = this.time;
    const guard = this.o.fighter;
    const setGuard = () => { P.aRx = 0.9; P.aRz = -0.15; P.eR = 2.0; P.aLx = 0.9; P.aLz = 0.15; P.eL = 2.0; };
    if (guard) setGuard(); else { P.aLz = -0.1; P.aRz = 0.1; }
    switch (this.state) {
      case 'idle':
        P.bodyY = Math.sin(t * 2) * 0.01;
        if (this.o.weapon === 'staff') { P.aRx = 0.35; P.eR = 0.6; }
        break;
      case 'talk':
        P.aLx = 0.7 + Math.sin(t * 3) * 0.25; P.eL = 1.2; P.aLz = -0.3; P.headX = Math.sin(t * 2.3) * 0.06;
        if (this.o.weapon === 'staff') { P.aRx = 0.35; P.eR = 0.6; }
        break;
      case 'run': {
        this.walk += dt * Math.max(4, speed * 1.6);
        const s = Math.sin(this.walk);
        P.lL = s * 0.7; P.lR = -s * 0.7;
        P.kL = -Math.max(0, -s) * 1.1 - 0.15; P.kR = -Math.max(0, s) * 1.1 - 0.15;
        P.lean = -0.15; P.bodyY = Math.abs(Math.cos(this.walk)) * 0.05;
        if (!guard) { P.aLx = -s * 0.6; P.aRx = s * 0.6; P.eL = P.eR = 0.8; }
        else { P.aLx += -s * 0.15; P.aRx += s * 0.15; }
        break;
      }
      case 'jump': P.lL = 0.5; P.kL = -1.0; P.lR = -0.2; P.kR = -0.4; P.aLz = -0.5; P.aRz = 0.5; break;
      case 'attack1': // jab direito
        if (k < 0.3) { P.aRx = 0.9; P.eR = 2.3; P.twist = 0.15; }
        else { P.aRx = 1.55; P.eR = 0.05; P.twist = -0.35; P.lean = -0.15; }
        P.lL = 0.3; P.lR = -0.3;
        break;
      case 'attack2': // direto esquerdo
        if (k < 0.3) { P.aLx = 0.9; P.eL = 2.3; P.twist = -0.15; }
        else { P.aLx = 1.55; P.eL = 0.05; P.twist = 0.4; P.lean = -0.15; }
        P.lL = -0.3; P.lR = 0.3;
        break;
      case 'attack3': // gancho ascendente
        if (k < 0.35) { P.aRx = 0.3; P.eR = 1.8; P.bodyY = -0.15; P.lean = -0.2; P.kL = P.kR = -0.6; P.lL = P.lR = 0.3; }
        else { P.aRx = 2.7; P.eR = 0.5; P.lean = 0.15; P.bodyY = 0.08; P.twist = -0.3; }
        break;
      case 'parry':
        P.aRx = 1.35; P.aRz = -0.55; P.eR = 1.9; P.aLx = 1.35; P.aLz = 0.55; P.eL = 1.9; P.lean = 0.05; P.bodyY = -0.05;
        break;
      case 'dodge':
        P.bodyY = -0.35; P.lean = -0.7; P.lL = 1.0; P.kL = -1.4; P.lR = -0.4; P.kR = -1.2; P.aLz = -0.6; P.aRz = 0.6;
        break;
      case 'windup':
        P.aRx = 0.3 + 2.5 * ease(k); P.eR = 0.4; P.twist = 0.3; P.lean = 0.1;
        break;
      case 'strike':
        P.aRx = 0.7; P.eR = 0.1; P.twist = -0.35; P.lean = -0.25; P.lL = 0.35; P.lR = -0.25;
        break;
      case 'windup_heavy':
        P.aRx = P.aLx = 0.3 + 2.6 * ease(k); P.eR = P.eL = 0.3; P.lean = 0.2;
        break;
      case 'strike_heavy':
        P.aRx = P.aLx = 0.6; P.eR = P.eL = 0.1; P.lean = -0.5; P.bodyY = -0.2; P.kL = P.kR = -0.7; P.lL = P.lR = 0.4;
        break;
      case 'aim':
        P.aLx = 1.55; P.eL = 0; P.aRx = 1.4; P.eR = 1.7 * ease(k); P.twist = 0.5;
        break;
      case 'lunge':
        P.lean = -0.5; P.aRx = 1.6; P.eR = 0; P.lL = 0.7; P.kL = -0.4; P.lR = -0.6; P.bodyY = -0.1;
        break;
      case 'hit':
        P.lean = 0.3; P.headX = -0.3; P.aLz = -0.4; P.aRz = 0.4;
        break;
      case 'stagger':
        P.lean = 0.25 + Math.sin(t * 9) * 0.05; P.headX = 0.35; P.aLz = -0.6; P.aRz = 0.6; P.aLx = P.aRx = 0.2; P.eL = P.eR = 0.4; P.kL = P.kR = -0.3; P.bodyY = -0.05;
        break;
      case 'death':
        P.bodyX = Math.min(1.5, k * 1.5); P.bodyY = -k * 0.2; P.aLz = -1.2; P.aRz = 1.2;
        break;
    }
    if (this.flinchK > 0) { P.lean += this.flinchK * 0.25; P.headX -= this.flinchK * 0.2; }
    return P;
  }

  update(dt, { speed = 0 } = {}) {
    this.t += dt; this.time += dt;
    this.flinchK = Math.max(0, this.flinchK - dt * 5);
    const T = this.target(dt, speed);
    const fast = ['attack1', 'attack2', 'attack3', 'strike', 'strike_heavy', 'parry', 'dodge', 'lunge'].includes(this.state);
    const a = Math.min(1, dt * (fast ? 30 : 14));
    const p = this.p;
    for (const key in T) p[key] = lerp(p[key], T[key], a);
    const h = this.h;
    this.body.position.y = p.bodyY * h * 0.5;
    this.body.rotation.x = p.bodyX;
    this.torso.rotation.set(p.lean, p.twist, 0);
    this.headG.rotation.x = p.headX;
    this.armL.sh.rotation.set(p.aLx, 0, p.aLz); this.armL.el.rotation.x = p.eL;
    this.armR.sh.rotation.set(p.aRx, 0, p.aRz); this.armR.el.rotation.x = p.eR;
    this.legL.hip.rotation.x = p.lL; this.legL.knee.rotation.x = p.kL;
    this.legR.hip.rotation.x = p.lR; this.legR.knee.rotation.x = p.kR;
  }

  dispose() {
    this.root.removeFromParent();
    this.root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }
}

// ---------------------------------------------------------------------------
// Modelo segmentado: partes rígidas (.glb sem esqueleto) penduradas no rig procedural.
// Nomes esperados dos nós no .glb: hips, torso, head, upperArmL/R, foreArmL/R, thighL/R, shinL/R.
// Cada parte deve estar no espaço local da sua articulação, com braços apontando para -Y.
// ---------------------------------------------------------------------------
const creased = new WeakMap(); // geometria original -> com normais suavizadas (feito uma vez)
const PART_TO_JOINT = {
  hips: c => c.hips, torso: c => c.torso, head: c => c.headG,
  upperArmL: c => c.armL.sh, upperArmR: c => c.armR.sh, foreArmL: c => c.armL.el, foreArmR: c => c.armR.el,
  thighL: c => c.legL.hip, thighR: c => c.legR.hip, shinL: c => c.legL.knee, shinR: c => c.legR.knee,
};

export class SegmentedCharacter extends ProceduralCharacter {
  constructor(gltf, cfg, procOpts = {}) {
    super({ ...procOpts, height: cfg.height || procOpts.height || 1.8, joints: cfg.joints, skeletonOnly: true });
    this.mats = [];
    const seen = new Map();
    gltf.scene.traverse(o => {
      if (!o.isMesh) return;
      const name = PART_TO_JOINT[o.name] ? o.name : o.parent && o.parent.name;
      const joint = PART_TO_JOINT[name];
      if (!joint) return;
      const m = o.clone();
      // Materiais clonados por personagem (para o brilho de aviso não vazar para outros)
      if (!seen.has(o.material)) { const c = o.material.clone(); seen.set(o.material, c); this.mats.push(c); }
      m.material = seen.get(o.material);
      if (!creased.has(o.geometry)) creased.set(o.geometry, o.geometry.attributes.normal ? o.geometry : toCreasedNormals(o.geometry, Math.PI / 5));
      m.geometry = creased.get(o.geometry);
      m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1);
      m.castShadow = true;
      joint(this).add(m);
    });
    for (const m of this.mats) m.userData.baseEmissive = m.emissive.clone();
  }

  // A geometria é compartilhada pelo cache: só remove da cena.
  dispose() { this.root.removeFromParent(); }

  setGlow(color, k = 1) {
    super.setGlow(color, k);
    for (const m of this.mats) {
      if (color) { m.emissive.copy(color); m.emissiveIntensity = k * 0.25; }
      else { m.emissive.copy(m.userData.baseEmissive); m.emissiveIntensity = 1; }
    }
  }
}

// ---------------------------------------------------------------------------
// Mãos do mago em primeira pessoa (placeholder)
// ---------------------------------------------------------------------------
function runeTexture(color) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 6; g.shadowColor = color; g.shadowBlur = 16;
  g.beginPath(); g.arc(128, 128, 110, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 3;
  g.beginPath(); g.arc(128, 128, 86, 0, Math.PI * 2); g.stroke();
  g.beginPath();
  for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI * 2 * 2; const x = 128 + Math.cos(a) * 86, y = 128 + Math.sin(a) * 86; i ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.stroke();
  g.font = 'bold 22px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const glyphs = 'ᚠᚢᚦᚨᚱᚲᚷᚹ';
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.fillText(glyphs[i], 128 + Math.cos(a) * 98, 128 + Math.sin(a) * 98); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class ProceduralHands {
  constructor(o = {}) {
    this.o = o;
    this.root = new THREE.Group();
    const arcane = new THREE.Color(o.glow ?? 0x9a7dff);
    this.arcane = arcane;
    const skin = new THREE.MeshStandardMaterial({ color: o.skin ?? 0xd9a882, roughness: 0.7 });
    const sleeve = new THREE.MeshStandardMaterial({ color: o.sleeve ?? 0x3a2a6a, roughness: 0.9 });
    this.palmGlow = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: arcane.clone(), emissiveIntensity: 1.5 });
    const make = (side) => {
      const g = new THREE.Group();
      const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.5, 8), skin);
      forearm.rotation.x = Math.PI / 2; forearm.position.z = 0.27; g.add(forearm);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.28, 8), sleeve);
      cuff.rotation.x = Math.PI / 2; cuff.position.z = 0.48; g.add(cuff);
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.035, 0.11), skin); palm.position.z = -0.03; g.add(palm);
      const rune = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), this.palmGlow);
      rune.rotation.x = Math.PI / 2; rune.position.set(0, -0.019, -0.03); g.add(rune);
      for (let i = 0; i < 4; i++) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.022, 0.08), skin);
        f.position.set(-0.036 + i * 0.024, 0, -0.12 - (i === 1 || i === 2 ? 0.01 : 0)); g.add(f);
      }
      const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.06), skin);
      thumb.position.set(-side * 0.06, -0.005, -0.03); thumb.rotation.y = side * 0.6; g.add(thumb);
      const tip = new THREE.Object3D(); tip.position.set(0, -0.03, -0.17); g.add(tip);
      const light = new THREE.PointLight(arcane, 0, 2, 2); light.position.copy(tip.position); g.add(light);
      g.userData = { tip, light };
      this.root.add(g);
      return g;
    };
    this.R = make(1); this.L = make(-1);
    this.R.scale.setScalar(0.85); this.L.scale.setScalar(0.85);
    this.shield = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: runeTexture('#' + arcane.getHexString()), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.shield.position.set(0, -0.05, -0.85);
    this.shield.visible = false;
    this.root.add(this.shield);
    this.state = 'idle'; this.t = 0; this.dur = 0.3; this.time = 0; this.bob = 0;
    this.glowK = 0;
  }

  play(state, { duration = 0.3 } = {}) {
    if (this.state === state && state === 'idle') return;
    this.state = state; this.t = 0; this.dur = Math.max(0.01, duration);
  }
  flinch() {}
  setGlow() {}
  socket(name) { return name === 'handL' ? this.L.userData.tip : this.R.userData.tip; }

  update(dt, { speed = 0 } = {}) {
    this.t += dt; this.time += dt;
    if (speed > 0.5) this.bob += dt * 10;
    const k = Math.min(1, this.t / this.dur);
    const bx = Math.sin(this.bob) * 0.012, by = Math.abs(Math.cos(this.bob)) * 0.015 + Math.sin(this.time * 2) * 0.004;
    // pose de repouso
    let R = { x: 0.3, y: -0.3, z: -0.55, rx: 0.25, ry: 0.15, rz: -0.25 };
    let L = { x: -0.3, y: -0.3, z: -0.55, rx: 0.25, ry: -0.15, rz: 0.25 };
    let glowR = 0.6, glowL = 0.6;
    const thrust = (H, side) => { const e = k < 0.25 ? -k / 0.25 * 0.4 : Math.sin(Math.min(1, (k - 0.25) / 0.35) * Math.PI / 2) * (1 - Math.max(0, k - 0.6) / 0.4 * 0.6); return { x: side * (0.22 - e * 0.08), y: -0.22 + e * 0.04, z: -0.55 - e * 0.25, rx: 1.0 + e * 0.4, ry: -side * 0.1, rz: -side * 0.1 }; };
    this.shield.visible = false;
    switch (this.state) {
      case 'cast1': R = thrust(R, 1); glowR = 4 * (1 - k) + 0.6; break;
      case 'cast2': L = thrust(L, -1); glowL = 4 * (1 - k) + 0.6; break;
      case 'cast3': R = thrust(R, 1); L = thrust(L, -1); R.x = 0.1; L.x = -0.1; glowR = glowL = 6 * (1 - k) + 0.6; break;
      case 'parry': {
        const e = Math.min(1, this.t / 0.06);
        R = { x: 0.12, y: -0.12, z: -0.6, rx: 1.35 * e + 0.25 * (1 - e), ry: 0, rz: -0.15 };
        L = { x: -0.12, y: -0.12, z: -0.6, rx: 1.35 * e + 0.25 * (1 - e), ry: 0, rz: 0.15 };
        glowR = glowL = 3;
        this.shield.visible = k < 1;
        this.shield.scale.setScalar(0.6 + e * 0.4);
        this.shield.material.opacity = 1 - Math.max(0, k - 0.5) * 2;
        this.shield.rotation.z = this.time * 2;
        break;
      }
      case 'dodge': R.y -= 0.12; L.y -= 0.12; R.x += 0.08; L.x -= 0.08; break;
    }
    const a = Math.min(1, dt * 25);
    const apply = (g, P) => {
      g.position.x = lerp(g.position.x, P.x + bx, a); g.position.y = lerp(g.position.y, P.y + by, a); g.position.z = lerp(g.position.z, P.z, a);
      g.rotation.x = lerp(g.rotation.x, P.rx, a); g.rotation.y = lerp(g.rotation.y, P.ry, a); g.rotation.z = lerp(g.rotation.z, P.rz, a);
    };
    apply(this.R, R); apply(this.L, L);
    this.R.userData.light.intensity = glowR; this.L.userData.light.intensity = glowL;
    this.palmGlow.emissiveIntensity = 1 + Math.max(glowR, glowL) * 0.5;
  }

  dispose() { this.root.removeFromParent(); }
}
