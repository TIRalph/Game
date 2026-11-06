using System.Collections.Generic;
using UnityEngine;

namespace Eco
{
    // Boneco articulado com animação procedural. Sem modelo, desenha primitivas;
    // com um SegmentedModel, pendura as partes do modelo nas articulações.
    public class ProceduralRig : ICharacterVisual
    {
        struct Pose
        {
            public float bodyY, bodyX, lean, twist, headX, aLx, aLz, aRx, aRz, eL, eR, lL, lR, kL, kR;
            public static Pose Blank => new Pose { eL = 0.2f, eR = 0.2f };
            public void Lerp(Pose t, float a)
            {
                bodyY += (t.bodyY - bodyY) * a; bodyX += (t.bodyX - bodyX) * a; lean += (t.lean - lean) * a; twist += (t.twist - twist) * a;
                headX += (t.headX - headX) * a; aLx += (t.aLx - aLx) * a; aLz += (t.aLz - aLz) * a; aRx += (t.aRx - aRx) * a; aRz += (t.aRz - aRz) * a;
                eL += (t.eL - eL) * a; eR += (t.eR - eR) * a; lL += (t.lL - lL) * a; lR += (t.lR - lR) * a; kL += (t.kL - kL) * a; kR += (t.kR - kR) * a;
            }
        }

        class Arm { public Transform sh, el, hand; }
        class Leg { public Transform hip, knee; }

        public Transform Root { get; }
        public string State { get; private set; } = "idle";
        public float StateTime => t;

        readonly RigOptions o;
        readonly float h;
        readonly Transform body, hips, torso, chest, head;
        readonly Arm armL, armR;
        readonly Leg legL, legR;
        readonly Material glowMat, bladeMat;
        readonly List<Material> partMats = new List<Material>();
        float t, dur = 1, time, walk, flinchK;
        Pose p = Pose.Blank;

        static readonly HashSet<string> Looping = new HashSet<string> { "idle", "run", "talk", "stagger", "aim", "jump" };
        static readonly HashSet<string> Fast = new HashSet<string> { "attack1", "attack2", "attack3", "strike", "strike_heavy", "parry", "dodge", "lunge" };

        public ProceduralRig(RigOptions opts, SegmentedModel model = null)
        {
            o = opts;
            h = o.height;
            var J = o.joints ?? RigJoints.Default(h);
            bool prim = model == null;
            Root = new GameObject("Personagem").transform;
            body = Child("corpo", Root, Vector3.zero);

            var bodyMat = Mats.NewLit(o.color, 0.15f, 0.3f);
            var skinMat = Mats.NewLit(o.skin ?? o.color, 0f, 0.2f);
            glowMat = Mats.NewLit(EcoMath.Hex(0x222222));
            bladeMat = Mats.NewLit(EcoMath.Hex(0x9a9aa8), 0.7f, 0.7f);
            SetGlow(null);

            hips = Child("quadril", body, new Vector3(0, J.hipY, 0));
            torso = Child("tronco", hips, Vector3.zero);
            chest = Child("peito", torso, new Vector3(0, J.chestY, 0));
            head = Child("cabeca", chest, new Vector3(0, J.neckY, 0));
            if (prim)
            {
                Cyl(hips, bodyMat, 0, 0.11f * h, 0.12f * h);
                Cyl(torso, bodyMat, 0.16f * h, 0.135f * h, 0.3f * h);
                Mats.Prim(PrimitiveType.Sphere, head, skinMat, new Vector3(0, 0.1f * h, 0), Vector3.one * 0.2f * h);
                var eye = new Vector3(0.04f * h, 0.018f * h, 0.02f * h);
                Mats.Prim(PrimitiveType.Cube, head, glowMat, new Vector3(-0.035f * h, 0.11f * h, 0.09f * h), eye);
                Mats.Prim(PrimitiveType.Cube, head, glowMat, new Vector3(0.035f * h, 0.11f * h, 0.09f * h), eye);
            }

            Arm MakeArm(int side)
            {
                var a = new Arm();
                a.sh = Child(side > 0 ? "ombroR" : "ombroL", chest, new Vector3(side * J.shoulderX, 0, 0));
                a.el = Child("cotovelo", a.sh, new Vector3(0, -J.upperArm, 0));
                a.hand = Child("mao", a.el, new Vector3(0, -J.foreArm, 0));
                if (prim)
                {
                    Cyl(a.sh, bodyMat, -0.08f * h, 0.037f * h, 0.16f * h);
                    Cyl(a.el, skinMat, -0.075f * h, 0.032f * h, 0.15f * h);
                }
                if (o.fighter) Mats.Prim(PrimitiveType.Cube, a.hand, Mats.LitShared(o.gloveColor, 0, 0.4f), Vector3.zero, Vector3.one * 0.07f * h);
                else if (prim) Mats.Prim(PrimitiveType.Sphere, a.hand, skinMat, Vector3.zero, Vector3.one * 0.07f * h);
                return a;
            }
            armL = MakeArm(-1); armR = MakeArm(1);

            Leg MakeLeg(int side)
            {
                var l = new Leg();
                l.hip = Child("quadrilPerna", hips, new Vector3(side * J.hipX, 0, 0));
                l.knee = Child("joelho", l.hip, new Vector3(0, -J.thigh, 0));
                if (prim)
                {
                    Cyl(l.hip, bodyMat, -0.125f * h, 0.046f * h, 0.25f * h);
                    Cyl(l.knee, bodyMat, -0.125f * h, 0.038f * h, 0.25f * h);
                }
                return l;
            }
            legL = MakeLeg(-1); legR = MakeLeg(1);

            if (prim) Accessories(skinMat);
            else AttachParts(model);
            if (o.weapon != "none") Weapon(o.weaponLeft ? armL.hand : armR.hand);
        }

        static Transform Child(string name, Transform parent, Vector3 pos)
        {
            var g = new GameObject(name).transform;
            g.SetParent(parent, false);
            g.localPosition = pos;
            return g;
        }

        static void Cyl(Transform parent, Material m, float y, float r, float len) =>
            Mats.Prim(PrimitiveType.Cylinder, parent, m, new Vector3(0, y, 0), new Vector3(r * 2, len / 2, r * 2));

        void Accessories(Material skinMat)
        {
            if (o.robe.HasValue) Cyl(hips, Mats.NewLit(o.robe.Value, 0, 0.1f), -0.22f * h, 0.19f * h, 0.48f * h);
            if (o.beard.HasValue) Mats.Prim(PrimitiveType.Cube, head, Mats.NewLit(o.beard.Value, 0, 0.1f), new Vector3(0, 0.03f * h, 0.08f * h), new Vector3(0.09f, 0.14f, 0.05f) * h);
            if (o.hood.HasValue) Mats.Prim(PrimitiveType.Sphere, head, Mats.NewLit(o.hood.Value, 0, 0.1f), new Vector3(0, 0.12f * h, -0.012f * h), Vector3.one * 0.235f * h);
            if (o.crown) Mats.Prim(PrimitiveType.Cylinder, head, glowMat, new Vector3(0, 0.2f * h, 0), new Vector3(0.2f * h, 0.012f * h, 0.2f * h));
            if (o.cape.HasValue) Mats.Prim(PrimitiveType.Cube, torso, Mats.NewLit(o.cape.Value, 0, 0.1f), new Vector3(0, 0.05f * h, -0.14f * h), new Vector3(0.35f * h, 0.6f * h, 0.01f));
        }

        void Weapon(Transform hand)
        {
            var w = Child("arma", hand, Vector3.zero);
            switch (o.weapon)
            {
                case "blade": { float len = h * 0.45f; Mats.Prim(PrimitiveType.Cube, w, bladeMat, new Vector3(0, 0, len / 2), new Vector3(0.08f, 0.03f, len)); break; }
                case "rapier": { float len = h * 0.55f; Mats.Prim(PrimitiveType.Cube, w, bladeMat, new Vector3(0, 0, len / 2), new Vector3(0.03f, 0.03f, len)); break; }
                case "club": { float len = h * 0.45f; var c = Mats.Prim(PrimitiveType.Cylinder, w, bladeMat, new Vector3(0, 0, len / 2), new Vector3(0.26f, len / 2, 0.26f)); c.transform.localRotation = Quaternion.Euler(90, 0, 0); break; }
                case "greatsword": { float len = h * 0.6f; Mats.Prim(PrimitiveType.Cube, w, bladeMat, new Vector3(0, 0, len / 2), new Vector3(0.22f, 0.05f, len)); Mats.Prim(PrimitiveType.Cube, w, glowMat, Vector3.zero, new Vector3(0.5f, 0.1f, 0.08f)); break; }
                case "bow": Mats.Prim(PrimitiveType.Cube, w, bladeMat, new Vector3(0, 0, 0.05f), new Vector3(0.04f, 0.04f, 0.8f)); break;
                case "staff":
                    Mats.Prim(PrimitiveType.Cylinder, w, Mats.LitShared(EcoMath.Hex(0x5a3e24), 0, 0.1f), new Vector3(0, h * 0.1f, 0), new Vector3(0.06f, h * 0.475f, 0.06f));
                    Mats.Prim(PrimitiveType.Sphere, w, glowMat, new Vector3(0, h * 0.58f, 0), Vector3.one * 0.16f);
                    break;
            }
        }

        void AttachParts(SegmentedModel model)
        {
            var mats = new Dictionary<int, Material>();
            foreach (var part in model.parts)
            {
                Transform joint = JointFor(part.name);
                if (joint == null) continue;
                if (!mats.TryGetValue(part.material, out var m))
                {
                    m = Mats.NewLit(model.materials[part.material], 0.05f, 0.25f);
                    mats[part.material] = m;
                    partMats.Add(m);
                }
                var g = new GameObject(part.name);
                g.transform.SetParent(joint, false);
                g.AddComponent<MeshFilter>().sharedMesh = part.mesh;
                g.AddComponent<MeshRenderer>().sharedMaterial = m;
            }
        }

        Transform JointFor(string name)
        {
            switch (name)
            {
                case "hips": return hips;
                case "torso": return torso;
                case "head": return head;
                case "upperArmL": return armL.sh;
                case "upperArmR": return armR.sh;
                case "foreArmL": return armL.el;
                case "foreArmR": return armR.el;
                case "thighL": return legL.hip;
                case "thighR": return legR.hip;
                case "shinL": return legL.knee;
                case "shinR": return legR.knee;
            }
            return null;
        }

        public void Play(string state, float duration = 0.3f)
        {
            if (State == state && Looping.Contains(state)) return;
            State = state; t = 0; dur = Mathf.Max(0.01f, duration);
        }

        public void Flinch(float k = 1f) { flinchK = Mathf.Max(flinchK, k); }

        public void SetGlow(Color? color, float k = 1f)
        {
            if (color.HasValue)
            {
                Mats.SetEmission(glowMat, color.Value * k);
                Mats.SetEmission(bladeMat, color.Value * k * 0.6f);
                foreach (var m in partMats) Mats.SetEmission(m, color.Value * k * 0.25f);
            }
            else
            {
                Mats.SetEmission(glowMat, o.eyeColor * 1.2f);
                Mats.SetEmission(bladeMat, Color.black);
                foreach (var m in partMats) Mats.SetEmission(m, Color.black);
            }
        }

        public Transform Socket(string name) => name == "handR" ? armR.hand : name == "handL" ? armL.hand : name == "head" ? head : chest;

        static float Ease(float k) => k * k * (3 - 2 * k);

        Pose Target(float dt, float speed)
        {
            var P = Pose.Blank;
            float k = Mathf.Min(1, t / dur);
            bool guard = o.fighter;
            if (guard) { P.aRx = 0.9f; P.aRz = -0.15f; P.eR = 2f; P.aLx = 0.9f; P.aLz = 0.15f; P.eL = 2f; }
            else { P.aLz = -0.1f; P.aRz = 0.1f; }
            switch (State)
            {
                case "idle":
                    P.bodyY = Mathf.Sin(time * 2) * 0.01f;
                    if (o.weapon == "staff") { P.aRx = 0.35f; P.eR = 0.6f; }
                    break;
                case "talk":
                    P.aLx = 0.7f + Mathf.Sin(time * 3) * 0.25f; P.eL = 1.2f; P.aLz = -0.3f; P.headX = Mathf.Sin(time * 2.3f) * 0.06f;
                    if (o.weapon == "staff") { P.aRx = 0.35f; P.eR = 0.6f; }
                    break;
                case "run":
                {
                    walk += dt * Mathf.Max(4, speed * 1.6f);
                    float s = Mathf.Sin(walk);
                    P.lL = s * 0.7f; P.lR = -s * 0.7f;
                    P.kL = -Mathf.Max(0, -s) * 1.1f - 0.15f; P.kR = -Mathf.Max(0, s) * 1.1f - 0.15f;
                    P.lean = -0.15f; P.bodyY = Mathf.Abs(Mathf.Cos(walk)) * 0.05f;
                    if (!guard) { P.aLx = -s * 0.6f; P.aRx = s * 0.6f; P.eL = P.eR = 0.8f; }
                    else { P.aLx += -s * 0.15f; P.aRx += s * 0.15f; }
                    break;
                }
                case "jump": P.lL = 0.5f; P.kL = -1f; P.lR = -0.2f; P.kR = -0.4f; P.aLz = -0.5f; P.aRz = 0.5f; break;
                case "attack1":
                    if (k < 0.3f) { P.aRx = 0.9f; P.eR = 2.3f; P.twist = 0.15f; }
                    else { P.aRx = 1.55f; P.eR = 0.05f; P.twist = -0.35f; P.lean = -0.15f; }
                    P.lL = 0.3f; P.lR = -0.3f;
                    break;
                case "attack2":
                    if (k < 0.3f) { P.aLx = 0.9f; P.eL = 2.3f; P.twist = -0.15f; }
                    else { P.aLx = 1.55f; P.eL = 0.05f; P.twist = 0.4f; P.lean = -0.15f; }
                    P.lL = -0.3f; P.lR = 0.3f;
                    break;
                case "attack3":
                    if (k < 0.35f) { P.aRx = 0.3f; P.eR = 1.8f; P.bodyY = -0.15f; P.lean = -0.2f; P.kL = P.kR = -0.6f; P.lL = P.lR = 0.3f; }
                    else { P.aRx = 2.7f; P.eR = 0.5f; P.lean = 0.15f; P.bodyY = 0.08f; P.twist = -0.3f; }
                    break;
                case "parry": P.aRx = 1.35f; P.aRz = -0.55f; P.eR = 1.9f; P.aLx = 1.35f; P.aLz = 0.55f; P.eL = 1.9f; P.lean = 0.05f; P.bodyY = -0.05f; break;
                case "dodge": P.bodyY = -0.35f; P.lean = -0.7f; P.lL = 1f; P.kL = -1.4f; P.lR = -0.4f; P.kR = -1.2f; P.aLz = -0.6f; P.aRz = 0.6f; break;
                case "windup": P.aRx = 0.3f + 2.5f * Ease(k); P.eR = 0.4f; P.twist = 0.3f; P.lean = 0.1f; break;
                case "strike": P.aRx = 0.7f; P.eR = 0.1f; P.twist = -0.35f; P.lean = -0.25f; P.lL = 0.35f; P.lR = -0.25f; break;
                case "windup_heavy": P.aRx = P.aLx = 0.3f + 2.6f * Ease(k); P.eR = P.eL = 0.3f; P.lean = 0.2f; break;
                case "strike_heavy": P.aRx = P.aLx = 0.6f; P.eR = P.eL = 0.1f; P.lean = -0.5f; P.bodyY = -0.2f; P.kL = P.kR = -0.7f; P.lL = P.lR = 0.4f; break;
                case "aim": P.aLx = 1.55f; P.eL = 0; P.aRx = 1.4f; P.eR = 1.7f * Ease(k); P.twist = 0.5f; break;
                case "lunge": P.lean = -0.5f; P.aRx = 1.6f; P.eR = 0; P.lL = 0.7f; P.kL = -0.4f; P.lR = -0.6f; P.bodyY = -0.1f; break;
                case "hit": P.lean = 0.3f; P.headX = -0.3f; P.aLz = -0.4f; P.aRz = 0.4f; break;
                case "stagger":
                    P.lean = 0.25f + Mathf.Sin(time * 9) * 0.05f; P.headX = 0.35f; P.aLz = -0.6f; P.aRz = 0.6f; P.aLx = P.aRx = 0.2f; P.eL = P.eR = 0.4f; P.kL = P.kR = -0.3f; P.bodyY = -0.05f;
                    break;
                case "death": P.bodyX = Mathf.Min(1.5f, k * 1.5f); P.bodyY = -k * 0.2f; P.aLz = -1.2f; P.aRz = 1.2f; break;
            }
            if (flinchK > 0) { P.lean += flinchK * 0.25f; P.headX -= flinchK * 0.2f; }
            return P;
        }

        public void Tick(float dt, float speed)
        {
            t += dt; time += dt;
            flinchK = Mathf.Max(0, flinchK - dt * 5);
            var T = Target(dt, speed);
            p.Lerp(T, Mathf.Min(1, dt * (Fast.Contains(State) ? 30 : 14)));
            body.localPosition = new Vector3(0, p.bodyY * h * 0.5f, 0);
            body.localRotation = EcoMath.PoseRot(p.bodyX, 0, 0);
            torso.localRotation = EcoMath.PoseRot(p.lean, p.twist, 0);
            head.localRotation = EcoMath.PoseRot(p.headX, 0, 0);
            armL.sh.localRotation = EcoMath.PoseRot(p.aLx, 0, p.aLz); armL.el.localRotation = EcoMath.PoseRot(p.eL, 0, 0);
            armR.sh.localRotation = EcoMath.PoseRot(p.aRx, 0, p.aRz); armR.el.localRotation = EcoMath.PoseRot(p.eR, 0, 0);
            legL.hip.localRotation = EcoMath.PoseRot(p.lL, 0, 0); legL.knee.localRotation = EcoMath.PoseRot(p.kL, 0, 0);
            legR.hip.localRotation = EcoMath.PoseRot(p.lR, 0, 0); legR.knee.localRotation = EcoMath.PoseRot(p.kR, 0, 0);
        }

        public void Dispose() { if (Root) Object.Destroy(Root.gameObject); }
    }
}
