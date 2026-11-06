using System.Collections.Generic;
using UnityEngine;

namespace Eco
{
    // Partículas, anéis, raios, números de dano e efeitos de tela.
    public class FX
    {
        class Part { public Transform t; public Vector3 v; public float life, max; public Material m; }
        class Ring { public LineRenderer lr; public float t, dur, maxR; public Vector3 c; }
        class Beam { public LineRenderer lr; public float t, dur; }
        public class Number { public Vector3 pos; public string text; public bool crit; public Color color; public float t; }

        readonly Transform root;
        readonly List<Part> parts = new List<Part>();
        readonly Stack<Part> pool = new Stack<Part>();
        readonly List<Ring> rings = new List<Ring>();
        readonly List<Beam> beams = new List<Beam>();
        public readonly List<Number> numbers = new List<Number>();

        public float shake, flash, hurt;
        public Color flashColor = Color.white;
        public string calloutText;
        public Color calloutColor;
        public float calloutTimer;

        public FX(Transform root) { this.root = root; }

        public void Burst(Vector3 pos, Color color, int count = 12, float speed = 6, float life = 0.5f, float size = 1)
        {
            for (int i = 0; i < count; i++)
            {
                var p = pool.Count > 0 ? pool.Pop() : null;
                if (p == null)
                {
                    var m = Mats.NewTransparent(color);
                    var g = Mats.Prim(PrimitiveType.Cube, root, m, Vector3.zero, Vector3.one * 0.08f, "particula");
                    p = new Part { t = g.transform, m = m };
                }
                p.t.gameObject.SetActive(true);
                p.t.position = pos;
                p.t.localScale = Vector3.one * 0.08f * size * Random.Range(0.6f, 1.4f);
                p.m.color = color;
                p.v = new Vector3(Random.value - 0.5f, Random.value * 0.8f, Random.value - 0.5f).normalized * speed * Random.Range(0.4f, 1.2f);
                p.life = p.max = life;
                parts.Add(p);
            }
        }

        LineRenderer NewLine(Color c, float width, int points)
        {
            var g = new GameObject("linha");
            g.transform.SetParent(root, false);
            var lr = g.AddComponent<LineRenderer>();
            lr.material = Mats.NewTransparent(c);
            lr.startColor = lr.endColor = c;
            lr.widthMultiplier = width;
            lr.positionCount = points;
            lr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            lr.receiveShadows = false;
            return lr;
        }

        public void RingFx(Vector3 center, Color color, float maxR = 4, float dur = 0.35f)
        {
            var lr = NewLine(color, 0.12f, 49);
            lr.loop = true;
            rings.Add(new Ring { lr = lr, t = 0, dur = dur, maxR = maxR, c = new Vector3(center.x, Mathf.Max(0.05f, center.y), center.z) });
        }

        public void BeamFx(IList<Vector3> pts, Color color, float dur = 0.25f)
        {
            var lr = NewLine(color, 0.08f, pts.Count);
            for (int i = 0; i < pts.Count; i++)
            {
                var p = pts[i];
                if (i > 0 && i < pts.Count - 1) p += Random.insideUnitSphere * 0.15f;
                lr.SetPosition(i, p);
            }
            beams.Add(new Beam { lr = lr, t = 0, dur = dur });
        }

        public void Num(Vector3 world, string text, bool crit = false, Color? color = null)
        {
            numbers.Add(new Number { pos = world + new Vector3(Random.Range(-0.3f, 0.3f), 0, Random.Range(-0.3f, 0.3f)), text = text, crit = crit, color = color ?? (crit ? EcoMath.Hex(0xffd34a) : Color.white) });
        }

        public void Flash(float strength, Color? c = null) { flashColor = c ?? Color.white; flash = Mathf.Max(flash, strength); }
        public void Hurt() { hurt = 1; }
        public void AddShake(float v) { shake = Mathf.Min(1.2f, shake + v); }
        public void Callout(string text, Color c, float dur = 0.7f) { calloutText = text; calloutColor = c; calloutTimer = dur; }

        public void Update(float dt, float realDt)
        {
            for (int i = parts.Count - 1; i >= 0; i--)
            {
                var p = parts[i];
                p.life -= dt;
                p.v.y -= 14 * dt;
                var pos = p.t.position + p.v * dt;
                if (pos.y < 0.04f) { pos.y = 0.04f; p.v.y *= -0.3f; p.v.x *= 0.7f; p.v.z *= 0.7f; }
                p.t.position = pos;
                var c = p.m.color; c.a = Mathf.Max(0, p.life / p.max); p.m.color = c;
                if (p.life <= 0) { p.t.gameObject.SetActive(false); pool.Push(p); parts.RemoveAt(i); }
            }
            for (int i = rings.Count - 1; i >= 0; i--)
            {
                var r = rings[i];
                r.t += dt;
                float k = r.t / r.dur, rad = 0.2f + k * r.maxR;
                for (int j = 0; j < 49; j++)
                {
                    float a = j / 48f * Mathf.PI * 2;
                    r.lr.SetPosition(j, r.c + new Vector3(Mathf.Cos(a) * rad, 0, Mathf.Sin(a) * rad));
                }
                var col = r.lr.startColor; col.a = 1 - k; r.lr.startColor = r.lr.endColor = col;
                if (k >= 1) { Object.Destroy(r.lr.gameObject); rings.RemoveAt(i); }
            }
            for (int i = beams.Count - 1; i >= 0; i--)
            {
                var b = beams[i];
                b.t += realDt;
                var col = b.lr.startColor; col.a = 1 - b.t / b.dur; b.lr.startColor = b.lr.endColor = col;
                if (b.t >= b.dur) { Object.Destroy(b.lr.gameObject); beams.RemoveAt(i); }
            }
            for (int i = numbers.Count - 1; i >= 0; i--) { numbers[i].t += realDt; if (numbers[i].t > 0.8f) numbers.RemoveAt(i); }
            flash = Mathf.Max(0, flash - realDt * 4);
            hurt = Mathf.Max(0, hurt - realDt * 2);
            shake = Mathf.Max(0, shake - realDt * 3);
            if (calloutTimer > 0) calloutTimer -= realDt;
        }

        public void Clear()
        {
            foreach (var p in parts) { p.t.gameObject.SetActive(false); pool.Push(p); }
            parts.Clear();
            foreach (var r in rings) Object.Destroy(r.lr.gameObject);
            rings.Clear();
            foreach (var b in beams) Object.Destroy(b.lr.gameObject);
            beams.Clear();
            numbers.Clear();
        }
    }
}
