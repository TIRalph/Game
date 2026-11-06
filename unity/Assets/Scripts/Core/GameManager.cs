using System;
using System.Collections.Generic;
using UnityEngine;

namespace Eco
{
    public enum GState { Menu, Playing, Dialogue, Choice, Overlay, Paused, End }

    public class SpawnSpec { public string t; public bool elite, boss; public SpawnSpec(string t, bool elite = false, bool boss = false) { this.t = t; this.elite = elite; this.boss = boss; } }

    public class RunState
    {
        public bool isHub, finalShown;
        public ClassDef cls;
        public string type = "combate";
        public int floor, roomIndex, ecos, kills, parries, perfectDodges, rooms;
        public Stats stats;
        public List<Boon> boons = new List<Boon>();
        public float startTime;
    }

    public class RoomState
    {
        public bool hub, cleared, rewardGiven, doorsOpen, duel;
        public float started = 0.8f, timer, spawnTimer;
        public List<List<SpawnSpec>> waves = new List<List<SpawnSpec>>();
        public int waveIdx;
        public string preDialogue;
    }

    // Personagem não-hostil (ex.: Mestre Rafael). Olha para o jogador e gesticula ao falar.
    public class Npc
    {
        public readonly string name;
        public readonly Vector3 pos;
        public bool talking;
        readonly ICharacterVisual model;
        readonly GameManager game;
        float facing = Mathf.PI;

        public Npc(GameManager game, string key, string name, Vector3 pos, RigOptions opts)
        {
            this.game = game; this.name = name; this.pos = pos;
            model = ModelLibrary.Create(key, opts);
            model.Root.SetParent(game.World, false);
            model.Root.position = pos;
        }

        public void Update(float dt)
        {
            var p = game.player;
            if (p != null && Vector3.Distance(p.pos, pos) < 8) facing += EcoMath.WrapAngle(EcoMath.YawOf(p.pos - pos) - facing) * Mathf.Min(1, dt * 3);
            model.Root.rotation = Quaternion.Euler(0, facing * EcoMath.Deg, 0);
            model.Play(talking ? "talk" : "idle");
            model.Tick(dt, 0);
        }

        public void Dispose() { model.Dispose(); }
    }

    // Loop principal, estados e salas. O combate fica em GameManager.Combat.cs
    // e o mosteiro/run/diálogos em GameManager.Run.cs.
    public partial class GameManager : MonoBehaviour
    {
        public const int RoomsPerFloor = 5; // + 1 sala de chefe
        const float SlowmoScale = 0.25f;

        public static GameManager Instance { get; private set; }

        public Camera cam;
        public Transform World { get; private set; }
        public FX fx;
        public SaveData save;
        public DialogueRunner dialogue = new DialogueRunner();
        public GState state = GState.Menu;
        public PlayerController player;
        public Room room;
        public RunState run;
        public RoomState rs;
        public readonly List<Enemy> enemies = new List<Enemy>();
        public readonly List<Projectile> projectiles = new List<Projectile>();
        public readonly List<Shockwave> waves = new List<Shockwave>();
        public readonly List<Npc> npcs = new List<Npc>();
        public Npc master;
        public Enemy boss;
        public string bossName;
        public float hitstop, slowmo, timeScale = 1, elapsed;

        // Dados para a interface
        public string roomName = "", objective = "", prompt;
        public List<Boon> choiceItems = new List<Boon>();
        public string choiceTitle;
        public string overlay; // "skills", "meta", "help"
        public Action overlayReturn;
        public bool endWin;
        public List<KeyValuePair<string, string>> endStats = new List<KeyValuePair<string, string>>();

        Light sun;
        ICharacterVisual menuHero;
        string pendingOverlay;

        void Awake()
        {
            Instance = this;
            Application.targetFrameRate = 120;
            save = SaveData.Load();
            World = new GameObject("Mundo").transform;
            World.SetParent(transform, false);
            fx = new FX(World);
            Sfx.Init(gameObject);

            cam = Camera.main;
            if (cam == null)
            {
                var cg = new GameObject("Camera");
                cg.tag = "MainCamera";
                cam = cg.AddComponent<Camera>();
                cg.AddComponent<AudioListener>();
            }
            cam.nearClipPlane = 0.05f;
            cam.farClipPlane = 200;
            cam.clearFlags = CameraClearFlags.SolidColor;

            var sg = new GameObject("Sol");
            sg.transform.SetParent(transform, false);
            sun = sg.AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.intensity = 0.9f;
            sun.shadows = LightShadows.Soft;
            sg.transform.rotation = Quaternion.Euler(55, 30, 0);

            BuildRoom("open", Floors.All[0]);
            ShowMenuHero();
        }

        // ---------- Sala ----------
        public void BuildRoom(string layout, FloorTheme theme)
        {
            ClearEntities();
            room?.Dispose();
            float size = layout == "boss" ? 40 : layout == "towers" ? 36 : layout == "hub" ? 30 : 34;
            room = new Room(World, theme, layout, size);
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = theme.fog;
            RenderSettings.fogStartDistance = 18;
            RenderSettings.fogEndDistance = 75;
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.ambientLight = theme.light * 0.45f * theme.ambient;
            cam.backgroundColor = theme.fog;
            sun.color = Color.Lerp(Color.white, theme.light, 0.4f);
        }

        public void ClearEntities()
        {
            mines.Clear();
            foreach (var n in npcs) n.Dispose();
            npcs.Clear();
            master = null;
            foreach (var e in enemies) e.Remove();
            foreach (var p in projectiles) p.Kill();
            foreach (var w in waves) w.Kill();
            enemies.Clear(); projectiles.Clear(); waves.Clear();
            fx.Clear();
        }

        public ClassDef CurrentClass => Classes.Get(save.story.classe);

        // Atributos base + melhorias permanentes + árvore de habilidades do caminho atual.
        public Stats ComputeStats() => Skills.Apply(Stats.Base(save), save, CurrentClass?.id);

        public void MakePlayer(ClassDef cls, Stats stats)
        {
            var old = player;
            old?.Dispose();
            player = new PlayerController(this, cls, stats);
            if (old != null) { player.pos = old.pos; player.yaw = old.yaw; player.pitch = old.pitch; player.facing = old.yaw; }
        }

        // ---------- Menu ----------
        public void ShowMenuHero()
        {
            menuHero?.Dispose();
            menuHero = ModelLibrary.Create("protagonista", new RigOptions { height = 1.8f, color = EcoMath.Hex(0x3a3048), skin = EcoMath.Hex(0xd9a882) });
            menuHero.Root.SetParent(World, false);
        }

        public void QuitToMenu()
        {
            state = GState.Menu;
            GameInput.Unlock();
            ClearEntities();
            player?.Dispose();
            player = null;
            run = null; prompt = null; boss = null;
            BuildRoom("open", Floors.All[0]);
            ShowMenuHero();
        }

        // ---------- Pausa ----------
        public void Pause()
        {
            if (state != GState.Playing) return;
            state = GState.Paused;
            GameInput.Unlock();
        }

        public void Resume()
        {
            if (state != GState.Paused) return;
            state = GState.Playing;
            GameInput.Lock();
        }

        public void OpenOverlay(string which, Action onClose)
        {
            overlay = which;
            overlayReturn = onClose;
            if (state != GState.Menu) state = GState.Overlay;
            GameInput.Unlock();
        }

        public void CloseOverlay()
        {
            var cb = overlayReturn;
            overlay = null; overlayReturn = null;
            cb?.Invoke();
        }

        // ---------- Loop ----------
        void Update()
        {
            float realDt = Mathf.Min(0.05f, Time.unscaledDeltaTime);
            elapsed += realDt;
            Step(realDt);
        }

        void Step(float realDt)
        {
            if (state == GState.Menu)
            {
                float t = elapsed * 0.25f;
                cam.transform.position = new Vector3(Mathf.Sin(t) * 4.2f, 1.7f, Mathf.Cos(t) * 4.2f);
                cam.transform.LookAt(new Vector3(0, 1.05f, 0));
                // Desloca a imagem para o herói ficar à direita do texto do menu
                cam.transform.position -= cam.transform.right * 1.1f;
                cam.fieldOfView = 60;
                if (menuHero != null) { menuHero.Play("idle"); menuHero.Tick(realDt, 0); }
                fx.Update(realDt, realDt);
                return;
            }
            if (state == GState.Dialogue)
            {
                dialogue.Tick(realDt);
                foreach (var n in npcs) n.Update(realDt);
                player?.UpdateViewOnly(0);
                fx.Update(0, realDt);
                room.Update(elapsed);
                return;
            }
            if (state != GState.Playing) return;

            if (GameInput.Consume("Escape")) { Pause(); return; }

            // Câmera lenta e hitstop
            if (slowmo > 0) slowmo -= realDt;
            float targetScale = slowmo > 0 ? SlowmoScale : 1;
            timeScale += (targetScale - timeScale) * Mathf.Min(1, realDt * 12);
            float dt = realDt * timeScale;
            float pdt = realDt * (slowmo > 0 ? 0.8f : timeScale);
            if (hitstop > 0) { hitstop -= realDt; dt = 0; pdt = 0; }

            var p = player;
            p.Update(pdt);
            if (!p.locked && !p.dead)
            {
                if (GameInput.Consume("R")) UseAbilityR();
                if (GameInput.Consume("V")) UseUltimate();
            }
            UpdateAbilities(dt);
            foreach (var n in npcs) n.Update(dt);
            for (int i = 0; i < enemies.Count; i++) enemies[i].Update(dt);
            enemies.RemoveAll(e => e.removed);
            for (int i = 0; i < projectiles.Count; i++) projectiles[i].Update(dt);
            projectiles.RemoveAll(x => x.dead);
            for (int i = 0; i < waves.Count; i++) waves[i].Update(dt);
            waves.RemoveAll(w => w.dead);
            if (state != GState.Playing) return; // morreu ou abriu diálogo durante o passo

            UpdateRoom(dt);
            room.Update(elapsed);
            fx.Update(dt, realDt);

            if (fx.shake > 0)
            {
                float s = fx.shake * 0.08f;
                cam.transform.position += new Vector3(UnityEngine.Random.value - 0.5f, UnityEngine.Random.value - 0.5f, 0) * s;
            }
        }
    }
}
