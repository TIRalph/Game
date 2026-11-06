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
