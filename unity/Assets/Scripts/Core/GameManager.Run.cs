using System;
using System.Collections.Generic;
using UnityEngine;

namespace Eco
{
    public partial class GameManager
    {
        // ---------- Mosteiro (hub) ----------
        public void EnterHub(string reason = null)
        {
            menuHero?.Dispose(); menuHero = null;
            run = new RunState { isHub = true, type = "hub", stats = ComputeStats(), startTime = Time.time };
            BuildRoom("hub", Floors.Hub);
            player?.Dispose(); player = null;
            MakePlayer(CurrentClass, run.stats);
            rs = new RoomState { hub = true, cleared = true, rewardGiven = true, doorsOpen = true, started = 0 };
            room.AddDoors(new List<RoomOption> { new RoomOption { type = "profundezas", rewardText = "Descer" } });
            master = new Npc(this, "mestre", "Mestre Rafael", new Vector3(-3.2f, 0, 0.5f), new RigOptions
            {
                height = 1.75f, color = EcoMath.Hex(0x4a3a2e), skin = EcoMath.Hex(0xc89a78), robe = EcoMath.Hex(0x6a5030),
                beard = EcoMath.Hex(0xe8e4dc), hood = EcoMath.Hex(0x3a2c20), weapon = "staff", eyeColor = EcoMath.Hex(0xe8c27a),
            });
            npcs.Add(master);
            room.pillars.Add(new Pillar { x = master.pos.x, z = master.pos.z, r = 0.5f, h = 2 });
            SpawnEnemy("boneco", new Vector3(5, 0, -1), stationary: true);
            // Começa perto do Mestre, olhando para ele
            player.pos = new Vector3(-1.2f, 0, -3.2f);
            player.yaw = player.facing = EcoMath.YawOf(master.pos - player.pos);
            player.pitch = 0.05f;
            roomName = "Mosteiro do Eco";
            objective = CurrentClass != null ? "Fale com o Mestre ou desça pelo portal" : "";
            state = GState.Playing;
            GameInput.Lock();
            var st = save.story;
            if (!st.prologo) StartDialogue("prologo", () => { st.prologo = true; save.Write(); objective = "Pratique no boneco ou desça pelo portal"; });
            else if (reason == "morte") StartDialogue("retorno_morte");
            else if (reason == "vitoria") StartDialogue("retorno_vitoria");
        }

        public void RefreshHubStats()
        {
            if (run == null || !run.isHub) return;
            run.stats = ComputeStats();
            MakePlayer(CurrentClass, run.stats);
        }

        void UpdateHub()
        {
            var p = player;
            bool near = master != null && Vector3.Distance(p.pos, master.pos) < 2.8f;
            prompt = near ? "[E] Falar com Mestre Rafael" : null;
            if (near && GameInput.Consume("E")) { StartDialogue("mestre_menu"); return; }
            foreach (var d in room.doors)
            {
                if (Mathf.Abs(p.pos.x - d.x) < 1.5f && p.pos.z > d.z - 1.3f)
                {
                    if (CurrentClass == null) { p.pos.z -= 2; StartDialogue("trocar"); return; }
                    Sfx.Play("door");
                    fx.Flash(0.8f, Color.black);
                    prompt = null;
                    StartRun();
                    return;
                }
            }
        }

        // ---------- Diálogos ----------
        public void StartDialogue(string id, Action onDone = null)
        {
            state = GState.Dialogue;
            GameInput.Unlock();
            if (player != null) player.locked = true;
            if (master != null && System.Text.RegularExpressions.Regex.IsMatch(id, "mestre|prologo|retorno|conselho|trocar|licao|escolha|sobre")) master.talking = true;
            prompt = null;
            var story = StoryData.Get();
            Func<string, string> vars = k =>
            {
                var c = CurrentClass;
                switch (k)
                {
                    case "caminho": return c != null ? c.path : "nenhum caminho";
                    case "classe": return c != null ? c.name : "";
                    case "mortes": return save.deaths.ToString();
                    case "saudacao": return story.saudacoes.Count > 0 ? EcoMath.Pick(story.saudacoes) : "";
                    case "conselho": return story.conselhos.Count > 0 ? EcoMath.Pick(story.conselhos) : "";
                    case "retorno": return story.retornos.Count > 0 ? EcoMath.Pick(story.retornos) : "";
                }
                return "";
            };
            dialogue.Run(id, vars, DialogueAction, () =>
            {
                if (master != null) master.talking = false;
                if (player != null) player.locked = false;
                if (pendingOverlay != null)
                {
                    var which = pendingOverlay; pendingOverlay = null;
                    OpenOverlay(which, () => { RefreshHubStats(); state = GState.Playing; GameInput.Lock(); });
                    return;
                }
                state = GState.Playing;
                onDone?.Invoke();
                if (state == GState.Playing) GameInput.Lock();
            });
        }

        void DialogueAction(string action)
        {
            if (action.StartsWith("classe:"))
            {
                save.story.classe = action.Substring(7);
                save.Write();
                run.stats = ComputeStats();
                MakePlayer(CurrentClass, run.stats);
                player.locked = true;
            }
            else if (action == "meta" || action == "skills")
            {
                pendingOverlay = action;
                dialogue.Finish();
            }
        }

        // ---------- Run ----------
        public void StartRun()
        {
            var cls = CurrentClass;
            run = new RunState { cls = cls, stats = ComputeStats(), startTime = Time.time };
            MakePlayer(cls, run.stats);
            save.runs++;
            save.Write();
            EnterRoom("combate");
            state = GState.Playing;
            GameInput.Lock();
        }

        static readonly Dictionary<string, string[]> Layouts = new Dictionary<string, string[]>
        {
            ["combate"] = new[] { "arena", "ring", "open" }, ["elite"] = new[] { "ring", "arena" }, ["sobrevivencia"] = new[] { "open", "ring" },
            ["duelo"] = new[] { "open" }, ["flechas"] = new[] { "towers" }, ["santuario"] = new[] { "open" }, ["chefe"] = new[] { "boss" },
        };

        void EnterRoom(string type)
        {
            run.type = type;
            boss = null;
            var theme = Floors.All[run.floor];
            BuildRoom(EcoMath.Pick(Layouts[type]), theme);
            var p = player;
            p.pos = new Vector3(0, 0, -(room.half - 3));
            p.vel = Vector3.zero;
            p.yaw = p.pitch = p.facing = 0;
            p.dashCharges = p.MaxDash;

            rs = new RoomState { duel = type == "duelo" };
            int f = run.floor, i = run.roomIndex;
            switch (type)
            {
                case "combate":
                    rs.waves.Add(ComposeWave(3 + f * 2 + i / 2));
                    rs.waves.Add(ComposeWave(4 + f * 2 + i / 2));
                    break;
                case "elite":
                {
                    var e = new[] { "bruto", "duelista", "carcereiro" };
                    rs.waves.Add(new List<SpawnSpec> { new SpawnSpec(EcoMath.Pick(e), true), new SpawnSpec(f > 0 ? "duelista" : "carcereiro", true), new SpawnSpec("atirador") });
                    if (f >= 1) rs.waves.Add(new List<SpawnSpec> { new SpawnSpec("bruto", true), new SpawnSpec("atirador"), new SpawnSpec("atirador") });
                    break;
                }
                case "sobrevivencia": rs.timer = 30 + f * 5; break;
                case "duelo":
                    rs.waves.Add(new List<SpawnSpec> { new SpawnSpec("duelista"), new SpawnSpec("duelista") });
                    if (f >= 1) rs.waves[0].Add(new SpawnSpec("carcereiro"));
                    if (f >= 2) rs.waves.Add(new List<SpawnSpec> { new SpawnSpec("duelista", true), new SpawnSpec("bruto") });
                    break;
                case "flechas":
                {
                    rs.waves.Add(new List<SpawnSpec> { new SpawnSpec("carcereiro"), new SpawnSpec("carcereiro") });
                    if (f >= 1) rs.waves[0].Add(new SpawnSpec("duelista"));
                    var towers = new List<Vector3>(room.towers);
                    for (int k = 0; k < towers.Count; k++) { int j = UnityEngine.Random.Range(k, towers.Count); var tmp = towers[k]; towers[k] = towers[j]; towers[j] = tmp; }
                    for (int k = 0; k < Mathf.Min(towers.Count, 4 + f); k++)
                    {
                        var e = SpawnEnemy("atirador", towers[k], stationary: true);
                        e.cooldown = 1.5f + UnityEngine.Random.value * 2;
                    }
                    break;
                }
                case "chefe":
                    rs.waves.Add(new List<SpawnSpec> { new SpawnSpec("arauto", boss: true) });
                    rs.preDialogue = "arauto_intro_" + f;
                    break;
            }
            if (type == "santuario") { rs.cleared = true; objective = "Santuário · descanse"; }
            var rt = RoomTypes.All[type];
            roomName = $"{theme.name} · {(type == "chefe" ? "Chefe" : "Sala " + (run.roomIndex + 1))} · {rt.name}";
            fx.Callout(rt.name.ToUpperInvariant(), rt.color, 1.2f);
        }

        List<SpawnSpec> ComposeWave(float budget)
        {
            int f = run.floor, i = run.roomIndex;
            var pool = new List<(string t, float c, float w)> { ("carcereiro", 1, 4), ("atirador", 1.2f, 2) };
            if (f > 0 || i >= 1) pool.Add(("duelista", 1.6f, 2));
            if (f > 0 || i >= 2) pool.Add(("bruto", 2.5f, 1 + f));
            var outList = new List<SpawnSpec>();
            float b = budget;
            while (b > 0.9f && outList.Count < 7)
            {
                var opts = pool.FindAll(p => p.c <= b + 0.3f);
                if (opts.Count == 0) break;
                float tot = 0; foreach (var o in opts) tot += o.w;
                float r = UnityEngine.Random.value * tot;
                var pick = opts[0];
                foreach (var o in opts) { r -= o.w; if (r <= 0) { pick = o; break; } }
                outList.Add(new SpawnSpec(pick.t));
                b -= pick.c;
            }
            return outList;
        }

        public Enemy SpawnEnemy(string type, Vector3 pos, bool elite = false, bool stationary = false)
        {
            int f = run != null ? run.floor : 0, i = run != null ? run.roomIndex : 0;
            var e = new Enemy(this, type, pos, 1 + f * 0.5f + i * 0.06f, 1 + f * 0.25f + i * 0.03f, elite, stationary);
            enemies.Add(e);
            fx.RingFx(pos, EcoMath.Hex(0xff3050), 2.5f, 0.5f);
            fx.Burst(new Vector3(pos.x, 1, pos.z), EcoMath.Hex(0xff3050), 10, 4, 0.5f);
            return e;
        }

        Vector3 RandomSpawnPos(float minDist = 9)
        {
            float h = room.half - 2;
            for (int k = 0; k < 40; k++)
            {
                var p = new Vector3(UnityEngine.Random.Range(-h, h), 0, UnityEngine.Random.Range(-h, h));
                if (Vector3.Distance(p, player.pos) < minDist) continue;
                bool bad = false;
                foreach (var q in room.pillars) if (EcoMath.FlatDist(p, new Vector3(q.x, 0, q.z)) < q.r + 1.5f) { bad = true; break; }
                if (!bad) return p;
            }
            return new Vector3(0, 0, room.half - 4);
        }

        void SpawnWave(List<SpawnSpec> list)
        {
            foreach (var s in list)
            {
                var pos = s.boss ? new Vector3(0, 0, room.half * 0.4f) : RandomSpawnPos(9);
                var e = SpawnEnemy(s.t, pos, s.elite);
                e.cooldown = 1.2f + UnityEngine.Random.value;
                if (s.boss)
                {
                    e.hpMax *= 1 + run.floor * 0.35f; e.hp = e.hpMax;
                    boss = e;
                    bossName = run.floor == 0 ? "O Arauto" : run.floor == 1 ? "O Arauto da Forja" : "O Arauto do Abismo";
                }
            }
        }

        public void SummonNear(string type, Vector3 pos)
        {
            var p = pos + new Vector3(UnityEngine.Random.Range(-3f, 3f), 0, UnityEngine.Random.Range(-3f, 3f));
            room.Collide(ref p, 0.6f);
            SpawnEnemy(type, p).cooldown = 1.5f;
        }

        void UpdateRoom(float dt)
        {
            if (rs.hub) { UpdateHub(); return; }
            if (rs.started > 0)
            {
                rs.started -= dt;
                if (rs.started <= 0)
                {
                    if (rs.preDialogue != null) { var id = rs.preDialogue; rs.preDialogue = null; rs.started = 0.4f; StartDialogue(id); }
                    else if (rs.waves.Count > 0) SpawnWave(rs.waves[rs.waveIdx]);
                }
                return;
            }
            int alive = enemies.FindAll(e => !e.dead && !e.stationary).Count;
            int towerAlive = enemies.FindAll(e => !e.dead && e.stationary).Count;

            if (!rs.cleared)
            {
                if (run.type == "sobrevivencia")
                {
                    rs.timer -= dt; rs.spawnTimer -= dt;
                    if (rs.spawnTimer <= 0 && alive < 4 + run.floor)
                    {
                        rs.spawnTimer = Mathf.Max(1.4f, 2.6f - run.floor * 0.4f);
                        var w = ComposeWave(1.6f);
                        if (w.Count > 0) SpawnWave(new List<SpawnSpec> { w[0] });
                    }
                    objective = $"Sobreviva: {Mathf.Max(0, rs.timer):0.0}s";
                    if (rs.timer <= 0) { foreach (var e in enemies.ToArray()) if (!e.dead) e.Die(); RoomCleared(); }
                }
                else
                {
                    if (alive == 0 && towerAlive == 0)
                    {
                        if (rs.waveIdx < rs.waves.Count - 1) { rs.waveIdx++; rs.started = 1; fx.Callout("PRÓXIMA ONDA", EcoMath.Hex(0xff5a6e), 0.8f); }
                        else RoomCleared();
                    }
                    if (!rs.cleared)
                    {
                        int total = alive + towerAlive;
                        string txt = run.type == "duelo" ? $"Duelo — apenas aparos ferem · {total} restantes" : $"Inimigos restantes: {total}";
                        if (run.type == "flechas") txt = $"Reflita as flechas! Torres: {towerAlive} · Chão: {alive}";
                        if (rs.waves.Count > 1) txt += $" · Onda {rs.waveIdx + 1}/{rs.waves.Count}";
                        objective = txt;
                    }
                }
            }
            else if (!rs.rewardGiven) { rs.rewardGiven = true; GiveReward(); }
            else if (rs.doorsOpen)
            {
                var p = player.pos;
                foreach (var d in room.doors)
                    if (Mathf.Abs(p.x - d.x) < 1.5f && p.z > d.z - 1.3f) { TakeDoor(d.opt); break; }
            }
        }

        void RoomCleared()
        {
            if (rs.cleared) return;
            rs.cleared = true;
            run.rooms++;
            AddEcos(3);
            Sfx.Play("clear");
            if (run.type != "chefe") fx.Callout("SALA LIMPA", EcoMath.Hex(0x9affd0), 1);
            objective = "Sala limpa";
        }

        void GiveReward()
        {
            var reward = RoomTypes.All[run.type].reward;
            if (run.type == "chefe")
            {
                AddEcos(30);
                player.Heal(run.stats.maxHp);
                save.story.bosses = Mathf.Max(save.story.bosses, run.floor + 1);
                if (run.floor >= Floors.All.Length - 1) { EndRun(true); return; }
                fx.Callout("ANDAR CONCLUÍDO", EcoMath.Hex(0xffd34a), 1.6f);
                StartDialogue("arauto_derrota_" + run.floor, () => OfferBoons(2, "Recompensa do Guardião"));
                return;
            }
            if (reward == "heal")
            {
                int h = Mathf.RoundToInt(run.stats.maxHp * 0.4f);
                player.Heal(h);
                fx.Num(player.pos, "+" + h, false, EcoMath.Hex(0x9affd0));
                OfferBoons(0, "Bênção do Santuário");
                return;
            }
            OfferBoons(reward == "boon+" ? 1 : 0);
        }

        void OfferBoons(int minRarity, string title = "Escolha uma bênção")
        {
            int n = save.Meta("choice") > 0 ? 4 : 3;
            var owned = new HashSet<string>(); foreach (var b in run.boons) owned.Add(b.id);
            var pool = Boons.All.FindAll(b => (b.stack || !owned.Contains(b.id)) && b.rarity >= minRarity);
            if (pool.Count < n) pool = Boons.All.FindAll(b => b.stack || !owned.Contains(b.id));
            float W(Boon b) => b.rarity == 0 ? 6 : b.rarity == 1 ? 3 + run.floor : 1 + run.floor;
            var picks = new List<Boon>();
            while (picks.Count < n && pool.Count > 0)
            {
                float tot = 0; foreach (var b in pool) tot += W(b);
                float r = UnityEngine.Random.value * tot; int idx = 0;
                for (int k = 0; k < pool.Count; k++) { r -= W(pool[k]); if (r <= 0) { idx = k; break; } }
                picks.Add(pool[idx]); pool.RemoveAt(idx);
            }
            choiceItems = picks;
            choiceTitle = title;
            state = GState.Choice;
            GameInput.Unlock();
        }

        public void TakeBoon(int i)
        {
            if (state != GState.Choice || i < 0 || i >= choiceItems.Count) return;
            var b = choiceItems[i];
            run.boons.Add(b);
            b.apply(run.stats, player);
            Sfx.Play("pickup");
            state = GState.Playing;
            GameInput.Lock();
            OpenDoors();
        }

        void OpenDoors()
        {
            rs.doorsOpen = true;
            var options = new List<RoomOption>();
            if (run.type == "chefe")
            {
                options.Add(new RoomOption { type = "combate", nextFloor = true });
                options.Add(new RoomOption { type = "elite", nextFloor = true });
            }
            else if (run.roomIndex + 1 >= RoomsPerFloor) options.Add(new RoomOption { type = "chefe" });
            else
            {
                var pool = new List<(string type, float w)> { ("combate", 4), ("elite", 2), ("sobrevivencia", 2), ("duelo", 2), ("flechas", 2) };
                if (run.roomIndex >= 1 && run.type != "santuario") pool.Add(("santuario", 1.5f));
                int n = UnityEngine.Random.value < 0.5f ? 3 : 2;
                var avail = pool.FindAll(p => p.type != run.type || p.type == "combate");
                while (options.Count < n && avail.Count > 0)
                {
                    float tot = 0; foreach (var a in avail) tot += a.w;
                    float r = UnityEngine.Random.value * tot; int idx = 0;
                    for (int k = 0; k < avail.Count; k++) { r -= avail[k].w; if (r <= 0) { idx = k; break; } }
                    options.Add(new RoomOption { type = avail[idx].type });
                    avail.RemoveAt(idx);
                }
            }
            var rewardText = new Dictionary<string, string> { ["boon"] = "Bênção", ["boon+"] = "Bênção rara", ["heal"] = "Cura + bênção", ["boss"] = "Fim do andar" };
            foreach (var o in options) o.rewardText = o.nextFloor ? "Próximo andar" : rewardText[RoomTypes.All[o.type].reward];
            room.AddDoors(options);
            objective = "Escolha um portal";
        }

        void TakeDoor(RoomOption opt)
        {
            Sfx.Play("door");
            fx.Flash(0.8f, Color.black);
            if (opt.nextFloor) { run.floor++; run.roomIndex = 0; }
            else if (run.type != "chefe") run.roomIndex++;
            boss = null;
            EnterRoom(opt.type);
        }

        void AddEcos(float n) { run.ecos += Mathf.RoundToInt(n * (run != null ? run.stats.ecoMult : 1)); }

        public void EndRun(bool win)
        {
            if (win && !run.finalShown)
            {
                run.finalShown = true;
                StartDialogue("final", () => EndRun(true));
                return;
            }
            if (run.isHub) { QuitToMenu(); return; }
            if (win) AddEcos(50);
            if (!win) save.deaths++;
            save.story.last = win ? "vitoria" : "morte";
            state = GState.End;
            save.ecos += run.ecos;
            if (win) save.wins++;
            int depth = run.floor * (RoomsPerFloor + 1) + run.roomIndex + 1;
            save.best = Mathf.Max(save.best, depth);
            save.Write();
            GameInput.Unlock();
            prompt = null;
            int t = Mathf.RoundToInt(Time.time - run.startTime);
            endWin = win;
            endStats = new List<KeyValuePair<string, string>>
            {
                new KeyValuePair<string, string>("Andar alcançado", $"{run.floor + 1} — {Floors.All[run.floor].name}"),
                new KeyValuePair<string, string>("Salas concluídas", run.rooms.ToString()),
                new KeyValuePair<string, string>("Abates", run.kills.ToString()),
                new KeyValuePair<string, string>("Aparos", run.parries.ToString()),
                new KeyValuePair<string, string>("Esquivas perfeitas", run.perfectDodges.ToString()),
                new KeyValuePair<string, string>("Bênçãos", run.boons.Count.ToString()),
                new KeyValuePair<string, string>("Tempo", $"{t / 60}m {t % 60}s"),
                new KeyValuePair<string, string>("Ecos ganhos", "◈ " + run.ecos),
            };
        }
    }
}
