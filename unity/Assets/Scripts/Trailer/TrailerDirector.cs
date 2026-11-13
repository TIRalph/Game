using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

namespace Eco
{
    /*
     * DIRETOR DO TRAILER (roda dentro do jogo Unity)
     * Joga cenas roteirizadas do próprio jogo: um bot apara e esquiva de verdade, a câmera de cinema
     * é sobreposta e as cartelas são desenhadas por cima. Também salva screenshots, artes limpas
     * (sem HUD), a capa 630x500 e o banner 1920x480 em <projeto>/Trailer/.
     *
     * Como usar: menu "Eco da Lâmina > Gravar trailer" no editor (grava o MP4 com o Unity Recorder),
     * ou "Eco da Lâmina > Só screenshots". Num build, rode com o argumento -trailer.
     */
    [DefaultExecutionOrder(-100)] // antes do GameManager: injeta a entrada do bot
    public class TrailerDirector : MonoBehaviour
    {
        public static bool Running, Finished;
        public static string OutputFolder => Path.Combine(Path.GetDirectoryName(Application.dataPath) ?? ".", "Trailer");
        const int Fps = 30;

        class Shot
        {
            public string id;
            public float secs;
            public Action setup;
            public Action<int, int> frame;   // antes do jogo andar (entrada do bot)
            public Action<int, int> late;    // depois do jogo andar (câmera)
            public Action<int, int> gui;     // cartelas
            public int[] stills = new int[0]; // quadros que viram screenshot
        }

        GameManager g;
        List<Shot> shots;
        int shotIdx = -1, f, n;
        Shot cur;
        Texture2D logo, white;
        AudioSource music;
        GUIStyle lore, capK, capS, endTag, endCta;

        // ---------------------------------------------------------------- início
        public static void Launch(GameManager game)
        {
            if (game.GetComponent<TrailerDirector>() != null) return;
            game.gameObject.AddComponent<TrailerDirector>();
        }

        void Start()
        {
            g = GetComponent<GameManager>();
            Running = true; Finished = false;
            Directory.CreateDirectory(OutputFolder);
            Time.captureFramerate = Fps; // passo de tempo fixo: as cenas saem sempre iguais
            GameInput.Simulating = true;
            logo = Resources.Load<Texture2D>("Trailer/logo");
            white = new Texture2D(1, 1); white.SetPixel(0, 0, Color.white); white.Apply();
            var clip = Resources.Load<AudioClip>("Trailer/trailer_musica");
            if (clip != null)
            {
                music = gameObject.AddComponent<AudioSource>();
                music.clip = clip; music.volume = 0.9f; music.spatialBlend = 0;
                music.Play();
            }
            shots = BuildShots();
            NextShot();
        }

        void OnDestroy()
        {
            Running = false;
            GameInput.Simulating = false;
            GameInput.SimHeld.Clear(); GameInput.SimDown.Clear();
            GameUI.HideHud = GameUI.HideAll = false;
            Time.captureFramerate = 0;
        }

        void NextShot()
        {
            shotIdx++;
            if (shotIdx >= shots.Count)
            {
                Finished = true; Running = false;
                Debug.Log("[trailer] pronto em " + OutputFolder);
                enabled = false;
                return;
            }
            cur = shots[shotIdx];
            n = Mathf.RoundToInt(cur.secs * Fps);
            f = 0;
            GameUI.HideHud = GameUI.HideAll = false;
            GameInput.SimHeld.Clear(); GameInput.SimDown.Clear();
            cur.setup();
        }

        void Update()
        {
            if (cur == null || Finished) return;
            GameInput.SimHeld.Clear();
            cur.frame?.Invoke(f, n);
        }

        void LateUpdate()
        {
            if (cur == null || Finished) return;
            cur.late?.Invoke(f, n);
            if (Array.IndexOf(cur.stills, f) >= 0) StartCoroutine(Stills(cur.id, f));
            f++;
            if (f >= n) NextShot();
        }

        // ---------------------------------------------------------------- utilidades das cenas
        static float Fade(int f, int n, int fin = 6, int fout = 6) => Mathf.Clamp01(Mathf.Min(f / (float)fin, (n - 1 - f) / (float)fout));
        static float Ease(float k) => k * k * (3 - 2 * k);
        void Press(string k) => GameInput.SimDown.Add(k);
        void Cam(Vector3 pos, Vector3 look) { g.cam.transform.position = pos; g.cam.transform.LookAt(look); }

        void SetSave(string classe, bool allSkills)
        {
            var s = g.save;
            s.story.prologo = true;
            s.story.classe = classe;
            s.ClearSkills(classe);
            if (allSkills)
                foreach (var b in Skills.Trees[classe].branches)
                    foreach (var node in b.nodes) s.SetSkill(classe, node.id, node.cost.Length);
        }

        void Clean()
        {
            if (g.dialogue.Active) g.dialogue.Finish();
            g.keepRoomOpen = true;
            g.fx.calloutTimer = 0;
        }

        // Inicia uma sala de run já preparada
        void Room(string classe, int floor, string type, bool allSkills, params SpawnSpec[] wave)
        {
            Clean();
            SetSave(classe, allSkills);
            g.StartRun();
            g.run.floor = floor;
            g.EnterRoom(type);
            g.rs.preDialogue = null;
            g.run.stats.maxHp = 1e6f; g.player.hp = 1e6f;
            if (wave.Length > 0) { g.rs.waves = new List<List<SpawnSpec>> { new List<SpawnSpec>(wave) }; g.rs.started = 0; g.SpawnWave(g.rs.waves[0]); }
        }

        // Posiciona os inimigos à frente do jogador (+Z)
        void Arrange(Func<int, Vector3> offset, float cooldown = -1)
        {
            var p = g.player.pos;
            for (int i = 0; i < g.enemies.Count; i++)
            {
                var e = g.enemies[i];
                if (e.stationary) continue;
                e.pos = p + offset(i);
                if (cooldown >= 0) e.cooldown = cooldown + i * 0.4f;
            }
        }

        // Piloto automático: apara/esquiva no tempo certo e ataca o alvo mais próximo
        void Bot(bool attack = true, float range = 2.3f, int attackEvery = 8, float turn = 0.25f, bool towers = false)
        {
            var p = g.player;
            foreach (var e in g.enemies)
            {
                if (e.dead || !e.InWindup || e.atk == null) continue;
                float remain = e.WindupRemaining;
                float d = EcoMath.FlatDist(e.pos, p.pos);
                bool melee = e.atk.kind == AtkKind.Melee || e.atk.kind == AtkKind.Slam || e.atk.kind == AtkKind.Lunge;
                if (remain < 0.06f && remain > 0 && melee && d < 7) Press(e.Unparryable ? "Shift" : "F");
            }
            foreach (var pr in g.projectiles)
            {
                if (pr.reflected || pr.dead) continue;
                if (Vector3.Distance(pr.pos, p.Eye - Vector3.up * 0.5f) < 2f) Press(pr.unparryable ? "Shift" : "F");
            }
            foreach (var w in g.waves)
            {
                float d = EcoMath.FlatDist(p.pos, w.Center);
                if (Mathf.Abs(d - w.r) < 1.6f && d > w.r && p.grounded) Press("Space");
            }
            if (!attack) return;
            Enemy target = null; float bd = 1e9f;
            foreach (var e in g.enemies)
            {
                if (e.dead) continue;
                float d = Vector3.Distance(e.pos, p.pos) + (e.stationary && !towers ? 40 : 0);
                if (d < bd) { bd = d; target = e; }
            }
            if (target == null) return;
            float dist = EcoMath.FlatDist(target.pos, p.pos);
            p.yaw += EcoMath.WrapAngle(EcoMath.YawOf(target.pos - p.pos) - p.yaw) * turn;
            var eye = p.thirdPerson ? g.cam.transform.position : p.Eye;
            float wantPitch = target.stationary || !p.thirdPerson
                ? Mathf.Atan2(target.Center.y - eye.y, dist + (p.thirdPerson ? 4 : 0))
                : -0.12f;
            p.pitch += (wantPitch - p.pitch) * 0.25f;
            float want = p.cls.bolt ? range : 2.3f;
            if (dist > want && !target.stationary) GameInput.SimHeld.Add("W");
            if ((dist <= want + 1 || target.stationary || p.cls.bolt) && f % attackEvery == 0) Press("Mouse0");
        }

        // ---------------------------------------------------------------- roteiro
        List<Shot> BuildShots() => new List<Shot>
        {
            new Shot
            {
                id = "sino", secs = 5f, stills = new[] { 110 },
                setup = () => { Clean(); SetSave("punhos", false); g.EnterHub(); g.player.pos = new Vector3(9, 0, -9); GameUI.HideHud = true; },
                late = (f, n) =>
                {
                    float k = Ease(f / (n - 1f));
                    Cam(new Vector3(Mathf.Sin(k * 0.6f - 0.3f) * 5.5f, 2.4f - k * 0.5f, 4 - 6.5f + k * 2.4f), new Vector3(0, 1.9f, 4));
                },
                gui = (f, n) => { Bars(); Lore("O Sino do Eco guardava a memória do mundo.", Mathf.Clamp01((f - 12) / 15f) * Fade(f, n, 1, 10)); Black(1 - Mathf.Clamp01(f / 20f)); },
            },
            new Shot
            {
                id = "arauto", secs = 4.6f, stills = new[] { 100 },
                setup = () =>
                {
                    Room("punhos", 1, "chefe", false, new SpawnSpec("arauto", boss: true));
                    g.player.pos = new Vector3(0, 0, -18);
                    g.boss.pos = new Vector3(0, 0, 6); g.boss.cooldown = 99;
                    GameUI.HideHud = true;
                },
                frame = (f, n) => { g.boss.cooldown = f > n * 0.55f ? 0 : 99; },
                late = (f, n) =>
                {
                    var b = g.boss; float k = f / (n - 1f);
                    Cam(new Vector3(b.pos.x + 1.6f - k * 1.2f, 0.5f + k * 0.4f, b.pos.z - 5.2f + k * 1.5f), new Vector3(b.pos.x, 2.6f, b.pos.z));
                },
                gui = (f, n) => { Bars(); Lore("Até que o Arauto o partiu em três.", Mathf.Clamp01(f / 10f) * Fade(f, n, 1, 8)); },
            },
            new Shot
            {
                id = "mestre", secs = 4.8f, stills = new[] { 120 },
                setup = () => { Clean(); SetSave("punhos", false); g.EnterHub(); g.StartDialogue("prologo"); g.dialogue.JumpTo(7); GameUI.HideHud = true; },
                late = (f, n) =>
                {
                    var p = g.player; var m = g.master;
                    var dir = EcoMath.Flat(m.pos - p.pos).normalized;
                    var right = new Vector3(dir.z, 0, -dir.x);
                    float k = f / (n - 1f);
                    Cam(p.pos + dir * (-1.4f + k * 0.4f) + right * 0.75f + Vector3.up * 1.85f, m.pos + Vector3.up * 1.45f);
                },
            },
            new Shot
            {
                id = "aparo", secs = 6.2f, stills = new[] { 115 },
                setup = () =>
                {
                    Room("punhos", 0, "combate", false, new SpawnSpec("carcereiro"), new SpawnSpec("carcereiro"), new SpawnSpec("carcereiro"));
                    Arrange(i => new Vector3((i - 1) * 2.4f, 0, 4.2f + i * 0.6f), 0.3f);
                },
                frame = (f, n) => Bot(attackEvery: 9),
                gui = (f, n) => Caption("APARE", "no instante do golpe", EcoMath.Hex(0xff3a3a), Mathf.Clamp01(f / 6f) * Mathf.Clamp01((70 - f) / 10f)),
            },
            new Shot
            {
                id = "esquiva", secs = 5f, stills = new[] { 30 },
                setup = () =>
                {
                    Room("punhos", 0, "duelo", false, new SpawnSpec("duelista"), new SpawnSpec("duelista"));
                    Arrange(i => new Vector3(i == 0 ? -1 : 3, 0, 7 + i * 2), 99);
                },
                frame = (f, n) =>
                {
                    var ds = g.enemies.FindAll(e => !e.dead);
                    if (f == 6 && ds.Count > 0) ds[0].StartAttack(ds[0].def.attacks[1]); // investida laranja: esquiva perfeita
                    if (f == 70 && ds.Count > 1) ds[1].cooldown = 0;
                    if (f > 70) foreach (var e in ds) if (e.cooldown > 1) e.cooldown = 0.5f;
                    Bot();
                },
                gui = (f, n) => Caption("ESQUIVE", "no último instante", EcoMath.Hex(0x5ce1ff), Mathf.Clamp01(f / 6f) * Mathf.Clamp01((64 - f) / 10f)),
            },
            new Shot
            {
                id = "mago", secs = 6.4f, stills = new[] { 72, 152 },
                setup = () =>
                {
                    Room("mago", 2, "combate", true, new SpawnSpec("carcereiro"), new SpawnSpec("carcereiro"), new SpawnSpec("atirador"), new SpawnSpec("duelista"), new SpawnSpec("carcereiro"));
                    Arrange(i => new Vector3(-5 + i * 2.6f, 0, 9 + (i % 2) * 2), 1);
                },
                frame = (f, n) => { if (f == 70 || f == 150) Press("R"); Bot(range: 9, attackEvery: 7, turn: 0.18f); },
                gui = (f, n) => Caption("MÃO ABERTA", "o caminho do mago", EcoMath.Hex(0x9a7dff), Mathf.Clamp01(f / 6f) * Mathf.Clamp01((66 - f) / 10f)),
            },
            new Shot
            {
                id = "tempestade", secs = 4f, stills = new[] { 40 },
                setup = () =>
                {
                    Room("mago", 2, "elite", true, new SpawnSpec("carcereiro"), new SpawnSpec("bruto", true), new SpawnSpec("carcereiro"), new SpawnSpec("duelista"), new SpawnSpec("carcereiro"));
                    Arrange(i => { float a = i / 5f * Mathf.PI - Mathf.PI; return new Vector3(Mathf.Cos(a) * 6, 0, 7 - Mathf.Sin(a) * 2); });
                    g.player.res = 100;
                },
                frame = (f, n) => { if (f == 8) Press("V"); Bot(range: 9, attackEvery: 6, turn: 0.15f); },
                gui = (f, n) => Caption("TEMPESTADE DE ECOS", "golpe supremo", EcoMath.Hex(0xbfa8ff), Mathf.Clamp01((f - 10) / 6f) * Mathf.Clamp01((80 - f) / 10f)),
            },
            new Shot
            {
                id = "punhos", secs = 6f, stills = new[] { 55 },
                setup = () =>
                {
                    Room("punhos", 1, "elite", true, new SpawnSpec("carcereiro"), new SpawnSpec("carcereiro"), new SpawnSpec("bruto"), new SpawnSpec("carcereiro"));
                    Arrange(i => new Vector3(-3 + i * 2, 0, 9 + (i % 2)), 2);
                },
                frame = (f, n) =>
                {
                    if (f == 4) Press("R");
                    if (f == 40) { g.player.res = 100; Press("V"); }
                    Bot(attackEvery: 7);
                },
                gui = (f, n) => Caption("PUNHO FECHADO", "o caminho dos punhos", EcoMath.Hex(0xffb27a), Mathf.Clamp01(f / 6f) * Mathf.Clamp01((66 - f) / 10f)),
            },
            new Shot
            {
                id = "flechas", secs = 4.2f, stills = new[] { 80 },
                setup = () =>
                {
                    Room("punhos", 1, "flechas", false, new SpawnSpec[0]);
                    g.rs.waves = new List<List<SpawnSpec>> { new List<SpawnSpec>() }; g.rs.started = 0;
                    foreach (var e in g.enemies) e.cooldown = UnityEngine.Random.value * 0.6f;
                    g.player.pos = new Vector3(0, 0, -4);
                },
                frame = (f, n) => Bot(towers: true, turn: 0.12f),
                gui = (f, n) => Caption("REFLITA", "devolva as flechas", EcoMath.Hex(0x5ce1ff), Mathf.Clamp01(f / 6f) * Mathf.Clamp01((60 - f) / 10f)),
            },
            new Shot
            {
                id = "chefe", secs = 7f, stills = new[] { 100 },
                setup = () =>
                {
                    Room("punhos", 2, "chefe", true, new SpawnSpec("arauto", boss: true));
                    g.boss.hp = g.boss.hpMax * 0.45f;
                    g.player.pos = new Vector3(0, 0, -4);
                    g.boss.pos = new Vector3(0, 0, 2);
                },
                frame = (f, n) => Bot(attackEvery: 8),
                gui = (f, n) => Caption("DERROTE O ARAUTO", "três andares · três fragmentos", EcoMath.Hex(0xff3030), Mathf.Clamp01(f / 6f) * Mathf.Clamp01((72 - f) / 10f)),
            },
            new Shot
            {
                id = "arvore", secs = 3.2f, stills = new[] { 60 },
                setup = () =>
                {
                    Clean(); g.QuitToMenu();
                    var s = g.save;
                    s.story.classe = "mago"; s.ecos = 145;
                    s.ClearSkills("mago");
                    s.SetSkill("mago", "m_afiado", 3); s.SetSkill("mago", "m_perfura", 1); s.SetSkill("mago", "m_amplo", 2); s.SetSkill("mago", "m_espelho", 1); s.SetSkill("mago", "m_longo", 1);
                    g.OpenOverlay("skills", null);
                },
                gui = (f, n) => Caption("EVOLUA", "duas árvores de habilidade", EcoMath.Hex(0xe8c27a), Mathf.Clamp01(f / 6f) * Fade(f, n, 1, 8)),
            },
            new Shot
            {
                id = "fim", secs = 6.5f, stills = new[] { 120 },
                setup = () => { Clean(); g.overlay = null; g.QuitToMenu(); GameUI.HideAll = true; },
                gui = (f, n) => { EndCard(Mathf.Clamp01(f / 18f)); Black(Mathf.Clamp01((f - (n - 20)) / 20f)); },
            },
        };

        // ---------------------------------------------------------------- cartelas (IMGUI)
        float S => Screen.height / 1080f;

        void Styles()
        {
            if (lore != null) return;
            lore = new GUIStyle(GUI.skin.label) { alignment = TextAnchor.MiddleCenter, fontStyle = FontStyle.Italic, wordWrap = true };
            capK = new GUIStyle(GUI.skin.label) { fontStyle = FontStyle.Bold, alignment = TextAnchor.LowerLeft };
            capS = new GUIStyle(GUI.skin.label) { fontStyle = FontStyle.Bold, alignment = TextAnchor.UpperLeft };
            endTag = new GUIStyle(GUI.skin.label) { fontStyle = FontStyle.Bold, alignment = TextAnchor.UpperLeft };
            endCta = new GUIStyle(GUI.skin.label) { fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleCenter };
        }

        void Rect(Rect r, Color c) { var o = GUI.color; GUI.color = c; GUI.DrawTexture(r, white); GUI.color = o; }

        void Text(Rect r, string t, GUIStyle st, int size, Color c)
        {
            st.fontSize = Mathf.RoundToInt(size * S);
            var o = st.normal.textColor;
            st.normal.textColor = new Color(0, 0, 0, c.a * 0.8f);
            GUI.Label(new Rect(r.x + 3 * S, r.y + 4 * S, r.width, r.height), t, st);
            st.normal.textColor = c;
            GUI.Label(r, t, st);
            st.normal.textColor = o;
        }

        void Bars() { float h = Screen.height * 0.115f; Rect(new Rect(0, 0, Screen.width, h), Color.black); Rect(new Rect(0, Screen.height - h, Screen.width, h), Color.black); }
        void Black(float a) { if (a > 0) Rect(new Rect(0, 0, Screen.width, Screen.height), new Color(0, 0, 0, a)); }

        void Lore(string t, float a)
        {
            if (a <= 0) return;
            Text(new Rect(Screen.width * 0.1f, Screen.height * 0.66f, Screen.width * 0.8f, 120 * S), t, lore, 56, new Color(1, 1, 1, a));
        }

        void Caption(string k, string sub, Color c, float a)
        {
            if (a <= 0) return;
            float x = Screen.width * 0.06f, y = Screen.height * 0.84f;
            Rect(new Rect(x, y - 150 * S, 110 * S, 7 * S), new Color(c.r, c.g, c.b, a));
            Text(new Rect(x, y - 140 * S, Screen.width, 110 * S), k, capK, 100, new Color(1, 1, 1, a));
            Text(new Rect(x + 4 * S, y - 22 * S, Screen.width, 40 * S), sub.ToUpperInvariant(), capS, 28, new Color(1, 1, 1, a * 0.9f));
        }

        void EndCard(float a)
        {
            float x = Screen.width * 0.08f, y = Screen.height * 0.36f;
            if (logo != null)
            {
                float w = Screen.width * 0.52f, h = w * logo.height / logo.width;
                var o = GUI.color; GUI.color = new Color(1, 1, 1, a);
                GUI.DrawTexture(new Rect(x, y, w, h), logo);
                GUI.color = o;
                y += h + 10 * S;
            }
            Text(new Rect(x + 6 * S, y, Screen.width, 50 * S), "APARE.  ESQUIVE.  LEMBRE.", endTag, 34, new Color(0.81f, 0.78f, 1f, a));
            var cta = new Rect(x + 6 * S, y + 80 * S, 520 * S, 64 * S);
            var gold = EcoMath.Hex(0xe8c27a); gold.a = a;
            Rect(new Rect(cta.x, cta.y, cta.width, 3 * S), gold); Rect(new Rect(cta.x, cta.yMax - 3 * S, cta.width, 3 * S), gold);
            Rect(new Rect(cta.x, cta.y, 3 * S, cta.height), gold); Rect(new Rect(cta.xMax - 3 * S, cta.y, 3 * S, cta.height), gold);
            Text(cta, "JOGUE GRÁTIS NO ITCH.IO", endCta, 28, gold);
        }

        void OnGUI()
        {
            if (cur == null || Finished) return;
            Styles();
            GUI.depth = -100; // por cima da interface do jogo
            cur.gui?.Invoke(Mathf.Max(0, f - 1), n);
        }

        // ---------------------------------------------------------------- imagens
        IEnumerator Stills(string id, int frame)
        {
            yield return new WaitForEndOfFrame();
            // 1) Screenshot com a interface do jogo
            var shot = ScreenCapture.CaptureScreenshotAsTexture();
            Save(shot, $"screenshot-{id}-{frame:000}.png");
            // 2) Arte limpa: só a câmera, sem HUD nem cartelas
            var art = RenderCamera(1920, 1080);
            Save(art, $"arte-{id}-{frame:000}.png");
            if (id == "chefe") Save(Cover(art), "capa-630x500.png");
            if (id == "punhos") Save(Banner(art), "banner-1920x480.png");
            Destroy(shot); Destroy(art);
        }

        void Save(Texture2D t, string name) => File.WriteAllBytes(Path.Combine(OutputFolder, name), t.EncodeToPNG());

        Texture2D RenderCamera(int w, int h)
        {
            var rt = RenderTexture.GetTemporary(w, h, 24);
            var old = g.cam.targetTexture;
            g.cam.targetTexture = rt;
            g.cam.Render();
            g.cam.targetTexture = old;
            var prev = RenderTexture.active;
            RenderTexture.active = rt;
            var tex = new Texture2D(w, h, TextureFormat.RGB24, false);
            tex.ReadPixels(new Rect(0, 0, w, h), 0, 0);
            tex.Apply();
            RenderTexture.active = prev;
            RenderTexture.ReleaseTemporary(rt);
            return tex;
        }

        static Texture2D Scale(Texture2D src, Rect crop, int w, int h)
        {
            var rt = RenderTexture.GetTemporary(w, h, 0);
            Graphics.Blit(src, rt, new Vector2(crop.width / src.width, crop.height / src.height), new Vector2(crop.x / src.width, crop.y / src.height));
            var prev = RenderTexture.active;
            RenderTexture.active = rt;
            var tex = new Texture2D(w, h, TextureFormat.RGBA32, false);
            tex.ReadPixels(new Rect(0, 0, w, h), 0, 0);
            tex.Apply();
            RenderTexture.active = prev;
            RenderTexture.ReleaseTemporary(rt);
            return tex;
        }

        // Escurece de baixo para cima e cola o logo (canto inferior esquerdo)
        Texture2D Cover(Texture2D art)
        {
            float cw = art.height * 630f / 500f;
            var tex = Scale(art, new Rect((art.width - cw) / 2, 0, cw, art.height), 630, 500);
            var px = tex.GetPixels();
            for (int y = 0; y < 500; y++)
            {
                float a = Mathf.Clamp01((250 - y) / 250f) * 0.82f; // y = 0 é a base da imagem
                for (int x = 0; x < 630; x++) px[y * 630 + x] = Color.Lerp(px[y * 630 + x], new Color(0.024f, 0.02f, 0.047f), a);
            }
            tex.SetPixels(px);
            Stamp(tex, 30, 26, 420);
            tex.Apply();
            return tex;
        }

        // Arte à direita fundindo num fundo escuro; logo à esquerda
        Texture2D Banner(Texture2D art)
        {
            int aw = art.width * 480 / art.height;
            var pic = Scale(art, new Rect(0, 0, art.width, art.height), aw, 480);
            var tex = new Texture2D(1920, 480, TextureFormat.RGBA32, false);
            var bg = new Color(0.04f, 0.027f, 0.055f);
            var px = new Color[1920 * 480];
            var pp = pic.GetPixels();
            int x0 = 1920 - aw, fade = (int)(aw * 0.45f);
            for (int y = 0; y < 480; y++)
                for (int x = 0; x < 1920; x++)
                {
                    int ax = x - x0;
                    px[y * 1920 + x] = ax < 0 ? bg : Color.Lerp(bg, pp[y * aw + ax], Mathf.Pow(Mathf.Clamp01(ax / (float)fade), 1.4f));
                }
            tex.SetPixels(px);
            Stamp(tex, 90, 170, 880);
            tex.Apply();
            Destroy(pic);
            return tex;
        }

        // Cola o logo (PNG com transparência) em (x, y) a partir da base, com largura w
        void Stamp(Texture2D dst, int x, int y, int w)
        {
            if (logo == null) return;
            int h = w * logo.height / logo.width;
            var small = Scale(logo, new Rect(0, 0, logo.width, logo.height), w, h);
            var sp = small.GetPixels();
            for (int j = 0; j < h; j++)
                for (int i = 0; i < w; i++)
                {
                    int dx = x + i, dy = y + j;
                    if (dx < 0 || dy < 0 || dx >= dst.width || dy >= dst.height) continue;
                    var s = sp[j * w + i];
                    if (s.a <= 0) continue;
                    dst.SetPixel(dx, dy, Color.Lerp(dst.GetPixel(dx, dy), new Color(s.r, s.g, s.b, 1), s.a));
                }
            Destroy(small);
        }
    }
}
