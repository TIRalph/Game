using System.Collections.Generic;
using UnityEngine;

namespace Eco
{
    // Efeitos sonoros sintetizados na inicialização (sem arquivos de áudio).
    // Para trocar por sons próprios, coloque AudioClips em Assets/Resources/Audio/<nome>.
    public static class Sfx
    {
        const int Rate = 44100;
        static readonly Dictionary<string, AudioClip> clips = new Dictionary<string, AudioClip>();
        static readonly Dictionary<string, AudioClip> customs = new Dictionary<string, AudioClip>();
        static AudioSource source;
        public static float Volume = 0.6f;

        enum Wave { Sine, Square, Saw, Triangle }

        class Buf
        {
            public float[] d;
            public Buf(float seconds) { d = new float[Mathf.CeilToInt(seconds * Rate)]; }

            public Buf Tone(float f0, float f1, Wave w, float dur, float vol, float delay = 0)
            {
                int s0 = (int)(delay * Rate), n = (int)(dur * Rate);
                double ph = 0;
                for (int i = 0; i < n && s0 + i < d.Length; i++)
                {
                    float k = i / (float)n;
                    float f = f1 > 0 ? f0 * Mathf.Pow(f1 / f0, k) : f0;
                    ph += f / Rate;
                    float p = (float)(ph - System.Math.Floor(ph));
                    float v = w == Wave.Sine ? Mathf.Sin(p * Mathf.PI * 2) : w == Wave.Square ? (p < 0.5f ? 1 : -1) : w == Wave.Saw ? p * 2 - 1 : 1 - 4 * Mathf.Abs(p - 0.5f);
                    d[s0 + i] += v * vol * Mathf.Exp(-5f * k);
                }
                return this;
            }

            // Ruído filtrado (passa-baixa simples de um polo), com varredura opcional da frequência.
            public Buf Noise(float dur, float vol, float f0, float f1 = 0, float delay = 0)
            {
                int s0 = (int)(delay * Rate), n = (int)(dur * Rate);
                float y = 0, prev = 0;
                for (int i = 0; i < n && s0 + i < d.Length; i++)
                {
                    float k = i / (float)n;
                    float f = f1 > 0 ? f0 * Mathf.Pow(f1 / f0, k) : f0;
                    float a = 1 - Mathf.Exp(-2 * Mathf.PI * f / Rate);
                    float x = Random.value * 2 - 1;
                    y += a * (x - y);
                    float band = y - prev * 0.5f; prev = y;
                    d[s0 + i] += band * vol * Mathf.Exp(-5f * k) * 1.6f;
                }
                return this;
            }
        }

        static void Add(string name, Buf b)
        {
            var c = AudioClip.Create(name, b.d.Length, 1, Rate, false);
            c.SetData(b.d, 0);
            clips[name] = c;
        }

        public static void Init(GameObject host)
        {
            if (source != null) return;
            source = host.AddComponent<AudioSource>();
            source.playOnAwake = false;
            Add("swing", new Buf(0.16f).Noise(0.14f, 0.25f, 1200, 3500));
            Add("hit", new Buf(0.12f).Noise(0.1f, 0.5f, 600).Tone(160, 60, Wave.Square, 0.08f, 0.2f));
            Add("crit", new Buf(0.2f).Noise(0.18f, 0.6f, 900).Tone(900, 300, Wave.Saw, 0.15f, 0.18f));
            Add("parry", new Buf(0.52f).Tone(1800, 1400, Wave.Triangle, 0.4f, 0.45f).Tone(2700, 2300, Wave.Sine, 0.5f, 0.25f).Noise(0.08f, 0.5f, 5000));
            Add("parryWhiff", new Buf(0.08f).Tone(500, 420, Wave.Triangle, 0.06f, 0.12f));
            Add("dodge", new Buf(0.2f).Noise(0.18f, 0.2f, 600, 2400));
            Add("perfectDodge", new Buf(0.42f).Tone(300, 1200, Wave.Sine, 0.35f, 0.3f).Tone(600, 2400, Wave.Sine, 0.35f, 0.15f, 0.05f));
            Add("hurt", new Buf(0.27f).Tone(220, 80, Wave.Saw, 0.25f, 0.35f).Noise(0.15f, 0.4f, 400));
            Add("windup", new Buf(0.2f).Tone(700, 1100, Wave.Triangle, 0.18f, 0.12f));
            Add("windupHeavy", new Buf(0.32f).Tone(140, 260, Wave.Saw, 0.3f, 0.18f));
            Add("shoot", new Buf(0.14f).Tone(900, 300, Wave.Square, 0.12f, 0.12f));
            Add("reflect", new Buf(0.14f).Tone(1200, 2400, Wave.Square, 0.12f, 0.18f));
            Add("slam", new Buf(0.52f).Noise(0.5f, 0.7f, 200).Tone(90, 30, Wave.Sine, 0.5f, 0.5f));
            Add("death", new Buf(0.37f).Tone(300, 60, Wave.Triangle, 0.35f, 0.2f).Noise(0.3f, 0.25f, 800, 200));
            Add("stagger", new Buf(0.38f).Tone(400, 200, Wave.Square, 0.3f, 0.2f).Tone(600, 300, Wave.Square, 0.3f, 0.12f, 0.06f));
            Add("pickup", new Buf(0.26f).Tone(660, 0, Wave.Sine, 0.1f, 0.2f).Tone(990, 0, Wave.Sine, 0.16f, 0.2f, 0.08f));
            Add("door", new Buf(0.62f).Tone(220, 660, Wave.Sine, 0.6f, 0.25f));
            var clear = new Buf(0.6f); float[] notes = { 523, 659, 784, 1046 };
            for (int i = 0; i < 4; i++) clear.Tone(notes[i], 0, Wave.Triangle, 0.3f, 0.18f, i * 0.08f);
            Add("clear", clear);
            Add("explosion", new Buf(0.47f).Noise(0.45f, 0.6f, 1200, 120));
            Add("jump", new Buf(0.12f).Tone(250, 400, Wave.Sine, 0.1f, 0.08f));
        }

        public static void Play(string name, float vol = 1f)
        {
            if (source == null) return;
            if (!customs.TryGetValue(name, out var custom)) { custom = Resources.Load<AudioClip>("Audio/" + name); customs[name] = custom; }
            var c = custom != null ? custom : (clips.TryGetValue(name, out var g) ? g : null);
            if (c != null) source.PlayOneShot(c, Volume * vol);
        }
    }
}
