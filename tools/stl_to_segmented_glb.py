#!/usr/bin/env python3
"""
Converte um personagem .stl em T-pose num .glb "segmentado" para o jogo.

O STL não tem esqueleto nem animação. Este script corta a malha em partes do
corpo (cabeça, tronco, braços, antebraços, coxas, canelas, pés) usando as
alturas das articulações e grava cada parte no espaço local da sua articulação.
No jogo, cada parte é presa a uma articulação do rig procedural, então o modelo
anima com as mesmas poses dos placeholders (ver SegmentedCharacter em src/models.js).

Uso:
  python3 tools/stl_to_segmented_glb.py entrada.stl saida.glb [--json juntas.json]

Coordenadas do STL esperadas: Z para cima, frente para -Y, braços abertos em X.
Ajuste o dicionário JOINTS (unidades do STL) se usar outro modelo. O script
imprime as juntas convertidas para metros; copie-as para MODEL_MANIFEST.joints.
"""
import json
import struct
import sys

import numpy as np

# Articulações no espaço do STL (mesmas unidades do arquivo).
JOINTS = {
    'height': 200.2,     # altura total
    'hip_z': 85.0,       # pivô do quadril (onde o tronco gira)
    'crotch_z': 80.0,    # abaixo disto as pernas se separam
    'knee_z': 38.0,
    'foot_z': 10.0,      # abaixo disto é sapato
    'shorts_z': 57.0,    # barra do short (troca de cor na coxa)
    'waist_z': 100.0,    # acima disto é tronco
    'shoulder_z': 150.0,
    'shoulder_x': 26.0,
    'elbow_x': 55.0,
    'hand_x': 81.8,
    'sleeve_x': 41.0,    # fim da manga (troca de cor no braço)
    'neck_z': 167.0,
    'arm_min_z': 135.0,  # braço só existe acima disto
    'leg_x': 14.0,
}
TARGET_HEIGHT = 1.8  # metros no jogo

# Cores em sRGB (como num seletor de cor); são convertidas para linear, que é o que o glTF espera.
MATERIALS = {
    'pele': (0.86, 0.64, 0.50),
    'camisa': (0.30, 0.22, 0.46),
    'short': (0.16, 0.18, 0.26),
    'sapato': (0.10, 0.08, 0.07),
}


def load_ascii_stl(path):
    vs = []
    with open(path) as f:
        for line in f:
            s = line.strip()
            if s.startswith('vertex'):
                p = s.split()
                vs.append((float(p[1]), float(p[2]), float(p[3])))
    return np.array(vs, dtype=np.float64).reshape(-1, 3, 3)


def load_stl(path):
    with open(path, 'rb') as f:
        head = f.read(80)
        rest = f.read()
    if head.startswith(b'solid') and b'facet' in rest[:400]:
        return load_ascii_stl(path)
    n = struct.unpack('<I', rest[:4])[0]
    data = np.frombuffer(rest[4:4 + 50 * n], dtype=np.dtype([('n', '<3f4'), ('v', '<9f4'), ('a', '<u2')]))
    return data['v'].reshape(-1, 3, 3).astype(np.float64)


def classify(c, J):
    """Parte e material de um triângulo pelo centróide (coordenadas do STL)."""
    x, z = c[0], c[2]
    side = 'R' if x < 0 else 'L'  # o jogo espelha X: -x do STL vira o lado direito
    ax = abs(x)
    if z > J['arm_min_z'] and ax > J['shoulder_x'] - 2 and z < J['neck_z'] + 2:
        if ax < J['elbow_x']:
            return 'upperArm' + side, 'camisa' if ax < J['sleeve_x'] else 'pele'
        return 'foreArm' + side, 'pele'
    if z >= J['neck_z']:
        return 'head', 'pele'
    if z >= J['waist_z']:
        return 'torso', 'camisa'
    if z >= J['crotch_z']:
        return 'hips', 'short'
    leg = 'R' if x < 0 else 'L'
    if z >= J['knee_z']:
        return 'thigh' + leg, 'short' if z >= J['shorts_z'] else 'pele'
    if z >= J['foot_z']:
        return 'shin' + leg, 'pele'
    return 'shin' + leg, 'sapato'


def to_game(p, s):
    # STL (x, y, z) Z-up, frente -Y  ->  jogo (X, Y, Z) Y-up, frente -Z (rotação própria, sem espelhar a malha)
    return np.stack([-p[..., 0] * s, p[..., 2] * s, p[..., 1] * s], axis=-1)


def rot_z(p, ang):
    c, s = np.cos(ang), np.sin(ang)
    out = p.copy()
    out[..., 0] = p[..., 0] * c - p[..., 1] * s
    out[..., 1] = p[..., 0] * s + p[..., 1] * c
    return out


def main():
    args = sys.argv[1:]
    if len(args) < 2:
        print(__doc__)
        sys.exit(1)
    src, dst = args[0], args[1]
    J = JOINTS
    s = TARGET_HEIGHT / J['height']
    T = load_stl(src)
    print('triângulos:', len(T))

    # Posições das articulações no jogo (metros)
    hipY = J['hip_z'] * s
    chestY = J['shoulder_z'] * s
    neckY = J['neck_z'] * s
    shX = J['shoulder_x'] * s
    upper = (J['elbow_x'] - J['shoulder_x']) * s
    fore = (J['hand_x'] - J['elbow_x']) * s
    legX = J['leg_x'] * s
    kneeY = J['knee_z'] * s
    pivots = {
        'hips': np.array([0, hipY, 0]), 'torso': np.array([0, hipY, 0]), 'head': np.array([0, neckY, 0]),
        'upperArmR': np.array([shX, chestY, 0]), 'upperArmL': np.array([-shX, chestY, 0]),
        'foreArmR': np.array([shX + upper, chestY, 0]), 'foreArmL': np.array([-shX - upper, chestY, 0]),
        'thighR': np.array([legX, hipY, 0]), 'thighL': np.array([-legX, hipY, 0]),
        'shinR': np.array([legX, kneeY, 0]), 'shinL': np.array([-legX, kneeY, 0]),
    }

    groups = {}
    cents = T.mean(axis=1)
    for i in range(len(T)):
        part, mat = classify(cents[i], J)
        groups.setdefault((part, mat), []).append(i)

    # Monta os buffers glTF
    bin_chunks = []
    accessors, views, meshes_by_part = [], [], {}
    mat_names = list(MATERIALS)

    def add_view(data, target):
        off = sum(len(b) for b in bin_chunks)
        pad = (-len(data)) % 4
        bin_chunks.append(data + b'\x00' * pad)
        views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data), 'target': target})
        return len(views) - 1

    for (part, mat), idx in sorted(groups.items()):
        tris = to_game(T[idx], s) - pivots[part]
        # Braços em T-pose → pendurados (rig espera braço ao longo de -Y)
        if part.startswith(('upperArm', 'foreArm')):
            tris = rot_z(tris, -np.pi / 2 if part.endswith('R') else np.pi / 2)
        flat = tris.reshape(-1, 3).astype(np.float32)
        # Junta vértices repetidos
        keys = np.round(flat, 5)
        uniq, inv = np.unique(keys, axis=0, return_inverse=True)
        uniq = uniq.astype(np.float32)
        inv = inv.astype(np.uint32).reshape(-1)
        pv = add_view(uniq.tobytes(), 34962)
        accessors.append({'bufferView': pv, 'componentType': 5126, 'count': len(uniq), 'type': 'VEC3',
                          'min': uniq.min(0).tolist(), 'max': uniq.max(0).tolist()})
        pa = len(accessors) - 1
        iv = add_view(inv.tobytes(), 34963)
        accessors.append({'bufferView': iv, 'componentType': 5125, 'count': len(inv), 'type': 'SCALAR'})
        ia = len(accessors) - 1
        meshes_by_part.setdefault(part, []).append({'attributes': {'POSITION': pa}, 'indices': ia, 'material': mat_names.index(mat)})

    meshes, nodes = [], []
    for part, prims in meshes_by_part.items():
        meshes.append({'name': part, 'primitives': prims})
        nodes.append({'name': part, 'mesh': len(meshes) - 1})
    root = {'name': 'Protagonista', 'children': list(range(len(nodes)))}
    nodes.append(root)
    binary = b''.join(bin_chunks)
    gltf = {
        'asset': {'version': '2.0', 'generator': 'stl_to_segmented_glb.py'},
        'scene': 0, 'scenes': [{'nodes': [len(nodes) - 1]}],
        'nodes': nodes, 'meshes': meshes,
        'materials': [{'name': n, 'pbrMetallicRoughness': {'baseColorFactor': [*(v ** 2.2 for v in c), 1], 'metallicFactor': 0.05, 'roughnessFactor': 0.75}} for n, c in MATERIALS.items()],
        'accessors': accessors, 'bufferViews': views,
        'buffers': [{'byteLength': len(binary)}],
    }
    js = json.dumps(gltf, separators=(',', ':')).encode()
    js += b' ' * ((-len(js)) % 4)
    with open(dst, 'wb') as f:
        total = 12 + 8 + len(js) + 8 + len(binary)
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(binary), 0x004E4942)); f.write(binary)

    joints_m = {
        'hipY': round(hipY, 4), 'chestY': round(chestY - hipY, 4), 'neckY': round(neckY - chestY, 4),
        'shoulderX': round(shX, 4), 'upperArm': round(upper, 4), 'foreArm': round(fore, 4),
        'hipX': round(legX, 4), 'thigh': round(hipY - kneeY, 4),
    }
    print('partes:', {p: sum(len(groups[k]) for k in groups if k[0] == p) for p in meshes_by_part})
    print('juntas (metros) para MODEL_MANIFEST.joints:', json.dumps(joints_m))
    print('arquivo:', dst, f'{total / 1e6:.2f} MB')
    if '--json' in args:
        with open(args[args.index('--json') + 1], 'w') as f:
            json.dump(joints_m, f)


if __name__ == '__main__':
    main()
