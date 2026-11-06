using System.Collections.Generic;
using UnityEngine;

namespace Eco
{
    public class Pillar { public float x, z, r, h = 8; }

    public class Door
    {
        public float x, z;
        public RoomOption opt;
        public Material portal;
        public string label1, label2, label3;
        public Color color;
        public Vector3 LabelPos => new Vector3(x, 5.6f, z);
    }

    public class RoomOption { public string type; public string rewardText; public bool nextFloor; }

    // Geometria de cada sala: chão, paredes, pilares, torres e portais de saída.
    // Os portais ficam na parede da frente (+Z); o jogador nasce no fundo (-Z) olhando para eles.
    public class Room
    {
        public readonly Transform root;
        public readonly float half;
        public readonly List<Pillar> pillars = new List<Pillar>();
        public readonly List<Vector3> towers = new List<Vector3>();
        public readonly List<Door> doors = new List<Door>();
        readonly FloorTheme theme;
        readonly Material accent;

        static Texture2D GridTexture(Color baseC, Color line)
        {
            const int S = 128;
            var t = new Texture2D(S, S, TextureFormat.RGBA32, true) { wrapMode = TextureWrapMode.Repeat, filterMode = FilterMode.Bilinear };
            var px = new Color[S * S];
            var rng = new System.Random(7);
            for (int i = 0; i < px.Length; i++) px[i] = baseC;
            for (int n = 0; n < 220; n++)
            {
                int x0 = rng.Next(S), y0 = rng.Next(S), w = 2 + rng.Next(6), h = 2 + rng.Next(6);
                float d = (float)rng.NextDouble() * 0.15f;
                for (int y = y0; y < Mathf.Min(S, y0 + h); y++) for (int x = x0; x < Mathf.Min(S, x0 + w); x++) px[y * S + x] = Color.Lerp(px[y * S + x], Color.black, d);
            }
            for (int i = 0; i < S; i++)
                for (int k = 0; k < 2; k++)
                {
                    px[k * S + i] = Color.Lerp(px[k * S + i], line, 0.35f);
                    px[i * S + k] = Color.Lerp(px[i * S + k], line, 0.35f);
                }
            t.SetPixels(px);
            t.Apply();
            return t;
        }

        public Room(Transform parent, FloorTheme theme, string layout, float size)
        {
            this.theme = theme;
            half = size / 2;
            root = new GameObject("Sala_" + layout).transform;
            root.SetParent(parent, false);
            accent = Mats.UnlitShared(theme.accent);

            var floorMat = Mats.NewLit(Color.white, 0, 0.1f);
            floorMat.mainTexture = GridTexture(theme.floor, theme.accent);
            floorMat.mainTextureScale = new Vector2(size / 4, size / 4);
            Mats.Prim(PrimitiveType.Cube, root, floorMat, new Vector3(0, -0.05f, 0), new Vector3(size, 0.1f, size), "chao");

            var wallMat = Mats.NewLit(Color.white, 0, 0.05f);
            wallMat.mainTexture = GridTexture(theme.wall, theme.accent);
            wallMat.mainTextureScale = new Vector2(size / 4, 2);
            const float wallH = 8;
            for (int i = 0; i < 4; i++)
            {
                float a = i * Mathf.PI / 2;
                var w = Mats.Prim(PrimitiveType.Cube, root, wallMat, new Vector3(Mathf.Sin(a) * (half + 0.5f), wallH / 2, Mathf.Cos(a) * (half + 0.5f)), new Vector3(size + 2, wallH, 1), "parede");
                w.transform.localRotation = Quaternion.Euler(0, a * EcoMath.Deg, 0);
                var s = Mats.Prim(PrimitiveType.Cube, root, accent, new Vector3(Mathf.Sin(a) * (half - 0.02f), 0.6f, Mathf.Cos(a) * (half - 0.02f)), new Vector3(size, 0.08f, 0.05f), "faixa");
                s.transform.localRotation = w.transform.localRotation;
            }

            switch (layout)
            {
                case "arena": { float d = size * 0.22f; AddPillar(d, d); AddPillar(-d, d); AddPillar(d, -d); AddPillar(-d, -d); break; }
                case "ring": for (int i = 0; i < 6; i++) { float a = i / 6f * Mathf.PI * 2 + 0.3f; AddPillar(Mathf.Cos(a) * size * 0.3f, Mathf.Sin(a) * size * 0.3f, 0.7f); } break;
                case "towers":
                {
                    float d = size * 0.32f;
                    var towerMat = Mats.LitShared(theme.wall, 0, 0.1f);
                    float[,] pts = { { d, d }, { -d, d }, { d, -d }, { -d, -d }, { d * 1.15f, 0 }, { -d * 1.15f, 0 } };
                    for (int i = 0; i < 6; i++)
                    {
                        float x = pts[i, 0], z = pts[i, 1];
                        Mats.Prim(PrimitiveType.Cube, root, towerMat, new Vector3(x, 1.5f, z), new Vector3(2.4f, 3, 2.4f), "torre");
                        pillars.Add(new Pillar { x = x, z = z, r = 1.75f, h = 3 });
                        towers.Add(new Vector3(x, 3, z));
                    }
                    break;
                }
                case "boss": for (int i = 0; i < 8; i++) { float a = i / 8f * Mathf.PI * 2; AddPillar(Mathf.Cos(a) * (half - 2.5f), Mathf.Sin(a) * (half - 2.5f), 0.8f); } break;
                case "hub": BuildHub(); break;
            }

            // Luzes
            float pi = 9f * theme.points;
            foreach (var c in new[] { new Vector2(0, 0), new Vector2(half * 0.6f, half * 0.6f), new Vector2(-half * 0.6f, -half * 0.6f) })
                AddLight(new Vector3(c.x, 6, c.y), theme.light, pi, size * 1.2f);
        }

        void AddLight(Vector3 pos, Color c, float intensity, float range)
        {
            var g = new GameObject("luz");
            g.transform.SetParent(root, false);
            g.transform.localPosition = pos;
            var l = g.AddComponent<Light>();
            l.type = LightType.Point; l.color = c; l.intensity = intensity; l.range = range;
        }

        void AddPillar(float x, float z, float r = 0.9f, float h = 8)
        {
            Mats.Prim(PrimitiveType.Cylinder, root, Mats.LitShared(theme.wall, 0, 0.2f), new Vector3(x, h / 2, z), new Vector3(r * 2.1f, h / 2, r * 2.1f), "pilar");
            Mats.Prim(PrimitiveType.Cylinder, root, accent, new Vector3(x, 1.2f, z), new Vector3(r * 2.2f, 0.04f, r * 2.2f), "anel");
            pillars.Add(new Pillar { x = x, z = z, r = r, h = h });
        }

        // Pátio do Mosteiro do Eco: o Sino partido em três sobre um pedestal.
        void BuildHub()
        {
            for (int i = 0; i < 8; i++) { float a = i / 8f * Mathf.PI * 2 + Mathf.PI / 8; AddPillar(Mathf.Cos(a) * (half - 3), Mathf.Sin(a) * (half - 3), 0.7f); }
            var stone = Mats.LitShared(theme.wall, 0, 0.15f);
            var bronze = Mats.NewLit(EcoMath.Hex(0x8a6a30), 0.8f, 0.65f);
            Mats.SetEmission(bronze, theme.accent * 0.08f);
            Mats.Prim(PrimitiveType.Cylinder, root, stone, new Vector3(0, 0.3f, 4), new Vector3(4.8f, 0.3f, 4.8f), "pedestal");
            for (int i = 0; i < 3; i++)
            {
                float a = i * Mathf.PI * 2 / 3;
                var piece = Mats.Prim(PrimitiveType.Cube, root, bronze, new Vector3(Mathf.Cos(a) * 0.75f, 1.8f + i * 0.15f, 4 + Mathf.Sin(a) * 0.75f), new Vector3(1.5f, 2.4f, 0.12f), "sino");
                piece.transform.localRotation = Quaternion.Euler(8 * (i - 1), -a * EcoMath.Deg + 90, 12f);
            }
            pillars.Add(new Pillar { x = 0, z = 4, r = 2.4f, h = 4 });
            AddLight(new Vector3(0, 3, 4), theme.accent, 6, 10);
        }

        public void AddDoors(List<RoomOption> options)
        {
            int n = options.Count;
            float spacing = Mathf.Min(8, (half * 2 - 6) / Mathf.Max(1, n));
            var frame = Mats.LitShared(EcoMath.Hex(0x222233), 0.2f, 0.4f);
            for (int i = 0; i < n; i++)
            {
                var opt = options[i];
                var rt = RoomTypes.All[opt.type];
                float x = (i - (n - 1) / 2f) * spacing, z = half - 1.2f;
                var g = new GameObject("portal_" + opt.type).transform;
                g.SetParent(root, false);
                g.localPosition = new Vector3(x, 0, z);
                Mats.Prim(PrimitiveType.Cube, g, frame, new Vector3(-1.6f, 2.2f, 0), new Vector3(0.4f, 4.4f, 0.6f));
                Mats.Prim(PrimitiveType.Cube, g, frame, new Vector3(1.6f, 2.2f, 0), new Vector3(0.4f, 4.4f, 0.6f));
                Mats.Prim(PrimitiveType.Cube, g, frame, new Vector3(0, 4.4f, 0), new Vector3(3.6f, 0.4f, 0.6f));
                var pm = Mats.NewTransparent(new Color(rt.color.r, rt.color.g, rt.color.b, 0.55f));
                Mats.Prim(PrimitiveType.Cube, g, pm, new Vector3(0, 2.1f, -0.05f), new Vector3(2.8f, 4f, 0.02f), "luz_portal");
                var lg = new GameObject("luz"); lg.transform.SetParent(g, false); lg.transform.localPosition = new Vector3(0, 2.5f, -1.5f);
                var l = lg.AddComponent<Light>(); l.type = LightType.Point; l.color = rt.color; l.intensity = 3; l.range = 8;
                doors.Add(new Door { x = x, z = z, opt = opt, portal = pm, label1 = rt.name, label2 = opt.rewardText, label3 = rt.desc, color = rt.color });
            }
        }

        public void Collide(ref Vector3 pos, float radius)
        {
            float lim = half - radius - 0.05f;
            pos.x = Mathf.Clamp(pos.x, -lim, lim);
            pos.z = Mathf.Clamp(pos.z, -lim, lim);
            foreach (var p in pillars)
            {
                float dx = pos.x - p.x, dz = pos.z - p.z;
                float d = Mathf.Sqrt(dx * dx + dz * dz), min = p.r + radius;
                if (d < min && d > 1e-5f) { pos.x = p.x + dx / d * min; pos.z = p.z + dz / d * min; }
            }
        }

        // Linha de visão bloqueada por pilares (2D)?
        public bool Blocked(Vector3 a, Vector3 b)
        {
            foreach (var p in pillars)
            {
                float abx = b.x - a.x, abz = b.z - a.z;
                float len2 = abx * abx + abz * abz; if (len2 < 1e-6f) len2 = 1;
                float t = Mathf.Clamp01(((p.x - a.x) * abx + (p.z - a.z) * abz) / len2);
                float cx = a.x + abx * t, cz = a.z + abz * t;
                if (Mathf.Sqrt((cx - p.x) * (cx - p.x) + (cz - p.z) * (cz - p.z)) < p.r * 0.9f && t > 0.05f && t < 0.95f) return true;
            }
            return false;
        }

        public void Update(float time)
        {
            foreach (var d in doors) { var c = d.portal.color; c.a = 0.45f + Mathf.Sin(time * 3 + d.x) * 0.15f; d.portal.color = c; }
        }

        public void Dispose() { if (root) Object.Destroy(root.gameObject); }
    }
}
