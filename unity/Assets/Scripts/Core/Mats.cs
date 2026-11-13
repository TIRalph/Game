using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Eco
{
    // Materiais criados por código. Funciona no pipeline padrão (Built-in) e na URP.
    // Em builds, inclua os shaders usados em Project Settings > Graphics > Always Included Shaders
    // (Standard, Unlit/Color e Sprites/Default, ou os equivalentes da URP).
    public static class Mats
    {
        static Shader lit, unlit, line;
        static readonly Dictionary<int, Material> litCache = new Dictionary<int, Material>();
        static readonly Dictionary<int, Material> unlitCache = new Dictionary<int, Material>();

        static bool Urp => GraphicsSettings.currentRenderPipeline != null;

        static Shader Lit => lit ? lit : (lit = Shader.Find(Urp ? "Universal Render Pipeline/Lit" : "Standard") ?? Shader.Find("Standard"));
        static Shader Unlit => unlit ? unlit : (unlit = Shader.Find(Urp ? "Universal Render Pipeline/Unlit" : "Unlit/Color") ?? Shader.Find("Unlit/Color"));
        static Shader LineShader => line ? line : (line = Shader.Find("Sprites/Default"));

        static int Key(Color c, float a = 0) => ((int)(c.r * 255) << 24) ^ ((int)(c.g * 255) << 16) ^ ((int)(c.b * 255) << 8) ^ (int)(c.a * 255) ^ (int)(a * 977);

        // Material compartilhado (não altere em tempo de jogo).
        public static Material LitShared(Color c, float metal = 0.1f, float smooth = 0.3f)
        {
            int k = Key(c, metal * 3 + smooth);
            if (litCache.TryGetValue(k, out var m) && m) return m;
            m = NewLit(c, metal, smooth);
            litCache[k] = m;
            return m;
        }

        // Material próprio (pode mudar a emissão, por exemplo no brilho de aviso).
        public static Material NewLit(Color c, float metal = 0.1f, float smooth = 0.3f)
        {
            var m = new Material(Lit);
            m.SetColor(Urp ? "_BaseColor" : "_Color", c);
            m.color = c;
            m.SetFloat("_Metallic", metal);
            m.SetFloat(Urp ? "_Smoothness" : "_Glossiness", smooth);
            m.EnableKeyword("_EMISSION");
            m.SetColor("_EmissionColor", Color.black);
            return m;
        }

        public static void SetEmission(Material m, Color c) { m.SetColor("_EmissionColor", c); }

        public static Material UnlitShared(Color c)
        {
            int k = Key(c);
            if (unlitCache.TryGetValue(k, out var m) && m) return m;
            m = new Material(Unlit);
            m.SetColor(Urp ? "_BaseColor" : "_Color", c);
            m.color = c;
            unlitCache[k] = m;
            return m;
        }

        // Material com transparência e cor por vértice (linhas, anéis, partículas).
        public static Material NewTransparent(Color c)
        {
            var m = new Material(LineShader) { color = c };
            return m;
        }

        // ---------- Brilho (shader Eco/Glow, aditivo e sem luz) ----------
        static Shader glowSh, glowOverlaySh;
        static Texture2D radial, softLine, alert;

        // Material de brilho próprio (a cor pode mudar em tempo de jogo).
        public static Material Glow(Color c, Texture tex = null, bool overlay = false)
        {
            var sh = overlay ? (glowOverlaySh ? glowOverlaySh : glowOverlaySh = Shader.Find("Eco/GlowOverlay"))
                             : (glowSh ? glowSh : glowSh = Shader.Find("Eco/Glow"));
            var m = new Material(sh != null ? sh : LineShader) { color = c };
            if (tex != null) m.mainTexture = tex;
            return m;
        }

        // Disco com borda suave (halos, núcleo dos projéteis, faíscas).
        public static Texture2D RadialTex
        {
            get
            {
                if (radial) return radial;
                const int S = 64;
                radial = new Texture2D(S, S, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
                for (int y = 0; y < S; y++)
                    for (int x = 0; x < S; x++)
                    {
                        float d = new Vector2(x - S / 2f + 0.5f, y - S / 2f + 0.5f).magnitude / (S / 2f);
                        float a = Mathf.Clamp01(1 - d);
                        radial.SetPixel(x, y, new Color(1, 1, 1, a * a * (0.6f + 0.4f * a)));
                    }
                radial.Apply();
                return radial;
            }
        }

        // Faixa com bordas suaves para LineRenderer e rastros (u ao longo, v na largura).
        public static Texture2D SoftLineTex
        {
            get
            {
                if (softLine) return softLine;
                softLine = new Texture2D(4, 32, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
                for (int y = 0; y < 32; y++)
                {
                    float v = 1 - Mathf.Abs(y - 15.5f) / 16f;
                    for (int x = 0; x < 4; x++) softLine.SetPixel(x, y, new Color(1, 1, 1, Mathf.Pow(v, 1.6f)));
                }
                softLine.Apply();
                return softLine;
            }
        }

        // Ícone de aviso: "!" dentro de um losango.
        public static Texture2D AlertTex
        {
            get
            {
                if (alert) return alert;
                const int S = 64;
                alert = new Texture2D(S, S, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
                for (int y = 0; y < S; y++)
                    for (int x = 0; x < S; x++)
                    {
                        float u = (x - S / 2f + 0.5f) / (S / 2f), v = (y - S / 2f + 0.5f) / (S / 2f);
                        float dia = Mathf.Abs(u) + Mathf.Abs(v);
                        float edge = Mathf.Clamp01(1 - Mathf.Abs(dia - 0.85f) * 9f);
                        float fill = dia < 0.85f ? 0.25f : 0;
                        bool bar = Mathf.Abs(u) < 0.09f && v > -0.12f && v < 0.5f;
                        bool dot = new Vector2(u, v + 0.3f).magnitude < 0.1f;
                        float a = Mathf.Max(edge, Mathf.Max(fill, bar || dot ? 1 : 0));
                        alert.SetPixel(x, y, new Color(1, 1, 1, a));
                    }
                alert.Apply();
                return alert;
            }
        }

        public static GameObject Prim(PrimitiveType t, Transform parent, Material mat, Vector3 pos, Vector3 scale, string name = null)
        {
            var g = GameObject.CreatePrimitive(t);
            var col = g.GetComponent<Collider>();
            if (col) Object.Destroy(col);
            if (name != null) g.name = name;
            g.transform.SetParent(parent, false);
            g.transform.localPosition = pos;
            g.transform.localScale = scale;
            g.GetComponent<Renderer>().sharedMaterial = mat;
            return g;
        }
    }
}
