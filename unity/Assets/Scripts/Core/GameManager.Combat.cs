using System.Collections.Generic;
using UnityEngine;

namespace Eco
{
    public partial class GameManager
    {
        class Mine { public Vector3 pos; public float t; }
        readonly List<Mine> mines = new List<Mine>();
        HashSet<Enemy> dragonHits;
        float ultTick;

        static readonly Color Gold = EcoMath.Hex(0xffd34a), Cyan = EcoMath.Hex(0x5ce1ff), Violet = EcoMath.Hex(0xbfa8ff), Peach = EcoMath.Hex(0xffb27a);

        // ---------- Golpes do jogador ----------
        public void PlayerStrike(int combo)
        {
            var p = player; var w = p.cls; var st = run.stats;
            if (w.bolt) { CastBolt(combo); return; }
            var fwd = p.AimForward;
            float mult = w.comboMults[combo];
            float fury = st.fury ? 1 + p.fury * 0.1f : 1;
            bool hitAny = false, critAny = false;
            foreach (var e in enemies.ToArray())
            {
                if (e.dead || e.baseY > 1.5f) continue;
                var to = EcoMath.Flat(e.pos - p.pos);
                float d = to.magnitude - e.radius;
                if (d > w.range) continue;
                if (d > 0.6f && Vector3.Dot(fwd, to.normalized) < w.arc) continue;
                float dmg = w.damage * st.dmgMult * mult * fury;
                bool crit = false;
                if (p.critNext) { dmg *= w.perfectDodgeCrit; crit = true; }
                if (e.IsStunned) { dmg *= e.broken ? st.executeMult : st.riposteMult; crit = true; }
                if (st.counterHit && p.counterT > 0) { dmg *= 2; crit = true; p.Heal(4); }
                float postureDmg = 7 * w.postureMult * st.postureMult * mult;
                if (rs.duel && !e.IsStunned && !p.critNext)
                {
                    e.AddPosture(postureDmg * 1.5f);
                    fx.Num(e.pos, "BLOQUEADO", false, Color.gray);
                    fx.Burst(e.Center, new Color(0.8f, 0.8f, 0.8f), 5, 3, 0.25f);
                    Sfx.Play("parryWhiff");
                    hitAny = true;
                    continue;
                }
                int di = Mathf.RoundToInt(dmg);
                e.TakeDamage(di, to.normalized, combo == 2 ? 8 : 4);
                if (!e.dead) e.AddPosture(postureDmg);
                fx.Num(e.pos, di.ToString(), crit);
                fx.Burst(e.Center, crit ? Gold : EcoMath.Hex(0xff4a5a), crit ? 18 : 9, crit ? 7 : 5, 0.4f);
                hitAny = true; critAny |= crit;
                AddResonance(3);
            }
            if (hitAny)
            {
                hitstop = Mathf.Max(hitstop, critAny ? 0.09f : 0.045f);
                fx.AddShake(critAny ? 0.25f : 0.1f);
                Sfx.Play(critAny ? "crit" : "hit");
                p.critNext = false;
                p.counterT = 0;
            }
            if (combo == 2)
            {
                if (w.finisherRadius > 0)
                {
                    float R = w.finisherRadius * st.quakeMult;
                    var c = p.pos + fwd * 1.5f;
                    fx.RingFx(c, w.color, R, 0.35f);
                    fx.AddShake(0.3f);
                    Sfx.Play("slam");
                    foreach (var e in enemies.ToArray())
                    {
                        if (e.dead || e.baseY > 1.5f || rs.duel) continue;
                        if (EcoMath.FlatDist(e.pos, c) < R + e.radius)
                        {
                            int dmg = Mathf.RoundToInt(w.damage * st.dmgMult * w.finisherMult);
                            e.TakeDamage(dmg, EcoMath.Flat(e.pos - c).normalized, 8);
                            if (!e.dead) e.AddPosture(20 * st.postureMult * st.quakeMult);
                            fx.Num(e.pos, dmg.ToString());
                        }
                    }
                }
                if (st.slashWave)
                {
                    var dir = p.AimDir3;
                    var pr = new Projectile(this, p.Eye + dir * 0.8f - Vector3.up * 0.3f, dir * 26, w.damage * st.dmgMult * 0.8f, false, null) { reflected = true, playerShot = true };
                    pr.SetColor(Color.white); pr.SetScale(new Vector3(1.6f, 0.15f, 0.4f));
                    projectiles.Add(pr);
                }
            }
        }

        // Mago: dardo arcano disparado da mão em direção à mira.
        void CastBolt(int combo)
        {
            var p = player; var w = p.cls; var st = run.stats;
            bool heavy = combo == 2;
            var origin = p.Muzzle(combo);
            var aim = AimAssist(origin, 0.985f);
            float fury = st.fury ? 1 + p.fury * 0.1f : 1;
            float dmg = w.damage * st.dmgMult * w.comboMults[combo] * fury;
            bool crit = false;
            if (p.critNext) { dmg *= w.perfectDodgeCrit; crit = true; p.critNext = false; }
            else if (st.ecoTemporal && slowmo > 0) { dmg *= 2; crit = true; }
            void Shoot(float angle)
            {
                var dir = Quaternion.AngleAxis(angle * EcoMath.Deg, Vector3.up) * aim;
                var pr = new Projectile(this, origin, dir * w.boltSpeed * (heavy ? 0.8f : 1), dmg * (angle != 0 ? 0.5f : 1), false, null)
                {
                    reflected = true, playerShot = true, crit = crit, pierce = st.pierce,
                    posture = 6 * w.postureMult * st.postureMult * w.comboMults[combo] * (heavy ? 2 * st.orbMult : 1),
                    aoe = heavy ? 2.4f * st.orbMult : 0,
                };
                pr.SetColor(heavy ? EcoMath.Hex(0xd8c8ff) : w.color);
                if (heavy) pr.SetScale(new Vector3(0.64f, 0.64f, 1.5f));
                projectiles.Add(pr);
            }
            Shoot(0);
            if (heavy && st.slashWave) { Shoot(0.18f); Shoot(-0.18f); }
            Sfx.Play("shoot");
            if (heavy) fx.AddShake(0.08f);
        }

        // Direção da mira a partir de `origin`, puxada para o inimigo mais perto do centro da tela.
        public Vector3 AimAssist(Vector3 origin, float cone = 0.97f)
        {
            var camPos = cam.transform.position;
            var fwd = player.AimDir3;
            Vector3? best = null; float bestDot = cone;
            foreach (var e in enemies)
            {
                if (e.dead) continue;
                var c = e.Center;
                float dot = Vector3.Dot((c - camPos).normalized, fwd);
                if (dot > bestDot) { bestDot = dot; best = c; }
            }
            if (best.HasValue) return (best.Value - origin).normalized;
            return (camPos + fwd * 40 - origin).normalized;
        }

        // ---------- Golpes inimigos ----------
        public StrikeResult EnemyStrike(Enemy e, AttackDef atk)
        {
            var p = player;
            var to = EcoMath.Flat(p.pos - e.pos);
            float d = to.magnitude;
            bool inRange = d <= atk.reach + p.radius;
            if (inRange && atk.kind != AtkKind.Slam && d > 1) inRange = Vector3.Dot(e.ForwardDir, to.normalized) >= Mathf.Cos(atk.arc);
            if (p.pos.y > 2) inRange = false;
            if (!inRange) return StrikeResult.Miss;
            if (p.IsInvulnerable) { if (p.IsPerfectDodge) PerfectDodge(); return StrikeResult.Dodged; }
            if (p.IsParrying && !atk.unparryable) { Parry(e, atk); return StrikeResult.Parried; }
            if (p.IsParrying && atk.unparryable) fx.Callout("INAPARÁVEL!", EcoMath.Hex(0xff8a00), 0.5f);
            DamagePlayer(atk.damage * e.dmgMult, e);
            return StrikeResult.Hit;
        }

        void Parry(Enemy e, AttackDef atk)
        {
            var p = player; var st = run.stats; var w = p.cls;
            run.parries++;
            Sfx.Play("parry");
            fx.Flash(0.3f);
            hitstop = Mathf.Max(hitstop, 0.13f);
            fx.AddShake(0.2f);
            p.parryFlash = 1; p.parryCooldown = 0; p.counterT = 1.2f;
            AddResonance(20);
            if (st.fury) p.fury = Mathf.Min(6, p.fury + 1);
            fx.Burst(p.Eye + cam.transform.forward * 0.9f, EcoMath.Hex(0xffe08a), 22, 7, 0.45f, 0.8f);
            fx.Callout("APARO!", Gold, 0.45f);
            if (e != null)
            {
                e.OnParried(30 * (atk != null ? atk.posture : 1) * w.postureMult * st.postureMult);
                if (rs.duel)
                {
                    int dmg = Mathf.RoundToInt(14 * st.dmgMult);
                    e.TakeDamage(dmg);
                    fx.Num(e.pos, dmg.ToString(), true);
                }
            }
            if (st.parryHeal > 0) p.Heal(st.parryHeal);
            if (st.parryShockwave > 0) AreaDamage(p.pos, 5, st.parryShockwave, Gold);
        }

        void PerfectDodge()
        {
            var p = player; var st = run.stats;
            if (p.perfectUsed == p.dodgeId) return; // uma vez por esquiva
            p.perfectUsed = p.dodgeId;
            run.perfectDodges++;
            slowmo = st.slowmo;
            p.critNext = true;
            p.dashCharges = Mathf.Min(p.MaxDash, p.dashCharges + 1);
            if (st.fury) p.fury = Mathf.Min(6, p.fury + 1);
            Sfx.Play("perfectDodge");
            fx.Callout("ESQUIVA PERFEITA", Cyan, 0.8f);
            fx.Flash(0.2f, Cyan);
            if (st.dodgeExplosion > 0) AreaDamage(p.pos, 4.5f, st.dodgeExplosion, Cyan);
            AddResonance(25);
            if (st.contraEsquiva)
            {
                var e = NearestEnemy(p.pos, 6);
                if (e != null)
                {
                    int d = Mathf.RoundToInt(30 * st.dmgMult);
                    e.TakeDamage(d, EcoMath.Flat(e.pos - p.pos).normalized, 6);
                    if (!e.dead) e.AddPosture(30 * st.postureMult);
                    fx.Num(e.pos, d.ToString(), true, Cyan);
                    fx.BeamFx(new[] { p.pos + Vector3.up * 1.2f, e.pos + Vector3.up * 1.2f }, Cyan, 0.2f);
                    fx.Burst(e.pos + Vector3.up * 1.2f, Cyan, 14, 6, 0.4f);
                    Sfx.Play("crit");
                }
            }
        }

        void AreaDamage(Vector3 center, float radius, float dmg, Color color)
        {
            fx.RingFx(center, color, radius, 0.35f);
            Sfx.Play("explosion");
            foreach (var e in enemies.ToArray())
            {
                if (e.dead) continue;
                if (EcoMath.FlatDist(e.pos, center) < radius + e.radius)
                {
                    int d = Mathf.RoundToInt(dmg * run.stats.dmgMult);
                    e.TakeDamage(d, EcoMath.Flat(e.pos - center).normalized, 6);
                    if (!e.dead) e.AddPosture(15);
                    fx.Num(e.pos, d.ToString(), false, color);
                }
            }
        }

        void DamagePlayer(float dmg, Enemy src)
        {
            var p = player;
            if (p.hurtCooldown > 0 || p.dead) return;
            if (dmg <= 0) // boneco de treino
            {
                p.hurtCooldown = 0.4f;
                fx.Callout("ATINGIDO", EcoMath.Hex(0xff8a8a), 0.4f);
                fx.Hurt(); Sfx.Play("hurt"); p.OnHurt();
                return;
            }
            int di = Mathf.RoundToInt(dmg * run.stats.damageTaken);
            p.OnHurt();
            p.hp -= di;
            p.hurtCooldown = 0.4f;
            p.fury = 0;
            fx.Hurt(); fx.AddShake(0.35f); Sfx.Play("hurt");
            if (src != null && run.stats.thorns > 0 && !src.dead)
            {
                src.TakeDamage(run.stats.thorns);
                fx.Num(src.pos, ((int)run.stats.thorns).ToString(), false, EcoMath.Hex(0x9affd0));
            }
            if (p.hp <= 0)
            {
                if (run.stats.revives > 0)
                {
                    run.stats.revives--;
                    p.hp = Mathf.Round(run.stats.maxHp * 0.5f);
                    fx.Callout("RENASCIDO", EcoMath.Hex(0xff7af5), 1.4f);
                    fx.Flash(0.8f, EcoMath.Hex(0xff7af5));
                    AreaDamage(p.pos, 6, 40, EcoMath.Hex(0xff7af5));
                    p.hurtCooldown = 1.5f;
                }
                else { p.dead = true; EndRun(false); }
            }
        }

        public void SpawnProjectile(Vector3 pos, Vector3 vel, float damage, bool unparryable, Enemy owner) =>
            projectiles.Add(new Projectile(this, pos, vel, damage, unparryable, owner));

        public void SpawnShockwave(Vector3 pos, WaveDef cfg, Enemy owner) { if (cfg != null) waves.Add(new Shockwave(this, pos, cfg, owner)); }

        public void ProjectileVsPlayer(Projectile pr)
        {
            if (pr.ignorePlayer) return;
            var p = player;
            var c = p.Eye - Vector3.up * 0.5f;
            if (Vector3.Distance(pr.pos, c) > 0.9f) return;
            if (p.IsParrying && !pr.unparryable)
            {
                var dir = AimAssist(p.Eye);
                pr.Reflect(dir, run.stats.reflectMult, run.stats.reflectHoming);
                pr.vel *= run.stats.reflectSpeed;
                pr.pos = p.Eye + dir;
                Sfx.Play("reflect");
                Parry(null, null);
                return;
            }
            if (p.IsInvulnerable) { if (p.IsPerfectDodge) PerfectDodge(); pr.ignorePlayer = true; return; }
            DamagePlayer(pr.damage, null);
            pr.Kill();
        }

        public void ProjectileHitEnemy(Projectile pr, Enemy e)
        {
            var st = run.stats;
            if (pr.playerShot)
            {
                float dmg = pr.damage; bool crit = pr.crit;
                if (rs.duel && !e.IsStunned && !crit)
                {
                    e.AddPosture(pr.posture * 1.5f);
                    fx.Num(e.pos, "BLOQUEADO", false, Color.gray);
                    fx.Burst(e.Center, new Color(0.8f, 0.8f, 0.8f), 5, 3, 0.25f);
                    return;
                }
                if (e.IsStunned) { dmg *= e.broken ? st.executeMult : st.riposteMult; crit = true; }
                int di = Mathf.RoundToInt(dmg);
                e.TakeDamage(di, EcoMath.Flat(pr.vel).normalized, 3);
                if (!e.dead) e.AddPosture(pr.posture);
                fx.Num(e.pos, di.ToString(), crit, crit ? (Color?)null : EcoMath.Hex(0xc8b8ff));
                fx.Burst(e.Center, player.cls.color, crit ? 16 : 8, 5, 0.35f);
                AddResonance(2);
                Sfx.Play(crit ? "crit" : "hit");
                hitstop = Mathf.Max(hitstop, crit ? 0.07f : 0.03f);
                if (pr.aoe > 0)
                {
                    fx.RingFx(new Vector3(pr.pos.x, 0.1f, pr.pos.z), player.cls.color, pr.aoe, 0.3f);
                    foreach (var o in enemies.ToArray())
                    {
                        if (o == e || o.dead || Vector3.Distance(o.pos, pr.pos) > pr.aoe + o.radius + 1) continue;
                        int d2 = Mathf.RoundToInt(di * 0.5f);
                        o.TakeDamage(d2, EcoMath.Flat(o.pos - pr.pos).normalized, 4);
                        if (!o.dead) o.AddPosture(pr.posture * 0.5f);
                        fx.Num(o.pos, d2.ToString());
                    }
                }
                return;
            }
            int dd = Mathf.RoundToInt(pr.damage * (pr.owner != null ? st.dmgMult : 1));
            e.TakeDamage(dd, EcoMath.Flat(pr.vel).normalized, 5);
            if (!e.dead) e.AddPosture(25 * st.postureMult);
            fx.Num(e.pos, dd.ToString(), true, Cyan);
            Sfx.Play("crit");
            hitstop = Mathf.Max(hitstop, 0.05f);
        }

        public bool WaveVsPlayer(Shockwave w)
        {
            var p = player;
            if (p.IsInvulnerable) { if (p.IsPerfectDodge) PerfectDodge(); return true; }
            if (p.hurtCooldown > 0) return false;
            DamagePlayer(w.damage, null);
            return true;
        }

        public void OnEnemyKilled(Enemy e)
        {
            if (run == null) return;
            run.kills++;
            AddEcos(e.def.boss ? 0 : e.elite ? 4 : 1);
            if (run.stats.killHeal > 0) player.Heal(run.stats.killHeal);
            fx.Burst(e.pos + Vector3.up, e.elite ? EcoMath.Hex(0xff7af5) : EcoMath.Hex(0x9a8cff), 25, 6, 0.8f);
            if (e == boss)
            {
                slowmo = 1.5f;
                fx.Callout("GUARDIÃO DERROTADO", Gold, 2);
                foreach (var o in enemies.ToArray()) if (!o.dead && o != e) o.Die();
            }
        }

        // ---------- Habilidades da árvore ----------
        void AddResonance(float v)
        {
            var p = player;
            if (p == null || run.stats.ultimate == null) return;
            float before = p.res;
            p.res = Mathf.Min(100, p.res + v);
            if (before < 100 && p.res >= 100) { fx.Callout("RESSONÂNCIA PLENA [V]", EcoMath.Hex(0xe8c27a), 0.8f); Sfx.Play("pickup"); }
        }

        Enemy NearestEnemy(Vector3 pos, float maxD, HashSet<Enemy> exclude = null)
        {
            Enemy best = null; float bd = maxD;
            foreach (var e in enemies)
            {
                if (e.dead || (exclude != null && exclude.Contains(e))) continue;
                float d = Vector3.Distance(e.pos, pos);
                if (d < bd) { bd = d; best = e; }
            }
            return best;
        }

        // Dano de habilidade: respeita atordoamento e o modo Duelo (lá só quebra postura).
        void SkillHit(Enemy e, float baseDmg, float posture, Color color, Vector3? knock = null)
        {
            var st = run.stats;
            float dmg = baseDmg * st.dmgMult; bool crit = false;
            if (e.IsStunned) { dmg *= e.broken ? st.executeMult : st.riposteMult; crit = true; }
            if (rs.duel && !e.IsStunned) { e.AddPosture(posture * 1.5f); fx.Num(e.pos, "BLOQUEADO", false, Color.gray); return; }
            int di = Mathf.RoundToInt(dmg);
            e.TakeDamage(di, knock, knock.HasValue ? 6 : 0);
            if (!e.dead) e.AddPosture(posture * st.postureMult);
            fx.Num(e.pos, di.ToString(), crit, crit ? (Color?)null : color);
        }

        void UseAbilityR()
        {
            var p = player; var st = run.stats;
            if (st.abilityR == null) return;
            if (p.cdR > 0) { Sfx.Play("parryWhiff"); return; }
            if (st.abilityR == "raio")
            {
                var origin = p.Muzzle(0);
                var fwd = p.AimDir3; var camPos = cam.transform.position;
                Enemy first = null; float bestDot = 0.85f;
                foreach (var e in enemies)
                {
                    if (e.dead || Vector3.Distance(e.pos, p.pos) > 26) continue;
                    float dot = Vector3.Dot((e.Center - camPos).normalized, fwd);
                    if (dot > bestDot) { bestDot = dot; first = e; }
                }
                first = first ?? NearestEnemy(p.pos, 12);
                if (first == null) { fx.Callout("SEM ALVO", Color.gray, 0.4f); return; }
                var hit = new HashSet<Enemy>();
                var pts = new List<Vector3> { origin };
                var cur = first;
                for (int i = 0; i < 4 && cur != null; i++)
                {
                    hit.Add(cur);
                    pts.Add(cur.Center);
                    SkillHit(cur, 28, 18, Violet);
                    fx.Burst(cur.Center, Violet, 10, 5, 0.3f);
                    cur = NearestEnemy(cur.pos, 7, hit);
                }
                fx.BeamFx(pts, EcoMath.Hex(0xd8c8ff), 0.3f);
                Sfx.Play("reflect"); hitstop = Mathf.Max(hitstop, 0.05f);
            }
            else if (st.abilityR == "dragao")
            {
                p.DragonDash();
                dragonHits = new HashSet<Enemy>();
                Sfx.Play("dodge"); Sfx.Play("swing");
                fx.Callout("INVESTIDA DO DRAGÃO", Peach, 0.5f);
            }
            p.cdR = Skills.Abilities[st.abilityR].cooldown;
            AddResonance(5);
        }

        void UseUltimate()
        {
            var p = player; var st = run.stats;
            if (st.ultimate == null) return;
            if (p.res < 100) { fx.Callout("RESSONÂNCIA INSUFICIENTE", Color.gray, 0.5f); return; }
            p.res = 0; ultTick = 0;
            fx.Flash(0.4f, EcoMath.Hex(0xe8c27a)); fx.AddShake(0.4f); Sfx.Play("slam");
            if (st.ultimate == "tempestade") { p.stormT = 3; fx.Callout("TEMPESTADE DE ECOS", Violet, 1); }
            else if (st.ultimate == "cem") { p.flurryT = 2; p.attackT = -1; fx.Callout("CEM PUNHOS", Peach, 1); }
        }

        public void OnPlayerDodge()
        {
            if (run != null && run.stats.dodgeMine > 0) mines.Add(new Mine { pos = player.pos, t = 0.55f });
        }

        void UpdateAbilities(float dt)
        {
            var p = player; var st = run.stats;
            if (p.dragonT > 0 && dragonHits != null)
            {
                foreach (var e in enemies.ToArray())
                {
                    if (e.dead || e.baseY > 1.5f || dragonHits.Contains(e)) continue;
                    if (EcoMath.FlatDist(e.pos, p.pos) < e.radius + 1.4f)
                    {
                        dragonHits.Add(e);
                        SkillHit(e, 35, 25, Peach, EcoMath.Flat(e.pos - p.pos).normalized);
                        fx.Burst(e.Center, Peach, 14, 6, 0.35f);
                        Sfx.Play("crit"); hitstop = Mathf.Max(hitstop, 0.04f);
                    }
                }
                fx.Burst(p.pos + Vector3.up, Peach, 2, 2, 0.3f);
            }
            if (p.stormT > 0 || p.flurryT > 0)
            {
                ultTick -= dt;
                if (ultTick <= 0)
                {
                    if (p.stormT > 0)
                    {
                        ultTick = 0.12f;
                        var near = enemies.FindAll(e => !e.dead && Vector3.Distance(e.pos, p.pos) < 16);
                        if (near.Count > 0)
                        {
                            var e = EcoMath.Pick(near);
                            var c = e.Center;
                            fx.BeamFx(new[] { c + new Vector3(Random.Range(-1f, 1f), 12, Random.Range(-1f, 1f)), c }, EcoMath.Hex(0xd8c8ff), 0.18f);
                            SkillHit(e, 14, 10, Violet);
                            Sfx.Play("hit");
                        }
                    }
                    else
                    {
                        ultTick = 0.09f;
                        p.FaceAim();
                        var fwd = p.AimForward;
                        bool any = false;
                        foreach (var e in enemies.ToArray())
                        {
                            if (e.dead || e.baseY > 1.5f) continue;
                            var to = EcoMath.Flat(e.pos - p.pos);
                            if (to.magnitude - e.radius > 3.2f || Vector3.Dot(fwd, to.normalized) < 0.3f) continue;
                            SkillHit(e, 7, 6, Peach);
                            any = true;
                        }
                        if (any) { Sfx.Play("hit"); fx.Burst(p.pos + fwd * 1.5f + Vector3.up * 1.3f, EcoMath.Hex(0xffd0a0), 6, 5, 0.25f); }
                        else Sfx.Play("swing");
                    }
                }
            }
            for (int i = mines.Count - 1; i >= 0; i--)
            {
                mines[i].t -= dt;
                if (mines[i].t <= 0) { AreaDamage(mines[i].pos, 3, st.dodgeMine, Violet); mines.RemoveAt(i); }
            }
        }
    }
}
