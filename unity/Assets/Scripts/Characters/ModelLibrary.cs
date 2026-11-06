using System.Collections.Generic;
using System.IO;
using System.Text;
using UnityEngine;

namespace Eco
{
    // Partes rígidas de um modelo sem esqueleto (ex.: o protagonista, vindo de um STL em T-pose).
    // Gerado por tools/stl_to_segmented_glb.py --unity, já com frente +Z e normais suavizadas.
    public class SegmentedModel
    {
        public class Part { public string name; public int material; public Mesh mesh; }
        public readonly List<Color> materials = new List<Color>();
        public readonly List<Part> parts = new List<Part>();

        public static SegmentedModel Load(byte[] data, string name)
        {
            var m = new SegmentedModel();
            using (var r = new BinaryReader(new MemoryStream(data)))
            {
                if (Encoding.ASCII.GetString(r.ReadBytes(4)) != "ECOM") throw new IOException("formato inválido");
                r.ReadUInt32(); // versão
                int nm = (int)r.ReadUInt32();
                for (int i = 0; i < nm; i++)
                {
                    r.ReadBytes(r.ReadByte()); // nome do material
                    var c = new Color(r.ReadSingle(), r.ReadSingle(), r.ReadSingle()); // sRGB
                    m.materials.Add(c);
                }
                int np = (int)r.ReadUInt32();
                for (int i = 0; i < np; i++)
                {
                    var part = new Part { name = Encoding.UTF8.GetString(r.ReadBytes(r.ReadByte())), material = r.ReadByte() };
                    int nv = (int)r.ReadUInt32();
                    var pos = new Vector3[nv];
                    var nor = new Vector3[nv];
                    for (int v = 0; v < nv; v++) pos[v] = new Vector3(r.ReadSingle(), r.ReadSingle(), r.ReadSingle());
                    for (int v = 0; v < nv; v++) nor[v] = new Vector3(r.ReadSingle(), r.ReadSingle(), r.ReadSingle());
                    int ni = (int)r.ReadUInt32();
                    var idx = new int[ni];
                    for (int k = 0; k < ni; k++) idx[k] = (int)r.ReadUInt32();
                    var mesh = new Mesh { name = name + "_" + part.name };
                    if (nv > 65000) mesh.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;
                    mesh.vertices = pos;
                    mesh.normals = nor;
                    mesh.triangles = idx;
                    mesh.RecalculateBounds();
                    part.mesh = mesh;
                    m.parts.Add(part);
                }
            }
            return m;
        }
    }

    public static class ModelLibrary
    {
        // Personagens com modelo segmentado: chave -> (arquivo em Resources/Models, articulações em metros).
        static readonly RigJoints Protagonista = new RigJoints
        {
            hipY = 0.7642f, chestY = 0.5844f, neckY = 0.1528f, shoulderX = 0.2338f,
            upperArm = 0.2607f, foreArm = 0.241f, hipX = 0.1259f, thigh = 0.4226f,
        };

        public static readonly Dictionary<string, (string file, RigJoints joints)> Segmented = new Dictionary<string, (string, RigJoints)>
        {
            ["aprendiz_punhos"] = ("protagonista", Protagonista),
            ["protagonista"] = ("protagonista", Protagonista),
        };

        static readonly Dictionary<string, SegmentedModel> cache = new Dictionary<string, SegmentedModel>();

        static SegmentedModel LoadSegmented(string file)
        {
            if (cache.TryGetValue(file, out var m)) return m;
            var ta = Resources.Load<TextAsset>("Models/" + file);
            if (ta != null)
            {
                try { m = SegmentedModel.Load(ta.bytes, file); }
                catch (System.Exception e) { Debug.LogWarning($"[modelos] {file}: {e.Message}; usando boneco."); m = null; }
            }
            cache[file] = m;
            return m;
        }

        public static ICharacterVisual Create(string key, RigOptions opts)
        {
            var prefab = Resources.Load<GameObject>("Characters/" + key);
            if (prefab != null) return new AnimatorCharacter(prefab);
            if (Segmented.TryGetValue(key, out var seg))
            {
                var model = LoadSegmented(seg.file);
                if (model != null) { opts.joints = seg.joints; return new ProceduralRig(opts, model); }
            }
            return new ProceduralRig(opts);
        }

        public static ICharacterVisual CreateHands(string key, Color glow)
        {
            var prefab = Resources.Load<GameObject>("Characters/" + key);
            if (prefab != null) return new AnimatorCharacter(prefab);
            return new MageHands(glow);
        }
    }

    // Prefab com Animator (FBX/GLB importado). O Animator Controller precisa ter estados com os
    // nomes do jogo (idle, run, attack1...). Estados de ação são acelerados para caber na duração pedida.
    public class AnimatorCharacter : ICharacterVisual
    {
        public Transform Root { get; }
        public string State { get; private set; } = "";
        public float StateTime { get; private set; }
        readonly Animator anim;
        readonly Dictionary<string, float> clipLen = new Dictionary<string, float>();
        readonly List<Material> mats = new List<Material>();

        static readonly Dictionary<string, string> Fallback = new Dictionary<string, string>
        {
            ["attack2"] = "attack1", ["attack3"] = "attack1", ["windup"] = "attack1", ["windup_heavy"] = "windup",
            ["strike"] = "attack1", ["strike_heavy"] = "strike", ["aim"] = "windup", ["lunge"] = "strike",
            ["cast1"] = "attack1", ["cast2"] = "cast1", ["cast3"] = "cast1", ["parry"] = "idle", ["dodge"] = "run",
            ["jump"] = "idle", ["hit"] = "idle", ["stagger"] = "hit", ["talk"] = "idle", ["run"] = "idle", ["death"] = "hit",
        };

        public AnimatorCharacter(GameObject prefab)
        {
            Root = new GameObject(prefab.name).transform;
            var inst = Object.Instantiate(prefab, Root, false);
            anim = inst.GetComponentInChildren<Animator>();
            if (anim != null) anim.enabled = false; // atualizado à mão em Tick, para respeitar câmera lenta e hitstop
            if (anim != null && anim.runtimeAnimatorController != null)
                foreach (var c in anim.runtimeAnimatorController.animationClips) clipLen[c.name.ToLowerInvariant()] = c.length;
            foreach (var r in inst.GetComponentsInChildren<Renderer>())
                foreach (var m in r.materials) { m.EnableKeyword("_EMISSION"); mats.Add(m); }
        }

        string Resolve(string s)
        {
            for (int i = 0; i < 6 && s != null; i++)
            {
                if (anim != null && anim.HasState(0, Animator.StringToHash(s))) return s;
                Fallback.TryGetValue(s, out s);
            }
            return null;
        }

        public void Play(string state, float duration = 0.3f)
        {
            if (State == state && (state == "idle" || state == "run" || state == "talk" || state == "stagger" || state == "aim")) return;
            State = state; StateTime = 0;
            var s = Resolve(state);
            if (anim == null || s == null) return;
            anim.speed = clipLen.TryGetValue(s, out var len) && duration > 0 && state != "idle" && state != "run" ? len / duration : 1f;
            anim.CrossFadeInFixedTime(s, 0.1f);
        }

        public void Tick(float dt, float speed) { StateTime += dt; if (anim != null) anim.Update(dt); }

        public void SetGlow(Color? color, float k = 1f)
        {
            foreach (var m in mats) Mats.SetEmission(m, color.HasValue ? color.Value * k * 0.35f : Color.black);
        }

        public void Flinch(float k = 1f) { }

        public Transform Socket(string name)
        {
            if (anim != null && anim.isHuman)
            {
                var b = name == "handR" ? HumanBodyBones.RightHand : name == "handL" ? HumanBodyBones.LeftHand : name == "head" ? HumanBodyBones.Head : HumanBodyBones.Chest;
                var t = anim.GetBoneTransform(b);
                if (t != null) return t;
            }
            return Root;
        }

        public void Dispose() { if (Root) Object.Destroy(Root.gameObject); }
    }
}
