using System;
using System.Collections.Generic;

namespace Eco
{
    /*
     * ÁRVORES DE HABILIDADE
     * Cada caminho tem 3 ramos; os nós de um ramo são comprados em ordem com Ecos.
     * Técnicas especiais: [R] habilidade com recarga (Stats.abilityR) e
     * [V] golpe supremo que gasta a Ressonância cheia (Stats.ultimate).
     */
    public class SkillNode
    {
        public string id, name, desc, tag; // tag: "R", "V", "passiva" ou null
        public int[] cost;
        public Action<Stats, int> apply;
    }

    public class SkillBranch
    {
        public string id, name, desc;
        public SkillNode[] nodes;
    }

    public class SkillTree
    {
        public string name;
        public SkillBranch[] branches;
    }

    public enum NodeStatus { Max, Disponivel, Caro, Bloqueado }

    public static class Skills
    {
        static SkillNode N(string id, string name, string desc, int[] cost, Action<Stats, int> apply, string tag = null) =>
            new SkillNode { id = id, name = name, desc = desc, cost = cost, apply = apply, tag = tag };

        public static readonly Dictionary<string, SkillTree> Trees = new Dictionary<string, SkillTree>
        {
            ["mago"] = new SkillTree
            {
                name = "Mão Aberta",
                branches = new[]
                {
                    new SkillBranch { id = "arcano", name = "Arcano", desc = "Força dos dardos", nodes = new[] {
                        N("m_afiado", "Dardos Afiados", "+12% de dano por nível.", new[] { 15, 25, 40 }, (s, l) => s.dmgMult += 0.12f * l),
                        N("m_perfura", "Dardo Perfurante", "Dardos atravessam 1 inimigo.", new[] { 35 }, (s, l) => s.pierce += 1),
                        N("m_orbe", "Orbe Instável", "A explosão do 3º dardo fica 50% maior e quebra mais postura.", new[] { 50 }, (s, l) => s.orbMult = 1.5f),
                        N("m_raio", "Cadeia de Raios", "Um raio salta entre até 4 inimigos. Recarga de 6 s.", new[] { 80 }, (s, l) => s.abilityR = "raio", "R"),
                    } },
                    new SkillBranch { id = "selo", name = "Selo", desc = "Aparo e reflexo", nodes = new[] {
                        N("m_amplo", "Selo Amplo", "Janela de aparo +15% por nível.", new[] { 20, 35 }, (s, l) => s.parryWindowMult += 0.15f * l),
                        N("m_espelho", "Espelho Rúnico", "Projéteis refletidos causam +150% de dano e voam 30% mais rápido.", new[] { 35 }, (s, l) => { s.reflectMult += 1.5f; s.reflectSpeed *= 1.3f; }),
                        N("m_explosivo", "Selo Explosivo", "Cada aparo libera uma onda de 18 de dano ao redor.", new[] { 50 }, (s, l) => s.parryShockwave += 18),
                        N("m_tempestade", "Tempestade de Ecos", "Golpe supremo: 3 s de raios caindo sobre todos os inimigos próximos.", new[] { 90 }, (s, l) => s.ultimate = "tempestade", "V"),
                    } },
                    new SkillBranch { id = "fluxo", name = "Fluxo", desc = "Lampejo e tempo", nodes = new[] {
                        N("m_longo", "Lampejo Longo", "Esquiva 25% mais longa.", new[] { 15 }, (s, l) => s.dodgeDistMult *= 1.25f),
                        N("m_carga", "Carga Extra", "+1 carga de esquiva.", new[] { 35 }, (s, l) => s.dashCharges += 1),
                        N("m_rastro", "Rastro Arcano", "Cada esquiva deixa uma runa que explode (25 de dano).", new[] { 45 }, (s, l) => s.dodgeMine += 25),
                        N("m_temporal", "Eco Temporal", "Câmera lenta 50% mais longa e todo dardo nela é crítico.", new[] { 80 }, (s, l) => { s.slowmo *= 1.5f; s.ecoTemporal = true; }, "passiva"),
                    } },
                },
            },
            ["punhos"] = new SkillTree
            {
                name = "Punho Fechado",
                branches = new[]
                {
                    new SkillBranch { id = "punho", name = "Punho", desc = "Força dos golpes", nodes = new[] {
                        N("p_ferro", "Nós de Ferro", "+12% de dano por nível.", new[] { 15, 25, 40 }, (s, l) => s.dmgMult += 0.12f * l),
                        N("p_ritmo", "Ritmo", "+15% de velocidade de ataque.", new[] { 35 }, (s, l) => s.attackSpeed += 0.15f),
                        N("p_terremoto", "Terremoto", "O 3º golpe abala uma área 50% maior e quebra mais postura.", new[] { 50 }, (s, l) => s.quakeMult = 1.5f),
                        N("p_dragao", "Investida do Dragão", "Avança atravessando inimigos, invulnerável (35 de dano). Recarga de 5 s.", new[] { 80 }, (s, l) => s.abilityR = "dragao", "R"),
                    } },
                    new SkillBranch { id = "guarda", name = "Guarda", desc = "Aparo e contra-ataque", nodes = new[] {
                        N("p_firme", "Guarda Firme", "Janela de aparo +15% por nível.", new[] { 20, 35 }, (s, l) => s.parryWindowMult += 0.15f * l),
                        N("p_contra", "Contragolpe", "O primeiro golpe até 1,2 s depois de um aparo causa dano dobrado e cura 4.", new[] { 35 }, (s, l) => s.counterHit = true),
                        N("p_ossos", "Quebra-Ossos", "+50% de dano de postura.", new[] { 50 }, (s, l) => s.postureMult += 0.5f),
                        N("p_cem", "Cem Punhos", "Golpe supremo: 2 s de socos em sequência à frente, invulnerável.", new[] { 90 }, (s, l) => s.ultimate = "cem", "V"),
                    } },
                    new SkillBranch { id = "passo", name = "Passo", desc = "Movimento e resistência", nodes = new[] {
                        N("p_leve", "Passo Leve", "+10% de velocidade de movimento.", new[] { 15 }, (s, l) => s.moveSpeed += 0.1f),
                        N("p_dupla", "Esquiva Dupla", "+1 carga de esquiva.", new[] { 35 }, (s, l) => s.dashCharges += 1),
                        N("p_contraesq", "Contra-Esquiva", "Esquiva perfeita acerta o inimigo mais próximo (30 de dano e postura).", new[] { 45 }, (s, l) => s.contraEsquiva = true),
                        N("p_pedra", "Corpo de Pedra", "+40 de vida máxima e 15% menos dano recebido.", new[] { 80 }, (s, l) => { s.maxHp += 40; s.damageTaken *= 0.85f; }, "passiva"),
                    } },
                },
            },
        };

        public static readonly Dictionary<string, (string name, float cooldown)> Abilities = new Dictionary<string, (string, float)>
        {
            ["raio"] = ("Cadeia de Raios", 6f),
            ["dragao"] = ("Investida do Dragão", 5f),
            ["tempestade"] = ("Tempestade de Ecos", 0f),
            ["cem"] = ("Cem Punhos", 0f),
        };

        static bool Find(string cls, string nodeId, out SkillBranch branch, out int index)
        {
            foreach (var b in Trees[cls].branches)
                for (int i = 0; i < b.nodes.Length; i++)
                    if (b.nodes[i].id == nodeId) { branch = b; index = i; return true; }
            branch = null; index = -1; return false;
        }

        public static NodeStatus Status(SaveData save, string cls, string nodeId)
        {
            Find(cls, nodeId, out var b, out var i);
            var node = b.nodes[i];
            int lvl = save.Skill(cls, nodeId);
            if (lvl >= node.cost.Length) return NodeStatus.Max;
            if (i > 0 && save.Skill(cls, b.nodes[i - 1].id) == 0) return NodeStatus.Bloqueado;
            return save.ecos >= node.cost[lvl] ? NodeStatus.Disponivel : NodeStatus.Caro;
        }

        public static bool Buy(SaveData save, string cls, string nodeId)
        {
            if (Status(save, cls, nodeId) != NodeStatus.Disponivel) return false;
            Find(cls, nodeId, out var b, out var i);
            int lvl = save.Skill(cls, nodeId);
            save.ecos -= b.nodes[i].cost[lvl];
            save.SetSkill(cls, nodeId, lvl + 1);
            return true;
        }

        public static int Reset(SaveData save, string cls)
        {
            int refund = 0;
            foreach (var b in Trees[cls].branches)
                foreach (var n in b.nodes)
                    for (int l = 0; l < save.Skill(cls, n.id); l++) refund += n.cost[l];
            save.ecos += refund;
            save.ClearSkills(cls);
            return refund;
        }

        public static Stats Apply(Stats s, SaveData save, string cls)
        {
            if (string.IsNullOrEmpty(cls) || !Trees.ContainsKey(cls)) return s;
            foreach (var b in Trees[cls].branches)
                foreach (var n in b.nodes)
                {
                    int lvl = save.Skill(cls, n.id);
                    if (lvl > 0) n.apply(s, lvl);
                }
            return s;
        }
    }
}
