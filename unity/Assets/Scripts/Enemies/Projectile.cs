using System.Collections.Generic;
using UnityEngine;

namespace Eco
{
    // Projéteis (flechas, orbes, dardos do mago). Os inimigos podem ter os seus refletidos com aparo.
    public class Projectile
    {
        public Vector3 pos, vel;
        public float damage, life = 4, posture = 25, aoe;
        public bool unparryable, reflected, homing, dead, playerShot, crit, ignorePlayer;
        public int pierce;
        public Enemy owner;
        public HashSet<Enemy> hitSet;

        readonly GameManager game;
        readonly Transform t;
        readonly Material mat;
        readonly Light light;

        public Projectile(GameManager game, Vector3 pos, Vector3 vel, float damage, bool unparryable, Enemy owner)
        {
            this.game = game; this.pos = pos; this.vel = vel; this.damage = damage; this.unparryable = unparryable; this.owner = owner;
            var color = EcoMath.Hex(unparryable ? 0xff8a00 : 0xff2a3a);
            mat = Mats.NewLit(Color.black);
            Mats.SetEmission(mat, color * 2);
            var g = Mats.Prim(PrimitiveType.Sphere, game.World, mat, pos, new Vector3(0.32f, 0.32f, 1f), "projetil");
            g.GetComponent<Renderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            t = g.transform;
            light = g.AddComponent<Light>();
            light.type = LightType.Point; light.color = color; light.intensity = 2; light.range = 4;
        }

        public void SetColor(Color c) { Mats.SetEmission(mat, c * 2); light.color = c; }
        public void SetScale(Vector3 s) { t.localScale = s; }

        public void Reflect(Vector3 dir, float mult, bool homing)
        {
            reflected = true;
            this.homing = homing;
            damage *= mult;
            vel = dir * Mathf.Max(24, vel.magnitude * 1.6f);
            life = 3;
            SetColor(EcoMath.Hex(0x5ce1ff));
        }

        public void Update(float dt)
        {
            if (dead) return;
            life -= dt;
            if (homing)
            {
                Enemy best = null; float bd = 1e9f;
                foreach (var e in game.enemies) { if (e.dead) continue; float d = Vector3.Distance(e.pos, pos); if (d < bd) { bd = d; best = e; } }
                if (best != null) vel = Vector3.Lerp(vel, (best.Center - pos).normalized * vel.magnitude, Mathf.Min(1, dt * 6));
            }
            pos += vel * dt;
            t.position = pos;
            if (vel.sqrMagnitude > 1e-4f) t.rotation = Quaternion.LookRotation(vel);

            var room = game.room;
            if (Mathf.Abs(pos.x) > room.half || Mathf.Abs(pos.z) > room.half || pos.y < 0 || life <= 0) { Kill(); return; }
            foreach (var p in room.pillars)
            {
                if (EcoMath.FlatDist(pos, new Vector3(p.x, 0, p.z)) < p.r && pos.y < 8)
                {
                    if (room.towers.Count > 0 && pos.y > 2.6f) continue; // torres só bloqueiam até a altura delas
                    Kill(); return;
                }
            }
            if (reflected)
            {
                foreach (var e in game.enemies)
                {
                    if (e.dead || (hitSet != null && hitSet.Contains(e))) continue;
                    if (Vector3.Distance(e.Center, pos) < e.radius + 0.6f + e.def.height * 0.15f)
                    {
                        game.ProjectileHitEnemy(this, e);
                        if (pierce > 0) { pierce--; (hitSet ?? (hitSet = new HashSet<Enemy>())).Add(e); continue; }
                        Kill(); return;
                    }
                }
            }
            else game.ProjectileVsPlayer(this);
        }

        public void Kill()
        {
            if (dead) return;
            dead = true;
            game.fx.Burst(pos, reflected ? EcoMath.Hex(0x5ce1ff) : EcoMath.Hex(0xff5a3a), 6, 3, 0.3f);
            Object.Destroy(t.gameObject);
        }
    }

    // Onda de choque no chão: pule ou esquive.
    public class Shockwave
    {
        public float r = 0.5f, damage;
        public bool hit, dead;
        readonly float speed, maxR;
        readonly Vector3 center;
        readonly GameManager game;
        readonly LineRenderer lr;

        public Shockwave(GameManager game, Vector3 pos, WaveDef cfg, Enemy owner)
        {
            this.game = game;
            center = new Vector3(pos.x, 0.15f, pos.z);
            speed = cfg.speed; maxR = cfg.maxR; damage = cfg.damage * (owner != null ? owner.dmgMult : 1);
            var g = new GameObject("onda");
            g.transform.SetParent(game.World, false);
            lr = g.AddComponent<LineRenderer>();
            lr.material = Mats.NewTransparent(EcoMath.Hex(0x5ce1ff));
            lr.loop = true; lr.positionCount = 64; lr.widthMultiplier = 0.18f;
            lr.startColor = lr.endColor = EcoMath.Hex(0x5ce1ff);
        }

        public void Update(float dt)
        {
            if (dead) return;
            float prev = r;
            r += speed * dt;
            for (int i = 0; i < 64; i++) { float a = i / 64f * Mathf.PI * 2; lr.SetPosition(i, center + new Vector3(Mathf.Cos(a) * r, 0, Mathf.Sin(a) * r)); }
            var c = EcoMath.Hex(0x5ce1ff); c.a = 1 - r / maxR; lr.startColor = lr.endColor = c;
            if (!hit)
            {
                var p = game.player;
                float d = EcoMath.FlatDist(p.pos, center);
                if (d >= prev - p.radius && d <= r + p.radius && p.pos.y < 0.6f && game.WaveVsPlayer(this)) hit = true;
            }
            if (r >= maxR) Kill();
        }

        public void Kill()
        {
            if (dead) return;
            dead = true;
            Object.Destroy(lr.gameObject);
        }
    }
}
