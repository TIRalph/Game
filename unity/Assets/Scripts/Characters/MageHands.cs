using UnityEngine;

namespace Eco
{
    // Mãos do mago em primeira pessoa (placeholder). Ficam presas à câmera.
    public class MageHands : ICharacterVisual
    {
        class Hand { public Transform t, tip; public Light light; }

        public Transform Root { get; }
        public string State { get; private set; } = "idle";
        public float StateTime => t;
        readonly Hand R, L;
        readonly Material palmGlow;
        readonly Transform shield;
        readonly Material shieldMat;
        readonly Color arcane;
        float t, dur = 0.3f, time, bob;

        struct HP { public float x, y, z, rx, ry, rz; }

        public MageHands(Color glow)
        {
            arcane = glow;
            Root = new GameObject("MaosDoMago").transform;
            var skin = Mats.LitShared(EcoMath.Hex(0xd9a882), 0, 0.25f);
            var sleeve = Mats.LitShared(EcoMath.Hex(0x3a2a6a), 0, 0.1f);
            palmGlow = Mats.NewLit(EcoMath.Hex(0x111111));
            Mats.SetEmission(palmGlow, glow * 1.5f);
            R = Make(1, skin, sleeve);
            L = Make(-1, skin, sleeve);
            R.t.localScale = L.t.localScale = Vector3.one * 0.85f;

            shieldMat = Mats.NewTransparent(Color.white);
            shieldMat.mainTexture = RuneTexture(glow);
            var q = GameObject.CreatePrimitive(PrimitiveType.Quad);
            Object.Destroy(q.GetComponent<Collider>());
            q.GetComponent<Renderer>().sharedMaterial = shieldMat;
            shield = q.transform;
            shield.SetParent(Root, false);
            shield.localPosition = new Vector3(0, -0.05f, 0.85f);
            shield.localScale = Vector3.one * 0.9f;
            shield.gameObject.SetActive(false);
            foreach (var r in Root.GetComponentsInChildren<Renderer>()) r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        }

        Hand Make(int side, Material skin, Material sleeve)
        {
            var g = new GameObject(side > 0 ? "maoR" : "maoL").transform;
            g.SetParent(Root, false);
            var fore = Mats.Prim(PrimitiveType.Cylinder, g, skin, new Vector3(0, 0, -0.27f), new Vector3(0.1f, 0.25f, 0.1f));
            fore.transform.localRotation = Quaternion.Euler(90, 0, 0);
            var cuff = Mats.Prim(PrimitiveType.Cylinder, g, sleeve, new Vector3(0, 0, -0.48f), new Vector3(0.17f, 0.14f, 0.17f));
            cuff.transform.localRotation = Quaternion.Euler(90, 0, 0);
            Mats.Prim(PrimitiveType.Cube, g, skin, new Vector3(0, 0, 0.03f), new Vector3(0.1f, 0.035f, 0.11f));
            Mats.Prim(PrimitiveType.Cylinder, g, palmGlow, new Vector3(0, -0.019f, 0.03f), new Vector3(0.06f, 0.002f, 0.06f));
            for (int i = 0; i < 4; i++)
                Mats.Prim(PrimitiveType.Cube, g, skin, new Vector3(-0.036f + i * 0.024f, 0, 0.12f + (i == 1 || i == 2 ? 0.01f : 0)), new Vector3(0.02f, 0.022f, 0.08f));
            var th = Mats.Prim(PrimitiveType.Cube, g, skin, new Vector3(-side * 0.06f, -0.005f, 0.03f), new Vector3(0.022f, 0.022f, 0.06f));
            th.transform.localRotation = Quaternion.Euler(0, -side * 34, 0);
            var tip = new GameObject("ponta").transform; tip.SetParent(g, false); tip.localPosition = new Vector3(0, -0.03f, 0.17f);
            var lg = new GameObject("luz"); lg.transform.SetParent(tip, false);
            var light = lg.AddComponent<Light>(); light.type = LightType.Point; light.color = arcane; light.range = 2; light.intensity = 0;
            return new Hand { t = g, tip = tip, light = light };
        }

        static Texture2D RuneTexture(Color c)
        {
            const int S = 128;
            var tex = new Texture2D(S, S, TextureFormat.RGBA32, false);
            var px = new Color[S * S];
            for (int y = 0; y < S; y++)
                for (int x = 0; x < S; x++)
                {
                    float dx = (x - S / 2f) / (S / 2f), dy = (y - S / 2f) / (S / 2f);
                    float r = Mathf.Sqrt(dx * dx + dy * dy), a = Mathf.Atan2(dy, dx);
                    float ring = Mathf.Max(Mathf.Clamp01(1 - Mathf.Abs(r - 0.86f) * 30), Mathf.Clamp01(1 - Mathf.Abs(r - 0.67f) * 40));
                    // Estrela de 6 pontas
                    float star = 0;
                    for (int k = 0; k < 6; k++)
                    {
                        float a0 = k * Mathf.PI / 3, a1 = a0 + Mathf.PI * 2 / 3;
                        var p0 = new Vector2(Mathf.Cos(a0), Mathf.Sin(a0)) * 0.67f; var p1 = new Vector2(Mathf.Cos(a1), Mathf.Sin(a1)) * 0.67f;
                        var p = new Vector2(dx, dy); var d = p1 - p0;
                        float tt = Mathf.Clamp01(Vector2.Dot(p - p0, d) / d.sqrMagnitude);
                        star = Mathf.Max(star, Mathf.Clamp01(1 - (p - (p0 + d * tt)).magnitude * 45));
                    }
                    float glyph = r > 0.72f && r < 0.82f && Mathf.Repeat(a * 4 / Mathf.PI, 1) < 0.35f ? 0.8f : 0;
                    float v = Mathf.Max(ring, Mathf.Max(star, glyph));
                    px[y * S + x] = new Color(c.r, c.g, c.b, v);
                }
            tex.SetPixels(px);
            tex.Apply();
            return tex;
        }

        public void Play(string state, float duration = 0.3f)
        {
            if (State == state && state == "idle") return;
            State = state; t = 0; dur = Mathf.Max(0.01f, duration);
        }

        public void Flinch(float k = 1f) { }
        public void SetGlow(Color? color, float k = 1f) { }
        public Transform Socket(string name) => name == "handL" ? L.tip : R.tip;

        HP Thrust(float k, int side)
        {
            float e = k < 0.25f ? -k / 0.25f * 0.4f : Mathf.Sin(Mathf.Min(1, (k - 0.25f) / 0.35f) * Mathf.PI / 2) * (1 - Mathf.Max(0, k - 0.6f) / 0.4f * 0.6f);
            return new HP { x = side * (0.22f - e * 0.08f), y = -0.22f + e * 0.04f, z = -0.55f - e * 0.25f, rx = 1f + e * 0.4f, ry = -side * 0.1f, rz = -side * 0.1f };
        }

        public void Tick(float dt, float speed)
        {
            t += dt; time += dt;
            if (speed > 0.5f) bob += dt * 10;
            float k = Mathf.Min(1, t / dur);
            float bx = Mathf.Sin(bob) * 0.012f, by = Mathf.Abs(Mathf.Cos(bob)) * 0.015f + Mathf.Sin(time * 2) * 0.004f;
            // Valores no mesmo sistema do protótipo web (frente = -z); convertidos ao aplicar.
            var Rp = new HP { x = 0.3f, y = -0.3f, z = -0.55f, rx = 0.25f, ry = 0.15f, rz = -0.25f };
            var Lp = new HP { x = -0.3f, y = -0.3f, z = -0.55f, rx = 0.25f, ry = -0.15f, rz = 0.25f };
            float gR = 0.6f, gL = 0.6f;
            shield.gameObject.SetActive(false);
            switch (State)
            {
                case "cast1": Rp = Thrust(k, 1); gR = 4 * (1 - k) + 0.6f; break;
                case "cast2": Lp = Thrust(k, -1); gL = 4 * (1 - k) + 0.6f; break;
                case "cast3": Rp = Thrust(k, 1); Lp = Thrust(k, -1); Rp.x = 0.1f; Lp.x = -0.1f; gR = gL = 6 * (1 - k) + 0.6f; break;
                case "parry":
                {
                    float e = Mathf.Min(1, t / 0.06f);
                    Rp = new HP { x = 0.12f, y = -0.12f, z = -0.6f, rx = 1.35f * e + 0.25f * (1 - e), ry = 0, rz = -0.15f };
                    Lp = new HP { x = -0.12f, y = -0.12f, z = -0.6f, rx = 1.35f * e + 0.25f * (1 - e), ry = 0, rz = 0.15f };
                    gR = gL = 3;
                    shield.gameObject.SetActive(k < 1);
                    shield.localScale = Vector3.one * 0.9f * (0.6f + e * 0.4f);
                    var c = shieldMat.color; c.a = 1 - Mathf.Max(0, k - 0.5f) * 2; shieldMat.color = c;
                    shield.localRotation = Quaternion.Euler(0, 0, time * 115);
                    break;
                }
                case "dodge": Rp.y -= 0.12f; Lp.y -= 0.12f; Rp.x += 0.08f; Lp.x -= 0.08f; break;
            }
            float a = Mathf.Min(1, dt * 25);
            Apply(R.t, Rp, a, bx, by); Apply(L.t, Lp, a, bx, by);
            R.light.intensity = gR * 0.5f; L.light.intensity = gL * 0.5f;
            Mats.SetEmission(palmGlow, arcane * (1 + Mathf.Max(gR, gL) * 0.5f));
        }

        static void Apply(Transform g, HP P, float a, float bx, float by)
        {
            var target = new Vector3(P.x + bx, P.y + by, -P.z);
            g.localPosition = Vector3.Lerp(g.localPosition, target, a);
            g.localRotation = Quaternion.Slerp(g.localRotation, EcoMath.PoseRot(P.rx, P.ry, P.rz), a);
        }

        public void Dispose() { if (Root) Object.Destroy(Root.gameObject); }
    }
}
