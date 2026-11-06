using System.Collections.Generic;
using UnityEngine;

namespace Eco
{
    public enum StrikeResult { Miss, Parried, Dodged, Hit }

    public class Enemy
    {
        static readonly Color Red = EcoMath.Hex(0xff2a2a), Orange = EcoMath.Hex(0xff8a00), Yellow = EcoMath.Hex(0xffd34a);
        enum St { Move, Windup, Active, Recover, Stagger }

        public readonly string type;
        public readonly EnemyDef def;
        public readonly bool elite, stationary;
        public float hp, hpMax, posture, postureMax, dmgMult, speed, radius, baseY, facing;
        public Vector3 pos;
        public bool dead, broken, removed;
        public float cooldown;
        public AttackDef atk;
        public float atkWindup;
        public int phase = 1;
        public readonly ICharacterVisual model;

        readonly GameManager game;
        St state = St.Move;
        float t, stunT, postureIdle, flinch, strafeTimer, deathT;
        int strafeDir;
        Vector3 knock, lastPos;
        bool hitThisLunge;
        readonly Transform area;
        readonly Material areaMat;
        readonly Transform aura;

        public bool IsStunned => state == St.Stagger;
        public bool InWindup => state == St.Windup;
        public float WindupRemaining => atkWindup - t;
        public Vector3 Center => new Vector3(pos.x, baseY + def.height * 0.6f, pos.z);
        public Vector3 ForwardDir => EcoMath.Forward(facing);

        public Enemy(GameManager game, string type, Vector3 pos, float scale = 1, float dmgScale = 1, bool elite = false, bool stationary = false)
        {
            this.game = game; this.type = type; def = EnemyDefs.All[type];
            this.elite = elite; this.stationary = stationary;
            hpMax = hp = def.hp * scale * (elite ? 1.8f : 1);
            postureMax = def.posture * (elite ? 1.4f : 1);
            dmgMult = dmgScale * (elite ? 1.3f : 1);
            speed = def.speed * (elite ? 1.1f : 1);
            radius = def.radius * (elite ? 1.15f : 1);
            this.pos = pos; baseY = pos.y; lastPos = pos;
            cooldown = 0.8f + Random.value * 1.2f;
            strafeDir = Random.value < 0.5f ? 1 : -1;

            model = ModelLibrary.Create(type, new RigOptions
            {
                height = def.height, color = def.color, weapon = def.weapon, weaponLeft = def.weapon == "bow",
                crown = def.boss, cape = def.boss ? EcoMath.Hex(0x400818) : (Color?)null, hood = def.hood,
            });
            model.Root.SetParent(game.World, false);
            if (elite)
            {
                model.Root.localScale = Vector3.one * 1.15f;
                aura = Mats.Prim(PrimitiveType.Cylinder, model.Root, Mats.UnlitShared(EcoMath.Hex(0xff7af5)), new Vector3(0, 0.05f, 0), new Vector3(def.radius * 2.6f, 0.01f, def.radius * 2.6f), "aura").transform;
            }
            model.Root.position = pos;

            areaMat = Mats.NewTransparent(new Color(Orange.r, Orange.g, Orange.b, 0));
            area = Mats.Prim(PrimitiveType.Cylinder, game.World, areaMat, new Vector3(pos.x, 0.02f, pos.z), new Vector3(1, 0.005f, 1), "area").transform;
        }

        static AttackDef PickWeighted(List<AttackDef> list)
        {
            float total = 0; foreach (var a in list) total += a.weight;
            float r = Random.value * total;
            foreach (var a in list) { r -= a.weight; if (r <= 0) return a; }
            return list[0];
        }

        void StartAttack(AttackDef a)
        {
            atk = a;
            atkWindup = a.windupMax > 0 ? Random.Range(a.windup, a.windupMax) : a.windup;
            if (phase == 2) atkWindup *= 0.85f;
            state = St.Windup; t = 0; hitThisLunge = false;
            model.Play(a.kind == AtkKind.Slam || a.kind == AtkKind.Summon ? "windup_heavy" : a.kind == AtkKind.Shoot ? "aim" : "windup", atkWindup);
            Sfx.Play(a.unparryable ? "windupHeavy" : "windup");
        }

        void TurnTo(float target, float dt, float rate)
        {
            float d = EcoMath.WrapAngle(target - facing);
            facing += Mathf.Clamp(d, -rate * dt, rate * dt);
        }

        public void Update(float dt)
        {
            var player = game.player;
            if (dead)
            {
                deathT += dt;
                model.Tick(dt, 0);
                model.Root.position = new Vector3(pos.x, baseY - Mathf.Max(0, deathT - 0.6f) * 1.2f, pos.z);
                if (deathT > 1.2f) Remove();
                return;
            }

            var toP = EcoMath.Flat(player.pos - pos);
            float dist = toP.magnitude;
            float desired = EcoMath.YawOf(toP);

            postureIdle += dt;
            if (postureIdle > 2 && !broken) posture = Mathf.Max(0, posture - postureMax * 0.12f * dt);
            if (knock.sqrMagnitude > 0.001f) { pos += knock * dt; knock *= Mathf.Max(0, 1 - dt * 8); }
            flinch = Mathf.Max(0, flinch - dt * 5);

            float glowK = 0; Color glowColor = Red;

            switch (state)
            {
                case St.Stagger:
                    stunT -= dt;
                    if (stunT <= 0)
                    {
                        state = St.Move; broken = false;
                        if (posture >= postureMax) posture = 0;
                        cooldown = 0.3f + Random.value * 0.5f;
                    }
                    break;

                case St.Move:
                {
                    TurnTo(desired, dt, 6);
                    cooldown -= dt;
                    if (!stationary)
                    {
                        var move = Vector3.zero;
                        var dir = toP.normalized;
                        var side = new Vector3(-dir.z, 0, dir.x) * strafeDir;
                        strafeTimer -= dt;
                        if (strafeTimer <= 0) { strafeTimer = 1 + Random.value * 2; if (Random.value < 0.4f) strafeDir *= -1; }
                        if (def.ranged)
                        {
                            if (dist < def.prefer - 2) move -= dir; else if (dist > def.prefer + 3) move += dir;
                            move += side * 0.7f;
                        }
                        else
                        {
                            if (dist > def.prefer) move += dir; else if (dist < def.prefer * 0.6f) move -= dir * 0.6f;
                            if (dist < 6) move += side * 0.45f;
                        }
                        foreach (var o in game.enemies)
                        {
                            if (o == this || o.dead) continue;
                            float dx = pos.x - o.pos.x, dz = pos.z - o.pos.z, d = Mathf.Sqrt(dx * dx + dz * dz), min = radius + o.radius + 0.5f;
                            if (d < min && d > 0.001f) move += new Vector3(dx / d, 0, dz / d) * (min - d) * 1.5f;
                        }
                        if (move.sqrMagnitude > 1) move.Normalize();
                        pos += move * speed * dt;
                    }
                    if (cooldown <= 0)
                    {
                        var pool = new List<AttackDef>(def.attacks);
                        if (phase == 2 && def.phase2 != null) pool.AddRange(def.phase2);
                        var usable = pool.FindAll(a =>
                        {
                            switch (a.kind)
                            {
                                case AtkKind.Melee: case AtkKind.Slam: return dist < a.reach + 1.5f;
                                case AtkKind.Lunge: return dist > a.minDist && dist < 12;
                                case AtkKind.Shoot: case AtkKind.Fan: return dist < a.range && (stationary || !game.room.Blocked(pos, player.pos));
                                case AtkKind.Summon: return game.enemies.FindAll(e => !e.dead).Count < 4;
                            }
                            return true;
                        });
                        if (usable.Count > 0) StartAttack(PickWeighted(usable));
                    }
                    break;
                }

                case St.Windup:
                {
                    t += dt;
                    float remain = atkWindup - t;
                    // Gira rápido no começo e devagar no fim: dá para sair pelo lado
                    TurnTo(desired, dt, remain > 0.25f ? 7 : 1.5f);
                    float k = Mathf.Min(1, t / atkWindup);
                    glowK = 0.3f + k * 2.5f + (remain < 0.14f ? 5 : 0);
                    glowColor = atk.unparryable ? Orange : Red;
                    if (atk.kind == AtkKind.Slam)
                    {
                        area.position = new Vector3(pos.x, 0.02f, pos.z);
                        area.localScale = new Vector3(atk.reach * 2, 0.005f, atk.reach * 2);
                        var c = areaMat.color; c.a = 0.15f + k * 0.3f; areaMat.color = c;
                    }
                    if (t >= atkWindup) Execute();
                    break;
                }

                case St.Active:
                    t += dt;
                    pos += ForwardDir * atk.dash * dt;
                    glowK = 4; glowColor = Orange;
                    if (!hitThisLunge && game.EnemyStrike(this, atk) != StrikeResult.Miss) hitThisLunge = true;
                    if (t >= atk.dashTime) { state = St.Recover; t = 0; }
                    break;

                case St.Recover:
                    t += dt;
                    if (t >= atk.recover)
                    {
                        if (atk.chain != null) StartAttack(atk.chain);
                        else
                        {
                            state = St.Move;
                            cooldown = (def.boss ? 0.5f : 0.9f) + Random.value * (def.ranged ? 1.5f : 1f);
                            if (phase == 2) cooldown *= 0.6f;
                        }
                    }
                    break;
            }

            if (state != St.Windup) { var c = areaMat.color; c.a = Mathf.Max(0, c.a - dt * 3); areaMat.color = c; }

            if (!stationary) game.room.Collide(ref pos, radius);
            model.Root.position = new Vector3(pos.x, baseY, pos.z);
            model.Root.rotation = Quaternion.Euler(0, facing * EcoMath.Deg, 0);
            if (aura) aura.Rotate(0, dt * 115, 0);

            float moved = EcoMath.FlatDist(pos, lastPos) / Mathf.Max(dt, 1e-4f);
            lastPos = pos;
            if (state == St.Stagger) model.Play("stagger");
            else if (state == St.Move) model.Play(moved > 0.6f ? "run" : "idle");
            model.Tick(dt, moved);

            if (glowK > 0) model.SetGlow(glowColor, glowK);
            else if (state == St.Stagger) model.SetGlow(Yellow, 2 + Mathf.Sin(stunT * 30));
            else model.SetGlow(null);

            if (def.boss && phase == 1 && hp < hpMax * 0.5f)
            {
                phase = 2;
                game.fx.Callout("O ARAUTO ENFURECE", EcoMath.Hex(0xff3030), 1.4f);
                game.fx.AddShake(0.6f);
                speed *= 1.25f;
            }
        }

        void Execute()
        {
            var a = atk;
            t = 0;
            switch (a.kind)
            {
                case AtkKind.Melee:
                    model.Play("strike", 0.2f);
                    game.EnemyStrike(this, a);
                    if (state == St.Windup) state = St.Recover;
                    break;
                case AtkKind.Lunge:
                    model.Play("lunge", a.dashTime);
                    state = St.Active;
                    break;
                case AtkKind.Slam:
                    model.Play("strike_heavy", 0.25f);
                    game.EnemyStrike(this, a);
                    game.SpawnShockwave(pos, a.wave, this);
                    Sfx.Play("slam");
                    game.fx.AddShake(0.4f);
                    game.fx.Burst(new Vector3(pos.x, 0.2f, pos.z), Orange, 20, 8, 0.6f);
                    if (state == St.Windup) state = St.Recover;
                    break;
                case AtkKind.Shoot:
                case AtkKind.Fan:
                {
                    model.Play("strike", 0.2f);
                    var origin = new Vector3(pos.x, baseY + def.height * 0.75f, pos.z);
                    var target = game.player.Eye - new Vector3(0, 0.4f, 0) + game.player.vel * 0.25f;
                    var dir = (target - origin).normalized;
                    int n = a.kind == AtkKind.Fan ? a.count : 1;
                    for (int i = 0; i < n; i++)
                    {
                        float ang = n > 1 ? (i / (float)(n - 1) - 0.5f) * a.spread : 0;
                        var d = Quaternion.AngleAxis(ang * EcoMath.Deg, Vector3.up) * dir;
                        game.SpawnProjectile(origin + d * (radius + 0.3f), d * a.speed, a.damage * dmgMult, a.unparryable, this);
                    }
                    Sfx.Play("shoot");
                    state = St.Recover;
                    break;
                }
                case AtkKind.Summon:
                    foreach (var s in a.summon) game.SummonNear(s, pos);
                    game.fx.RingFx(pos, EcoMath.Hex(0xff3030), 6, 0.5f);
                    state = St.Recover;
                    break;
            }
        }

        // Aparado pelo jogador
        public void OnParried(float postureDmg)
        {
            AddPosture(postureDmg);
            if (state == St.Stagger) return;
            if (!def.heavy || broken) { state = St.Stagger; stunT = broken ? 2.2f : 0.9f; }
            else
            {
                // Pesados só perdem o golpe atual; a corrente continua
                flinch = 1; model.Flinch(1);
                state = St.Recover; t = 0;
                if (atk != null && atk.recover < 0.5f) { var copy = (AttackDef)atk.MemberwiseCloneSafe(); copy.recover = 0.5f; atk = copy; }
            }
        }

        public void AddPosture(float v)
        {
            posture += v;
            postureIdle = 0;
            if (posture >= postureMax && !broken)
            {
                posture = postureMax;
                broken = true;
                state = St.Stagger;
                stunT = 2.2f;
                atk = null;
                Sfx.Play("stagger");
                game.fx.Callout("POSTURA QUEBRADA", Yellow, 0.8f);
            }
        }

        public void TakeDamage(float d, Vector3? knockDir = null, float knockPower = 0)
        {
            hp -= d;
            flinch = 1;
            model.Flinch(1);
            if (knockDir.HasValue && !def.heavy && !stationary) knock += knockDir.Value * knockPower;
            if (hp <= 0 && def.training) { hp = hpMax; game.fx.Callout("BONECO RESTAURADO", EcoMath.Hex(0xe8c27a), 0.6f); return; }
            if (hp <= 0) Die();
        }

        public void Die()
        {
            if (dead) return;
            dead = true; hp = 0;
            Sfx.Play("death");
            var c = areaMat.color; c.a = 0; areaMat.color = c;
            model.SetGlow(null);
            model.Play("death", 0.6f);
            game.OnEnemyKilled(this);
        }

        public void Remove()
        {
            if (removed) return;
            removed = true;
            model.Dispose();
            if (area) Object.Destroy(area.gameObject);
        }
    }

    static class AttackDefExt
    {
        // Cópia rasa para não alterar a definição compartilhada.
        public static object MemberwiseCloneSafe(this AttackDef a) => new AttackDef
        {
            kind = a.kind, windup = a.windup, windupMax = a.windupMax, reach = a.reach, arc = a.arc, damage = a.damage, recover = a.recover,
            weight = a.weight, posture = a.posture, unparryable = a.unparryable, dash = a.dash, dashTime = a.dashTime, minDist = a.minDist,
            speed = a.speed, spread = a.spread, range = a.range, count = a.count, wave = a.wave, summon = a.summon, chain = a.chain,
        };
    }
}
