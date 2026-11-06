using System.Collections.Generic;
using UnityEngine;

namespace Eco
{
    // Interface desenhada com IMGUI (sem prefabs). Resolução virtual de 720 px de altura.
    // Para uma UI final, troque por UI Toolkit/uGUI lendo os mesmos campos do GameManager.
    public class GameUI : MonoBehaviour
    {
        GameManager g;
        float scale, W, H;
        bool stylesReady;
        GUIStyle title, h2, body, small, muted, center, btn, btnPrimary, card, cardTitle, callout, num, numCrit, nameStyle, dlgText, label3d;
        Texture2D white;
        string skillsTab = "mago";
        bool resetArmed;

        static readonly Color Panel = new Color(0.06f, 0.055f, 0.09f, 0.94f);
        static readonly Color Border = new Color(0.2f, 0.19f, 0.29f);
        static readonly Color Accent = EcoMath.Hex(0x7a6cff), Gold = EcoMath.Hex(0xe8c27a), Text = EcoMath.Hex(0xe8e6f0), Muted = EcoMath.Hex(0x9a98aa);

        void Awake() { g = GetComponent<GameManager>(); }

        Texture2D Tex(Color c) { var t = new Texture2D(1, 1); t.SetPixel(0, 0, c); t.Apply(); return t; }

        void InitStyles()
        {
            if (stylesReady) return;
            stylesReady = true;
            white = Tex(Color.white);
            GUIStyle S(int size, FontStyle fs = FontStyle.Normal, TextAnchor a = TextAnchor.UpperLeft, Color? c = null) =>
                new GUIStyle(GUI.skin.label) { fontSize = size, fontStyle = fs, alignment = a, wordWrap = true, normal = { textColor = c ?? Text }, richText = true };
            title = S(64, FontStyle.Bold, TextAnchor.UpperLeft, EcoMath.Hex(0xc8bcff));
            h2 = S(30, FontStyle.Bold, TextAnchor.UpperCenter);
            body = S(18);
            small = S(14);
            muted = S(15, FontStyle.Normal, TextAnchor.UpperLeft, Muted);
            center = S(18, FontStyle.Normal, TextAnchor.UpperCenter);
            callout = S(34, FontStyle.Bold, TextAnchor.MiddleCenter);
            num = S(20, FontStyle.Bold, TextAnchor.MiddleCenter);
            numCrit = S(28, FontStyle.Bold, TextAnchor.MiddleCenter, EcoMath.Hex(0xffd34a));
            nameStyle = S(14, FontStyle.Bold, TextAnchor.UpperLeft);
            dlgText = S(20);
            label3d = S(22, FontStyle.Bold, TextAnchor.MiddleCenter);
            cardTitle = S(17, FontStyle.Bold);
            btn = new GUIStyle(GUI.skin.button) { fontSize = 16, padding = new RectOffset(14, 14, 8, 8), wordWrap = true };
            btn.normal.background = Tex(EcoMath.Hex(0x1b1a26)); btn.hover.background = Tex(EcoMath.Hex(0x2a2840)); btn.active.background = btn.hover.background;
            btn.normal.textColor = btn.hover.textColor = btn.active.textColor = Text;
            btnPrimary = new GUIStyle(btn);
            btnPrimary.normal.background = Tex(EcoMath.Hex(0x4b3cc9)); btnPrimary.hover.background = Tex(EcoMath.Hex(0x5d4de0));
            card = new GUIStyle(btn) { alignment = TextAnchor.UpperLeft, padding = new RectOffset(14, 14, 12, 12) };
            card.normal.background = Tex(EcoMath.Hex(0x15141f)); card.hover.background = Tex(EcoMath.Hex(0x221f33));
        }

        // ---------- Teclado fora do OnGUI ----------
        void Update()
        {
            if (g == null) return;
            if (g.state == GState.Dialogue)
            {
                var d = g.dialogue;
                for (int i = 0; i < 6; i++) if (GameInput.Consume((i + 1).ToString())) d.Pick(i);
                if (GameInput.Consume("Space") || GameInput.Consume("E") || GameInput.Consume("Enter")) d.Advance();
            }
            else if (g.state == GState.Choice)
            {
                for (int i = 0; i < 4; i++) if (GameInput.Consume((i + 1).ToString())) g.TakeBoon(i);
            }
            else if (g.state == GState.Paused && GameInput.Consume("Escape")) g.Resume();
        }

        void OnGUI()
        {
            if (g == null) return;
            InitStyles();
            scale = Screen.height / 720f;
            W = Screen.width / scale; H = 720;
            GUI.matrix = Matrix4x4.Scale(new Vector3(scale, scale, 1));

            if (g.state == GState.Menu) { if (g.overlay != null) Overlay(); else Menu(); return; }

            Hud();
            switch (g.state)
            {
                case GState.Dialogue: DialogueBox(); break;
                case GState.Choice: Choice(); break;
                case GState.Overlay: Overlay(); break;
                case GState.Paused: Pause(); break;
                case GState.End: End(); break;
                case GState.Playing:
                    if (!GameInput.Locked)
                    {
                        Box(new Rect(W / 2 - 110, H * 0.6f, 220, 40), new Color(0, 0, 0, 0.6f));
                        GUI.Label(new Rect(W / 2 - 110, H * 0.6f + 9, 220, 30), "Clique para jogar", center);
                        if (Event.current.type == EventType.MouseDown) GameInput.Lock();
                    }
                    break;
            }
        }

        // ---------- Utilidades ----------
        void Box(Rect r, Color c) { var old = GUI.color; GUI.color = c; GUI.DrawTexture(r, white); GUI.color = old; }
        void Frame(Rect r, Color fill, Color border) { Box(r, border); Box(new Rect(r.x + 1, r.y + 1, r.width - 2, r.height - 2), fill); }
        void Label(Rect r, string t, GUIStyle s, Color c) { var old = s.normal.textColor; s.normal.textColor = c; GUI.Label(r, t, s); s.normal.textColor = old; }
        void Shadowed(Rect r, string t, GUIStyle s, Color c) { Label(new Rect(r.x + 2, r.y + 2, r.width, r.height), t, s, new Color(0, 0, 0, 0.8f * c.a)); Label(r, t, s, c); }
        void Dim(float a = 0.85f) => Box(new Rect(0, 0, W, H), new Color(0.03f, 0.03f, 0.06f, a));

        bool WorldToGui(Vector3 world, out Vector2 gui)
        {
            var sp = g.cam.WorldToScreenPoint(world);
            gui = new Vector2(sp.x / scale, (Screen.height - sp.y) / scale);
            return sp.z > 0;
        }

        // ---------- Menu ----------
        void Menu()
        {
            Box(new Rect(0, 0, W * 0.5f, H), new Color(0.024f, 0.02f, 0.05f, 0.88f));
            float x = Mathf.Max(24, W * 0.07f), y = 190;
            Shadowed(new Rect(x, y, 700, 80), "ECO DA LÂMINA", title, title.normal.textColor); y += 86;
            Label(new Rect(x, y, 470, 50), "O Sino do Eco foi partido. Desça às Profundezas e traga os fragmentos de volta.", body, EcoMath.Hex(0xaaa6c0)); y += 64;
            var cls = g.CurrentClass;
            Label(new Rect(x, y, 470, 30), cls != null ? $"Caminho atual: {cls.path} ({cls.name})" : "Um novo aprendiz chega ao Mosteiro do Eco.", muted, Muted); y += 40;
            if (GUI.Button(new Rect(x, y, 110, 42), "Jogar", btnPrimary)) g.EnterHub();
            if (GUI.Button(new Rect(x + 120, y, 200, 42), "Árvore de Habilidades", btn)) { skillsTab = string.IsNullOrEmpty(g.save.story.classe) ? "mago" : g.save.story.classe; g.OpenOverlay("skills", null); }
            if (GUI.Button(new Rect(x + 330, y, 120, 42), "Santuário", btn)) g.OpenOverlay("meta", null);
            y += 52;
            if (GUI.Button(new Rect(x, y, 140, 42), "Como jogar", btn)) g.OpenOverlay("help", null);
            y += 56;
            Label(new Rect(x, y, 500, 30), $"◈ {g.save.ecos} Ecos · Expedições: {g.save.runs} · Vitórias: {g.save.wins}", muted, Muted);
        }

        // ---------- HUD ----------
        void Hud()
        {
            var p = g.player; var run = g.run;
            if (p == null || run == null) return;
            var st = run.stats;

            // Barras dos inimigos e rótulos dos portais
            foreach (var e in g.enemies)
            {
                if (e.dead || e.def.boss) continue;
                float hk = Mathf.Clamp01(e.hp / e.hpMax), pk = Mathf.Clamp01(e.posture / e.postureMax);
                if (hk >= 1 && pk < 0.01f) continue;
                if (!WorldToGui(new Vector3(e.pos.x, e.baseY + e.def.height * (e.elite ? 1.15f : 1) + 0.45f, e.pos.z), out var sp)) continue;
                float w = Mathf.Max(50, e.radius * 90);
                Box(new Rect(sp.x - w / 2 - 1, sp.y - 1, w + 2, 10), new Color(0, 0, 0, 0.6f));
                Box(new Rect(sp.x - w / 2, sp.y, w * hk, 5), EcoMath.Hex(0xff3a4a));
                Box(new Rect(sp.x - w / 2, sp.y + 6, w * pk, 2), EcoMath.Hex(0xffd34a));
            }
            foreach (var d in g.room.doors)
            {
                if (!WorldToGui(d.LabelPos, out var sp)) continue;
                Shadowed(new Rect(sp.x - 150, sp.y - 30, 300, 30), d.label1, label3d, d.color);
                Shadowed(new Rect(sp.x - 150, sp.y, 300, 24), d.label2, center, Text);
                Shadowed(new Rect(sp.x - 150, sp.y + 22, 300, 24), d.label3, small.Center(), Muted);
            }
            // Números de dano
            foreach (var n in g.fx.numbers)
            {
                if (!WorldToGui(n.pos + Vector3.up * (1.6f + n.t * 1.2f), out var sp)) continue;
                var c = n.color; c.a = 1 - Mathf.Max(0, n.t - 0.5f) / 0.3f;
                Shadowed(new Rect(sp.x - 80, sp.y - 16, 160, 32), n.text, n.crit ? numCrit : num, c);
            }

            // Efeitos de tela
            if (g.slowmo > 0) Box(new Rect(0, 0, W, H), new Color(0.2f, 0.4f, 0.6f, 0.12f));
            if (g.fx.hurt > 0) Vignette(new Color(0.7f, 0, 0.08f, g.fx.hurt * 0.6f));
            if (g.fx.flash > 0) { var fc = g.fx.flashColor; fc.a = g.fx.flash; Box(new Rect(0, 0, W, H), fc); }

            // Topo
            Shadowed(new Rect(0, 14, W, 22), g.roomName.ToUpperInvariant(), small.Center(), Muted);
            Shadowed(new Rect(0, 34, W, 30), g.objective, h2.Size(20), Text);
            // Mira
            Box(new Rect(W / 2 - 2, H / 2 - 2, 4, 4), Color.white);
            if (p.IsParrying) { Ring(new Vector2(W / 2, H / 2), 17, EcoMath.Hex(0xffd34a)); }
            // Vida
            float hpk = Mathf.Clamp01(p.hp / st.maxHp);
            Frame(new Rect(24, H - 96, 300, 22), new Color(0.1f, 0.05f, 0.07f, 0.8f), EcoMath.Hex(0x5a2a35));
            Box(new Rect(25, H - 95, 298 * hpk, 20), EcoMath.Hex(0xd8324e));
            Shadowed(new Rect(24, H - 95, 300, 20), $"{Mathf.CeilToInt(Mathf.Max(0, p.hp))} / {st.maxHp:0}", small.Center(), Text);
            // Esquivas
            for (int i = 0; i < p.MaxDash; i++)
            {
                var r = new Rect(24 + i * 42, H - 66, 36, 8);
                bool full = i < p.dashCharges;
                Box(r, full ? Cyan : EcoMath.Hex(0x1d2a33));
                if (!full && i == p.dashCharges) Box(new Rect(r.x, r.y, r.width * p.dashTimer / st.dashRecharge, r.height), new Color(0.36f, 0.88f, 1, 0.4f));
            }
            // Habilidades
            float ax = 24;
            if (st.abilityR != null)
            {
                var info = Skills.Abilities[st.abilityR];
                Slot(new Rect(ax, H - 48, 190, 28), "R", p.cdR > 0 ? $"{info.name} {p.cdR:0.0}s" : info.name, p.cdR / info.cooldown, Accent, false);
                ax += 198;
            }
            if (st.ultimate != null)
                Slot(new Rect(ax, H - 48, 190, 28), "V", $"{Skills.Abilities[st.ultimate].name} {Mathf.FloorToInt(p.res)}%", p.res / 100f, Gold, p.res >= 100);
            string furyText = st.fury && p.fury > 0 ? $"FÚRIA x{p.fury:0} (+{p.fury * 10:0}% dano)" : p.critNext ? "PRÓXIMO GOLPE CRÍTICO" : "";
            Shadowed(new Rect(24, H - 124, 400, 22), furyText, small, EcoMath.Hex(0xff9a2a));
            // Direita
            var right = new GUIStyle(body) { alignment = TextAnchor.UpperRight, fontStyle = FontStyle.Bold };
            Shadowed(new Rect(W - 424, H - 64, 400, 26), p.hasClass ? $"{p.cls.name} · {p.cls.path}" : "Aprendiz", right, Text);
            Shadowed(new Rect(W - 424, H - 38, 400, 24), "◈ " + (run.isHub ? g.save.ecos : run.ecos), new GUIStyle(right) { fontStyle = FontStyle.Normal }, EcoMath.Hex(0x8fe8ff));
            var counts = new Dictionary<string, int>();
            foreach (var b in run.boons) counts[b.name] = counts.TryGetValue(b.name, out var c) ? c + 1 : 1;
            float by = 18;
            foreach (var kv in counts) { Shadowed(new Rect(W - 318, by, 300, 18), kv.Key + (kv.Value > 1 ? " x" + kv.Value : ""), new GUIStyle(small) { alignment = TextAnchor.UpperRight }, EcoMath.Hex(0xc8c4e0)); by += 18; }
            // Chefe
            if (g.boss != null && !g.boss.dead)
            {
                float bw = Mathf.Min(600, W * 0.8f), bx = W / 2 - bw / 2;
                Shadowed(new Rect(bx, 70, bw, 24), g.bossName.ToUpperInvariant(), center.Bold(), Text);
                Frame(new Rect(bx, 96, bw, 14), EcoMath.Hex(0x200a10), EcoMath.Hex(0x6a2a35));
                Box(new Rect(bx + 1, 97, (bw - 2) * Mathf.Clamp01(g.boss.hp / g.boss.hpMax), 12), EcoMath.Hex(0xd8243e));
                Box(new Rect(bx, 113, bw * Mathf.Clamp01(g.boss.posture / g.boss.postureMax), 5), EcoMath.Hex(0xffd34a));
            }
            // Aviso grande e prompt
            if (g.fx.calloutTimer > 0)
            {
                var c = g.fx.calloutColor; c.a = Mathf.Clamp01(g.fx.calloutTimer / 0.25f);
                Shadowed(new Rect(0, H * 0.3f, W, 50), g.fx.calloutText, callout, c);
            }
            if (!string.IsNullOrEmpty(g.prompt))
            {
                var r = new Rect(W / 2 - 160, H * 0.58f, 320, 36);
                Frame(r, new Color(0, 0, 0, 0.75f), new Color(Gold.r, Gold.g, Gold.b, 0.4f));
                Label(new Rect(r.x, r.y + 8, r.width, 24), g.prompt, center.Bold(), Gold);
            }
        }

        static readonly Color Cyan = EcoMath.Hex(0x5ce1ff);

        void Slot(Rect r, string key, string text, float fill, Color barColor, bool ready)
        {
            Frame(r, new Color(0.07f, 0.06f, 0.11f, 0.85f), ready ? Gold : Border);
            Box(new Rect(r.x + 6, r.y + 5, 18, 18), Gold);
            Label(new Rect(r.x + 6, r.y + 5, 18, 18), key, new GUIStyle(small) { alignment = TextAnchor.MiddleCenter, fontStyle = FontStyle.Bold }, EcoMath.Hex(0x1a1408));
            Label(new Rect(r.x + 30, r.y + 5, r.width - 34, 20), text, small, Text);
            Box(new Rect(r.x + 1, r.yMax - 4, (r.width - 2) * Mathf.Clamp01(fill), 3), barColor);
        }

        void Ring(Vector2 c, float r, Color col)
        {
            for (int i = 0; i < 24; i++)
            {
                float a = i / 24f * Mathf.PI * 2;
                Box(new Rect(c.x + Mathf.Cos(a) * r - 1.5f, c.y + Mathf.Sin(a) * r - 1.5f, 3, 3), col);
            }
        }

        void Vignette(Color c)
        {
            float b = 90;
            for (int i = 0; i < 6; i++)
            {
                var cc = c; cc.a *= (6 - i) / 6f * 0.5f;
                float o = i * b / 6;
                Box(new Rect(0, o, W, b / 6), cc); Box(new Rect(0, H - o - b / 6, W, b / 6), cc);
                Box(new Rect(o, 0, b / 6, H), cc); Box(new Rect(W - o - b / 6, 0, b / 6, H), cc);
            }
        }

        // ---------- Diálogo ----------
        void DialogueBox()
        {
            var d = g.dialogue;
            if (!d.Active) return;
            float w = Mathf.Min(820, W - 32), x = W / 2 - w / 2;
            var choices = d.Choices;
            float h = 150 + (choices != null ? choices.Count * 40 : 0);
            var r = new Rect(x, H - h - 28, w, h);
            Frame(r, new Color(0.063f, 0.055f, 0.094f, 0.95f), EcoMath.Hex(0x4a4230));
            float y = r.y + 16;
            if (d.Speaker != null && !string.IsNullOrEmpty(d.Speaker.name))
            {
                ColorUtility.TryParseHtmlString(d.Speaker.color, out var sc);
                Label(new Rect(x + 22, y, w - 44, 20), d.Speaker.name.ToUpperInvariant(), nameStyle, sc);
            }
            y += 24;
            Label(new Rect(x + 22, y, w - 44, 80), d.IsNarration ? "<i>" + d.Shown + "</i>" : d.Shown, dlgText, d.IsNarration ? EcoMath.Hex(0xc9c4d8) : Text);
            y += 84;
            if (choices != null)
            {
                for (int i = 0; i < choices.Count; i++)
                    if (GUI.Button(new Rect(x + 22, y + i * 40, w - 44, 34), $"{i + 1}. {d.Fill(choices[i].t)}", new GUIStyle(btn) { alignment = TextAnchor.MiddleLeft })) d.Pick(i);
            }
            else
            {
                Label(new Rect(x + 22, r.yMax - 28, w - 44, 20), "Clique, Espaço ou E para continuar", new GUIStyle(small) { alignment = TextAnchor.UpperRight }, EcoMath.Hex(0x77728a));
                if (Event.current.type == EventType.MouseDown && r.Contains(Event.current.mousePosition)) { d.Advance(); Event.current.Use(); }
            }
        }

        // ---------- Escolha de bênção ----------
        void Choice()
        {
            Dim();
            GUI.Label(new Rect(0, 150, W, 40), g.choiceTitle, h2);
            int n = g.choiceItems.Count;
            float cw = 230, gap = 14, total = n * cw + (n - 1) * gap, x0 = W / 2 - total / 2;
            string[] rar = { "Comum", "Rara", "Épica" };
            Color[] rc = { Text, Cyan, EcoMath.Hex(0xff7af5) };
            for (int i = 0; i < n; i++)
            {
                var b = g.choiceItems[i];
                var r = new Rect(x0 + i * (cw + gap), 220, cw, 170);
                if (GUI.Button(r, "", card)) g.TakeBoon(i);
                Label(new Rect(r.x + 14, r.y + 12, cw - 28, 24), b.name, cardTitle, rc[b.rarity]);
                Label(new Rect(r.x + 14, r.y + 42, cw - 28, 90), b.desc, small, EcoMath.Hex(0xb7b4c8));
                Label(new Rect(r.x + 14, r.yMax - 26, cw - 28, 20), $"{rar[b.rarity]} · tecla {i + 1}", small, EcoMath.Hex(0x6f6c84));
            }
            GUI.Label(new Rect(0, 410, W, 24), "Clique ou tecle 1 · 2 · 3", center);
        }

        // ---------- Pausa e fim ----------
        void Pause()
        {
            Dim();
            GUI.Label(new Rect(0, 200, W, 40), "Pausado", h2);
            var run = g.run;
            string boons = run != null && run.boons.Count > 0 ? "Bênçãos: " + string.Join(", ", run.boons.ConvertAll(b => b.name)) : "Nenhuma bênção ainda.";
            Label(new Rect(W / 2 - 300, 250, 600, 50), boons, center, Muted);
            if (GUI.Button(new Rect(W / 2 - 160, 310, 150, 42), "Continuar", btnPrimary)) g.Resume();
            if (GUI.Button(new Rect(W / 2 + 10, 310, 150, 42), "Abandonar", btn)) g.EndRun(false);
            GUI.Label(new Rect(W / 2 - 160, 372, 120, 24), "Sensibilidade", muted);
            GameInput.Sensitivity = GUI.HorizontalSlider(new Rect(W / 2 - 30, 378, 190, 20), GameInput.Sensitivity, 0.3f, 3f);
            GUI.Label(new Rect(W / 2 - 160, 402, 120, 24), "Volume", muted);
            Sfx.Volume = GUI.HorizontalSlider(new Rect(W / 2 - 30, 408, 190, 20), Sfx.Volume, 0f, 1f);
        }

        void End()
        {
            Dim(0.92f);
            Label(new Rect(0, 150, W, 40), g.endWin ? "Vitória! O Abismo silencia." : "Você caiu", h2, g.endWin ? EcoMath.Hex(0xffd34a) : EcoMath.Hex(0xff5a6e));
            float y = 210;
            foreach (var kv in g.endStats) { GUI.Label(new Rect(0, y, W, 26), $"<color=#9a98aa>{kv.Key}:</color> <b>{kv.Value}</b>", center); y += 28; }
            if (GUI.Button(new Rect(W / 2 - 190, y + 20, 200, 42), "Voltar ao Mosteiro", btnPrimary)) g.EnterHub(g.save.story.last);
            if (GUI.Button(new Rect(W / 2 + 20, y + 20, 170, 42), "Menu principal", btn)) g.QuitToMenu();
        }

        // ---------- Telas sobrepostas (árvore, santuário, ajuda) ----------
        void Overlay()
        {
            Dim(0.93f);
            switch (g.overlay)
            {
                case "skills": SkillsScreen(); break;
                case "meta": MetaScreen(); break;
                case "help": HelpScreen(); break;
            }
        }

        void BackButton(float y)
        {
            if (GUI.Button(new Rect(W / 2 - 60, y, 120, 40), "Voltar", btnPrimary)) { resetArmed = false; g.CloseOverlay(); }
        }

        void SkillsScreen()
        {
            var save = g.save;
            GUI.Label(new Rect(0, 24, W, 40), "Árvore de Habilidades", h2);
            GUI.Label(new Rect(0, 64, W, 24), "Cada caminho tem a sua árvore. Compre os nós de cima para baixo com Ecos.", center.Muted());
            float tx = W / 2 - 170;
            foreach (var kv in Skills.Trees)
            {
                bool sel = kv.Key == skillsTab;
                string label = kv.Value.name + (save.story.classe == kv.Key ? " (atual)" : "");
                if (GUI.Button(new Rect(tx, 96, 165, 36), label, sel ? btnPrimary : btn)) { skillsTab = kv.Key; resetArmed = false; }
                tx += 175;
            }
            GUI.Label(new Rect(0, 140, W, 24), $"Você tem ◈ {save.ecos} Ecos", center.Muted());
            var tree = Skills.Trees[skillsTab];
            float colW = 260, gap = 18, x0 = W / 2 - (colW * 3 + gap * 2) / 2;
            string[] labels = { "Aprendida", "Clique para aprender", "Ecos insuficientes", "Aprenda a anterior" };
            for (int b = 0; b < tree.branches.Length; b++)
            {
                var br = tree.branches[b];
                float x = x0 + b * (colW + gap), y = 172;
                Label(new Rect(x, y, colW, 22), br.name.ToUpperInvariant(), cardTitle, Gold);
                Label(new Rect(x, y + 22, colW, 20), br.desc, small, Muted);
                y += 48;
                foreach (var n in br.nodes)
                {
                    var stt = Skills.Status(save, skillsTab, n.id);
                    int lvl = save.Skill(skillsTab, n.id), max = n.cost.Length;
                    var r = new Rect(x, y, colW, 100);
                    var border = stt == NodeStatus.Max ? Gold : stt == NodeStatus.Disponivel ? Accent : Border;
                    var old = GUI.color;
                    if (stt == NodeStatus.Bloqueado) GUI.color = new Color(1, 1, 1, 0.45f);
                    Frame(r, EcoMath.Hex(0x15141f), border);
                    if (GUI.Button(r, "", GUIStyle.none) && Skills.Buy(save, skillsTab, n.id)) { save.Write(); Sfx.Play("pickup"); }
                    float ty = r.y + 8;
                    if (n.tag != null) { Box(new Rect(r.x + 12, ty, n.tag == "passiva" ? 58 : 26, 16), Gold); Label(new Rect(r.x + 12, ty, n.tag == "passiva" ? 58 : 26, 16), n.tag == "passiva" ? "PASSIVA" : $"[{n.tag}]", new GUIStyle(small) { fontSize = 11, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleCenter }, EcoMath.Hex(0x1a1408)); ty += 18; }
                    Label(new Rect(r.x + 12, ty, colW - 24, 20), n.name, cardTitle.Size(14), Text);
                    string dots = ""; for (int i = 0; i < max; i++) dots += i < lvl ? "●" : "○";
                    Label(new Rect(r.x + 12, ty, colW - 24, 20), dots, new GUIStyle(small) { alignment = TextAnchor.UpperRight }, Text);
                    Label(new Rect(r.x + 12, ty + 20, colW - 24, 40), n.desc, small.Size(12), EcoMath.Hex(0xb7b4c8));
                    Label(new Rect(r.x + 12, r.yMax - 20, colW - 24, 18), (lvl < max ? $"◈ {n.cost[lvl]} · " : "") + labels[(int)stt], small.Size(11), EcoMath.Hex(0x77728a));
                    GUI.color = old;
                    y += 110;
                }
            }
            if (GUI.Button(new Rect(W / 2 - 250, H - 56, 250, 40), resetArmed ? "Confirmar: devolver os Ecos" : "Redistribuir pontos", btn))
            {
                if (!resetArmed) resetArmed = true;
                else { resetArmed = false; Skills.Reset(save, skillsTab); save.Write(); }
            }
            if (GUI.Button(new Rect(W / 2 + 10, H - 56, 120, 40), "Voltar", btnPrimary)) { resetArmed = false; g.CloseOverlay(); }
        }

        void MetaScreen()
        {
            var save = g.save;
            GUI.Label(new Rect(0, 90, W, 40), "Santuário dos Ecos", h2);
            GUI.Label(new Rect(0, 132, W, 24), "Ecos guardados entre expedições. Gaste para ficar mais forte.", center.Muted());
            var ups = MetaUpgrades.All;
            float cw = 230, gap = 14, x0 = W / 2 - (3 * cw + 2 * gap) / 2;
            for (int i = 0; i < ups.Length; i++)
            {
                var u = ups[i];
                int lvl = save.Meta(u.id); bool maxed = lvl >= u.max; int cost = u.cost(lvl);
                var r = new Rect(x0 + (i % 3) * (cw + gap), 180 + (i / 3) * 160, cw, 146);
                if (GUI.Button(r, "", card) && !maxed && save.ecos >= cost) { save.ecos -= cost; save.SetMeta(u.id, lvl + 1); save.Write(); Sfx.Play("pickup"); }
                string dots = ""; for (int k = 0; k < u.max; k++) dots += k < lvl ? "●" : "○";
                Label(new Rect(r.x + 14, r.y + 12, cw - 28, 24), $"{u.name} {dots}", cardTitle, maxed ? Gold : Text);
                Label(new Rect(r.x + 14, r.y + 42, cw - 28, 60), u.desc, small, EcoMath.Hex(0xb7b4c8));
                Label(new Rect(r.x + 14, r.yMax - 26, cw - 28, 20), maxed ? "Máximo" : $"Custo ◈ {cost}" + (save.ecos < cost ? " (insuficiente)" : ""), small, EcoMath.Hex(0x6f6c84));
            }
            GUI.Label(new Rect(0, 516, W, 24), $"Você tem ◈ {save.ecos}", center.Muted());
            BackButton(556);
        }

        void HelpScreen()
        {
            GUI.Label(new Rect(0, 40, W, 40), "Como jogar", h2);
            float w = Mathf.Min(720, W - 40), x = W / 2 - w / 2;
            string text =
                "<b>WASD</b> mover · <b>Mouse</b> olhar · <b>Botão esq.</b> atacar/lançar (ritmo de 3)\n" +
                "<b>Botão dir.</b> ou <b>F</b> aparar · <b>Shift</b> esquiva · <b>Espaço</b> pular · <b>E</b> falar\n" +
                "<b>R</b> habilidade do caminho · <b>V</b> golpe supremo · <b>Esc</b> pausar\n\n" +
                "<b>Caminhos</b>\n" +
                "• Mão Aberta (Mago): primeira pessoa, dardos arcanos, selo que apara e reflete.\n" +
                "• Punho Fechado (Punhos): terceira pessoa, combos de soco com mira no inimigo próximo.\n" +
                "• Cada caminho tem uma árvore de habilidades com 3 ramos. O golpe supremo [V] carrega com aparos e esquivas perfeitas.\n\n" +
                "<b>Leia os ataques</b>\n" +
                "• <color=#ff4a4a>Brilho vermelho</color> = aparável. <color=#ff9a2a>Brilho laranja</color> = só esquive.\n" +
                "• <color=#5ce1ff>Anel no chão</color> = onda de choque: pule ou esquive.\n" +
                "• Esquivar no último instante ativa a Esquiva Perfeita: câmera lenta e próximo golpe crítico.\n" +
                "• Postura cheia (barra amarela) = inimigo quebrado, recebe dano triplo.\n\n" +
                "<b>Salas</b>: Combate, Elite, Sobrevivência, Duelo (só aparos ferem), Chuva de Flechas (reflita), Santuário e Chefe.";
            GUI.Label(new Rect(x, 96, w, 520), text, body);
            BackButton(H - 70);
        }
    }

    static class StyleExt
    {
        public static GUIStyle Center(this GUIStyle s) => new GUIStyle(s) { alignment = TextAnchor.UpperCenter };
        public static GUIStyle Bold(this GUIStyle s) => new GUIStyle(s) { fontStyle = FontStyle.Bold };
        public static GUIStyle Size(this GUIStyle s, int size) => new GUIStyle(s) { fontSize = size };
        public static GUIStyle Muted(this GUIStyle s) { var n = new GUIStyle(s); n.normal.textColor = EcoMath.Hex(0x9a98aa); return n; }
    }
}
