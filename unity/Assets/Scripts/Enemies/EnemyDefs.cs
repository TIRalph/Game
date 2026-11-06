using System.Collections.Generic;
using UnityEngine;

namespace Eco
{
    public enum AtkKind { Melee, Lunge, Shoot, Fan, Slam, Summon }

    public class WaveDef { public float speed, maxR, damage; }

    public class AttackDef
    {
        public AtkKind kind;
        public float windup, windupMax;    // windupMax > 0 = tempo aleatório (finta)
        public float reach, arc, damage, recover, weight = 1, posture = 1;
        public bool unparryable;
        public float dash, dashTime, minDist;          // investida
        public float speed, spread, range = 30; public int count = 1; // projéteis
        public WaveDef wave;
        public string[] summon;
        public AttackDef chain;
    }

    public class EnemyDef
    {
        public string name, weapon = "blade";
        public float hp, posture, speed, radius, height, prefer;
        public Color color;
        public Color? hood;
        public bool ranged, heavy, boss, training;
        public List<AttackDef> attacks = new List<AttackDef>();
        public List<AttackDef> phase2;
    }

    public static class EnemyDefs
    {
        static AttackDef Melee(float windup, float reach, float arc, float dmg, float recover, float weight = 1, AttackDef chain = null, bool unparryable = false, float posture = 1, float windupMax = 0) =>
            new AttackDef { kind = AtkKind.Melee, windup = windup, windupMax = windupMax, reach = reach, arc = arc, damage = dmg, recover = recover, weight = weight, chain = chain, unparryable = unparryable, posture = posture };

        public static readonly Dictionary<string, EnemyDef> All = new Dictionary<string, EnemyDef>
        {
            ["carcereiro"] = new EnemyDef
            {
                name = "Carcereiro", hp = 60, posture = 55, speed = 3.8f, radius = 0.5f, height = 1.9f, color = EcoMath.Hex(0x6a6480), weapon = "blade", prefer = 2,
                attacks = {
                    Melee(0.7f, 2.4f, 0.9f, 12, 0.7f, 3),
                    Melee(0.6f, 2.4f, 0.9f, 10, 0.15f, 2, Melee(0.38f, 2.5f, 0.9f, 10, 0.8f)),
                },
            },
            ["atirador"] = new EnemyDef
            {
                name = "Atirador", hp = 40, posture = 40, speed = 3.2f, radius = 0.45f, height = 1.8f, color = EcoMath.Hex(0x4a6a60), weapon = "bow", prefer = 11, ranged = true,
                attacks = {
                    new AttackDef { kind = AtkKind.Shoot, windup = 0.9f, damage = 10, speed = 17, recover = 1.0f, weight = 4 },
                    new AttackDef { kind = AtkKind.Shoot, windup = 1.2f, damage = 18, speed = 13, recover = 1.2f, weight = 1, unparryable = true },
                },
            },
            ["bruto"] = new EnemyDef
            {
                name = "Bruto", hp = 170, posture = 140, speed = 2.7f, radius = 0.9f, height = 2.7f, color = EcoMath.Hex(0x7a4a3a), weapon = "club", prefer = 2.6f, heavy = true,
                attacks = {
                    Melee(0.95f, 3.3f, 1.0f, 22, 0.9f, 3, posture: 1.4f),
                    new AttackDef { kind = AtkKind.Slam, windup = 1.15f, reach = 2.8f, damage = 26, recover = 1.2f, weight = 2, unparryable = true, wave = new WaveDef { speed = 9, maxR = 13, damage = 14 } },
                },
            },
            ["duelista"] = new EnemyDef
            {
                name = "Duelista", hp = 75, posture = 70, speed = 5.2f, radius = 0.45f, height = 1.85f, color = EcoMath.Hex(0x5a3a6a), weapon = "rapier", prefer = 2.2f,
                attacks = {
                    // Finta: o tempo de preparação varia a cada ataque
                    Melee(0.4f, 2.6f, 0.7f, 13, 0.6f, 3, windupMax: 1.15f),
                    new AttackDef { kind = AtkKind.Lunge, windup = 0.75f, reach = 1.6f, arc = 1.0f, damage = 18, recover = 0.8f, weight = 2, unparryable = true, dash = 15, dashTime = 0.32f, minDist = 4 },
                    Melee(0.55f, 2.5f, 0.8f, 8, 0.08f, 2, Melee(0.28f, 2.5f, 0.8f, 8, 0.08f, 1, Melee(0.5f, 2.6f, 0.8f, 12, 0.9f))),
                },
            },
            // Boneco de treino do mosteiro: ataques lentos e sem dano, nunca morre.
            ["boneco"] = new EnemyDef
            {
                name = "Boneco de Treino", hp = 400, posture = 90, speed = 0, radius = 0.5f, height = 1.8f, color = EcoMath.Hex(0x8a6a40), hood = EcoMath.Hex(0x5a4020), weapon = "blade", prefer = 2, training = true,
                attacks = {
                    Melee(1.1f, 2.6f, 1.2f, 0, 1.0f, 3),
                    Melee(1.3f, 2.6f, 1.2f, 0, 1.0f, 1, unparryable: true),
                    new AttackDef { kind = AtkKind.Slam, windup = 1.4f, reach = 2.4f, damage = 0, recover = 1.2f, weight = 1, unparryable = true, wave = new WaveDef { speed = 7, maxR = 9, damage = 0 } },
                },
            },
            ["arauto"] = new EnemyDef
            {
                name = "O Arauto", hp = 900, posture = 260, speed = 3.4f, radius = 1.2f, height = 3.6f, color = EcoMath.Hex(0x2a2440), weapon = "greatsword", prefer = 3, boss = true, heavy = true,
                attacks = {
                    Melee(0.8f, 3.8f, 1.1f, 16, 0.12f, 3, Melee(0.42f, 3.8f, 1.1f, 16, 0.12f, 1, Melee(0.95f, 4.0f, 1.2f, 24, 1.0f, 1, posture: 1.2f), posture: 0.8f), posture: 0.8f),
                    new AttackDef { kind = AtkKind.Lunge, windup = 0.85f, reach = 2.2f, arc = 1.0f, damage = 28, recover = 1.0f, weight = 2, unparryable = true, dash = 20, dashTime = 0.4f, minDist = 5 },
                    new AttackDef { kind = AtkKind.Slam, windup = 1.1f, reach = 3.5f, damage = 30, recover = 1.0f, weight = 2, unparryable = true, wave = new WaveDef { speed = 10, maxR = 20, damage = 18 } },
                    new AttackDef { kind = AtkKind.Fan, windup = 0.9f, damage = 14, speed = 15, count = 5, spread = 0.9f, recover = 1.0f, weight = 2, range = 40 },
                },
                phase2 = new List<AttackDef> {
                    new AttackDef { kind = AtkKind.Slam, windup = 0.9f, reach = 3.5f, damage = 30, recover = 0.3f, weight = 2, unparryable = true, wave = new WaveDef { speed = 11, maxR = 20, damage = 18 },
                        chain = new AttackDef { kind = AtkKind.Slam, windup = 0.6f, reach = 3.5f, damage = 30, recover = 1.0f, unparryable = true, wave = new WaveDef { speed = 13, maxR = 20, damage = 18 } } },
                    new AttackDef { kind = AtkKind.Fan, windup = 0.7f, damage = 14, speed = 17, count = 9, spread = 1.6f, recover = 0.4f, weight = 2, range = 40,
                        chain = new AttackDef { kind = AtkKind.Fan, windup = 0.45f, damage = 14, speed = 17, count = 7, spread = 1.2f, recover = 1.0f, range = 40 } },
                    new AttackDef { kind = AtkKind.Summon, windup = 1.0f, recover = 0.8f, weight = 1, summon = new[] { "carcereiro", "atirador" } },
                },
            },
        };
    }
}
