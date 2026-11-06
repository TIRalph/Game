using System;
using System.Collections.Generic;
using UnityEngine;

namespace Eco
{
    // Os dois caminhos do Mosteiro do Eco. `firstPerson` define a câmera.
    public class ClassDef
    {
        public string id, name, path, desc, model;
        public bool firstPerson, bolt;
        public float damage, swingTime, activeAt, range, arc, boltSpeed, parryWindow, postureMult, dodgeSpeed;
        public float perfectDodgeCrit = 2f;
        public float[] comboMults;
        public int dashBonus;
        public float finisherRadius, finisherMult;
        public Color color;
    }

    public static class Classes
    {
        public static readonly ClassDef Mago = new ClassDef
        {
            id = "mago", name = "Mago", path = "Caminho da Mão Aberta", firstPerson = true, bolt = true,
            desc = "Primeira pessoa. Dardos arcanos à distância, selo rúnico que apara e reflete, lampejo rápido.",
            damage = 12, swingTime = 0.3f, activeAt = 0.3f, comboMults = new[] { 1f, 1f, 2.4f }, boltSpeed = 36,
            parryWindow = 0.2f, postureMult = 0.8f, dashBonus = 0, dodgeSpeed = 24,
            model = "aprendiz_mago_maos", color = EcoMath.Hex(0x9a7dff),
        };

        public static readonly ClassDef Punhos = new ClassDef
        {
            id = "punhos", name = "Punhos", path = "Caminho do Punho Fechado", firstPerson = false, bolt = false,
            desc = "Terceira pessoa. Combos rápidos de soco, guarda firme, +1 esquiva. O 3º golpe abala o chão.",
            damage = 15, swingTime = 0.3f, activeAt = 0.45f, range = 2.4f, arc = 0.35f, comboMults = new[] { 1f, 1.1f, 2f },
            parryWindow = 0.22f, postureMult = 1.4f, dashBonus = 1, perfectDodgeCrit = 2.5f, dodgeSpeed = 19,
            finisherRadius = 3.5f, finisherMult = 0.6f,
            model = "aprendiz_punhos", color = EcoMath.Hex(0xffb27a),
        };

        public static ClassDef Get(string id) => id == "mago" ? Mago : id == "punhos" ? Punhos : null;
        public static readonly ClassDef[] All = { Mago, Punhos };
    }

    // Atributos de uma run (base + melhorias permanentes + árvore + bênçãos).
    public class Stats
    {
        public float maxHp = 100, dmgMult = 1, attackSpeed = 1, parryWindowMult = 1;
        public int dashCharges = 2;
        public float dashRecharge = 1.1f, slowmo = 0.7f, riposteMult = 2, parryHeal, parryShockwave, dodgeExplosion;
        public float reflectMult = 3;
        public bool reflectHoming, fury, slashWave;
        public float executeMult = 3;
        public int revives;
        public float ecoMult = 1, postureMult = 1, killHeal, thorns, moveSpeed = 1;
        // Árvore de habilidades
        public int pierce;
        public float orbMult = 1, dodgeDistMult = 1, dodgeMine, quakeMult = 1, reflectSpeed = 1, damageTaken = 1;
        public string abilityR, ultimate;
        public bool ecoTemporal, counterHit, contraEsquiva;

        public static Stats Base(SaveData save)
        {
            return new Stats
            {
                maxHp = 100 + save.Meta("hp") * 15,
                dmgMult = 1 + save.Meta("dmg") * 0.08f,
                parryWindowMult = 1 + save.Meta("parry") * 0.1f,
                revives = save.Meta("revive") > 0 ? 1 : 0,
            };
        }
    }

    public class Boon
    {
        public string id, name, desc;
        public int rarity; // 0 comum, 1 raro, 2 épico
        public bool stack;
        public Action<Stats, PlayerController> apply;
    }

    public static class Boons
    {
        static Boon B(string id, string name, string desc, int rarity, bool stack, Action<Stats, PlayerController> apply) =>
            new Boon { id = id, name = name, desc = desc, rarity = rarity, stack = stack, apply = apply };

        public static readonly List<Boon> All = new List<Boon>
        {
            B("afiada", "Lâmina Afiada", "+20% de dano.", 0, true, (s, p) => s.dmgMult += 0.2f),
            B("veloz", "Golpe Veloz", "+18% velocidade de ataque.", 0, true, (s, p) => s.attackSpeed += 0.18f),
            B("pedra", "Pele de Pedra", "+30 de vida máxima e cura 30.", 0, true, (s, p) => { s.maxHp += 30; if (p != null) p.Heal(30); }),
            B("janela", "Olho Atento", "Janela de aparo +30%.", 0, true, (s, p) => s.parryWindowMult += 0.3f),
            B("fantasma", "Passo Fantasma", "+1 carga de esquiva.", 1, true, (s, p) => s.dashCharges += 1),
            B("recarga", "Fôlego", "Esquivas recarregam 30% mais rápido.", 0, true, (s, p) => s.dashRecharge *= 0.7f),
            B("contra", "Contra-Ataque", "Golpes em inimigos atordoados por aparo: +100% de dano.", 1, true, (s, p) => s.riposteMult += 1),
            B("vampiro", "Aparo Vampírico", "Cada aparo perfeito cura 5.", 0, true, (s, p) => s.parryHeal += 5),
            B("choque", "Eco de Choque", "Aparos liberam uma onda que causa 25 de dano ao redor.", 1, true, (s, p) => s.parryShockwave += 25),
            B("explosiva", "Esquiva Explosiva", "Esquivas perfeitas explodem causando 35 de dano.", 1, true, (s, p) => s.dodgeExplosion += 35),
            B("tempo", "Dilatação", "Câmera lenta da esquiva perfeita dura +50%.", 0, true, (s, p) => s.slowmo *= 1.5f),
            B("teleguiado", "Reflexo Teleguiado", "Projéteis refletidos perseguem inimigos e causam +100% de dano.", 1, false, (s, p) => { s.reflectHoming = true; s.reflectMult += 3; }),
            B("furia", "Fúria Rítmica", "Cada ação perfeita dá +10% de dano (até 6x). Perde ao ser atingido.", 2, false, (s, p) => s.fury = true),
            B("onda", "Lâmina Projetada", "O golpe final do combo dispara uma onda cortante.", 2, false, (s, p) => s.slashWave = true),
            B("execucao", "Executor", "Inimigos quebrados recebem dano x4 (em vez de x3).", 1, false, (s, p) => s.executeMult = 4),
            B("fenix", "Pena de Fênix", "Reviva uma vez com 50% de vida.", 2, true, (s, p) => s.revives += 1),
            B("ima", "Ímã de Ecos", "+50% de Ecos ganhos.", 0, true, (s, p) => s.ecoMult += 0.5f),
            B("quebra", "Quebra-Postura", "+50% de dano de postura.", 0, true, (s, p) => s.postureMult += 0.5f),
            B("colheita", "Colheita", "Abates curam 4 de vida.", 0, true, (s, p) => s.killHeal += 4),
            B("espinhos", "Espinhos", "Quem te atinge sofre 20 de dano.", 0, true, (s, p) => s.thorns += 20),
            B("agil", "Pés Leves", "+15% velocidade de movimento.", 0, true, (s, p) => s.moveSpeed += 0.15f),
        };
    }

    public class MetaUpgrade
    {
        public string id, name, desc;
        public int max;
        public Func<int, int> cost;
    }

    public static class MetaUpgrades
    {
        public static readonly MetaUpgrade[] All =
        {
            new MetaUpgrade { id = "hp", name = "Vitalidade", desc = "+15 de vida máxima inicial.", max = 5, cost = l => 20 + l * 20 },
            new MetaUpgrade { id = "dmg", name = "Fio Ancestral", desc = "+8% de dano base.", max = 5, cost = l => 25 + l * 25 },
            new MetaUpgrade { id = "parry", name = "Reflexos", desc = "+10% janela de aparo.", max = 3, cost = l => 30 + l * 30 },
            new MetaUpgrade { id = "choice", name = "Destino Amplo", desc = "Bênçãos oferecem 4 opções.", max = 1, cost = l => 80 },
            new MetaUpgrade { id = "revive", name = "Segundo Fôlego", desc = "Comece cada run com 1 revive.", max = 1, cost = l => 150 },
        };
    }

    public class RoomType
    {
        public string id, name, reward, desc;
        public Color color;
    }

    public static class RoomTypes
    {
        static RoomType R(string id, string name, int color, string reward, string desc) =>
            new RoomType { id = id, name = name, color = EcoMath.Hex(color), reward = reward, desc = desc };

        public static readonly Dictionary<string, RoomType> All = new Dictionary<string, RoomType>
        {
            ["combate"] = R("combate", "Combate", 0xb0b0ff, "boon", "Derrote todos"),
            ["elite"] = R("elite", "Elite", 0xff7af5, "boon+", "Inimigos fortes · bênção rara"),
            ["sobrevivencia"] = R("sobrevivencia", "Sobrevivência", 0xffd34a, "boon", "Aguente o tempo"),
            ["duelo"] = R("duelo", "Duelo", 0xff5a6e, "boon+", "Só aparos causam dano"),
            ["flechas"] = R("flechas", "Chuva de Flechas", 0x5ce1ff, "boon", "Reflita para vencer"),
            ["santuario"] = R("santuario", "Santuário", 0x9affd0, "heal", "Descanso + bênção"),
            ["chefe"] = R("chefe", "Chefe", 0xff3030, "boss", "Guardião do andar"),
            ["profundezas"] = R("profundezas", "As Profundezas", 0xe8c27a, "none", "Iniciar expedição"),
        };
    }

    public class FloorTheme
    {
        public string name;
        public Color fog, floor, wall, accent, light;
        public float ambient = 1f, points = 1f;
    }

    public static class Floors
    {
        static FloorTheme F(string n, int fog, int floor, int wall, int accent, int light, float ambient = 1f, float points = 1f) =>
            new FloorTheme { name = n, fog = EcoMath.Hex(fog), floor = EcoMath.Hex(floor), wall = EcoMath.Hex(wall), accent = EcoMath.Hex(accent), light = EcoMath.Hex(light), ambient = ambient, points = points };

        public static readonly FloorTheme Hub = F("Mosteiro do Eco", 0x1a1c26, 0x45403a, 0x56504a, 0xe8c27a, 0xffe2b8, 0.6f, 0.5f);
        public static readonly FloorTheme[] All =
        {
            F("Cripta Esquecida", 0x120f1c, 0x2a2638, 0x3a3450, 0x7a6cff, 0x9a8cff),
            F("Forja Rubra", 0x1c0d0a, 0x382420, 0x4a2c24, 0xff6a2a, 0xffa070),
            F("Abismo Glacial", 0x0a141c, 0x1e2c38, 0x2a4050, 0x5ce1ff, 0x9ae8ff),
        };
    }

    // ---------------- Save ----------------
    [Serializable] public class IntEntry { public string key; public int value; }

    [Serializable]
    public class StoryState
    {
        public bool prologo;
        public string classe = "";
        public string last = "";
        public int bosses;
    }

    [Serializable]
    public class SaveData
    {
        public int ecos, runs, wins, deaths, best;
        public List<IntEntry> meta = new List<IntEntry>();
        public List<IntEntry> skills = new List<IntEntry>(); // chave "classe/no"
        public StoryState story = new StoryState();

        static int Get(List<IntEntry> l, string k) { foreach (var e in l) if (e.key == k) return e.value; return 0; }
        static void Set(List<IntEntry> l, string k, int v) { foreach (var e in l) if (e.key == k) { e.value = v; return; } l.Add(new IntEntry { key = k, value = v }); }

        public int Meta(string id) => Get(meta, id);
        public void SetMeta(string id, int v) => Set(meta, id, v);
        public int Skill(string cls, string node) => Get(skills, cls + "/" + node);
        public void SetSkill(string cls, string node, int v) => Set(skills, cls + "/" + node, v);
        public void ClearSkills(string cls) => skills.RemoveAll(e => e.key.StartsWith(cls + "/"));

        static string FilePath => System.IO.Path.Combine(Application.persistentDataPath, "eco-da-lamina-save.json");

        public static SaveData Load()
        {
            try
            {
                if (System.IO.File.Exists(FilePath))
                {
                    var s = JsonUtility.FromJson<SaveData>(System.IO.File.ReadAllText(FilePath));
                    if (s != null) { s.story = s.story ?? new StoryState(); return s; }
                }
            }
            catch (Exception e) { Debug.LogWarning("[save] não foi possível ler: " + e.Message); }
            return new SaveData();
        }

        public void Write()
        {
            try { System.IO.File.WriteAllText(FilePath, JsonUtility.ToJson(this, true)); }
            catch (Exception e) { Debug.LogWarning("[save] não foi possível gravar: " + e.Message); }
        }
    }
}
