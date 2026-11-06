using UnityEngine;

namespace Eco
{
    interface IPlayerView
    {
        void Update(float dt, bool moving);
        Vector3 Muzzle(int combo);
        void OnHurt();
        void Dispose();
    }

    // Primeira pessoa (Mago): mãos presas à câmera.
    class FirstPersonView : IPlayerView
    {
        readonly PlayerController p;
        readonly Camera cam;
        readonly ICharacterVisual hands;
        float roll;
        int lastAttack = -1;

        public FirstPersonView(PlayerController p, Camera cam, bool showHands)
        {
            this.p = p; this.cam = cam;
            if (showHands)
            {
                hands = ModelLibrary.CreateHands(p.cls.model, p.cls.color);
                hands.Root.SetParent(cam.transform, false);
            }
        }

        public Vector3 Muzzle(int combo) => hands != null ? hands.Socket(combo == 1 ? "handL" : "handR").position : p.Eye;

        public void Update(float dt, bool moving)
        {
            cam.transform.position = p.Eye;
            float targetRoll = 0;
            if (p.IsDashing) targetRoll = -Vector3.Dot(p.dodgeDir, EcoMath.Right(p.yaw)) * 0.12f;
            roll += (targetRoll - roll) * Mathf.Min(1, dt * 12);
            cam.transform.rotation = Quaternion.Euler(-p.pitch * EcoMath.Deg, p.yaw * EcoMath.Deg, roll * EcoMath.Deg);
            float fov = p.IsDashing ? 86 : 75;
            cam.fieldOfView += (fov - cam.fieldOfView) * Mathf.Min(1, dt * 10);
            if (hands == null) return;
            if (p.stormT > 0) { if (hands.State != "cast3" || hands.StateTime > 0.3f) hands.Play("cast3", 0.3f); }
            else if (p.attackT >= 0) { if (lastAttack != p.attackId) { lastAttack = p.attackId; hands.Play("cast" + (p.combo + 1), p.SwingTime); } }
            else if (p.parryT >= 0) { if (hands.State != "parry") hands.Play("parry", 0.35f); }
            else if (p.IsDashing) hands.Play("dodge", PlayerController.DodgeTime);
            else hands.Play("idle");
            hands.Tick(dt, moving && p.grounded ? 1 : 0);
        }

        public void OnHurt() { }
        public void Dispose() { hands?.Dispose(); }
    }

    // Terceira pessoa (Punhos): câmera de ombro que orbita o personagem.
    class ThirdPersonView : IPlayerView
    {
        readonly PlayerController p;
        readonly Camera cam;
        readonly GameManager game;
        public readonly ICharacterVisual body;
        float dist = 4.2f;
        int lastAttack = -1, beat = -1;
        const float Shoulder = 0.65f;

        public ThirdPersonView(PlayerController p, Camera cam, GameManager game)
        {
            this.p = p; this.cam = cam; this.game = game;
            body = ModelLibrary.Create(p.cls.model, new RigOptions
            {
                height = 1.8f, fighter = true, color = EcoMath.Hex(0x3a3048), skin = EcoMath.Hex(0xd9a882),
                gloveColor = EcoMath.Hex(0xb04a2a), eyeColor = EcoMath.Hex(0x9ad0ff), hood = EcoMath.Hex(0x6a3a2a),
            });
            body.Root.SetParent(game.World, false);
        }

        public Vector3 Muzzle(int combo) => p.Eye;

        public void Update(float dt, bool moving)
        {
            var b = body;
            b.Root.position = p.pos;
            b.Root.rotation = Quaternion.Euler(0, p.facing * EcoMath.Deg, 0);

            if (p.dead) b.Play("death", 0.8f);
            else if (p.flurryT > 0)
            {
                int bt = Mathf.FloorToInt(p.flurryT / 0.09f);
                if (bt != beat) { beat = bt; b.Play(bt % 2 == 1 ? "attack1" : "attack2", 0.09f); }
            }
            else if (p.dragonT > 0) { if (b.State != "lunge") b.Play("lunge", 0.3f); }
            else if (p.IsDashing) { if (b.State != "dodge") b.Play("dodge", PlayerController.DodgeTime); }
            else if (p.attackT >= 0) { if (lastAttack != p.attackId) { lastAttack = p.attackId; b.Play("attack" + (p.combo + 1), p.SwingTime); } }
            else if (p.parryT >= 0) { if (b.State != "parry") b.Play("parry", 0.35f); }
            else if (!p.grounded) b.Play("jump");
            else b.Play(moving ? "run" : "idle");
            b.Tick(dt, EcoMath.Flat(p.vel).magnitude);

            // Câmera
            var look = new Vector3(Mathf.Sin(p.yaw) * Mathf.Cos(p.pitch), Mathf.Sin(p.pitch), Mathf.Cos(p.yaw) * Mathf.Cos(p.pitch));
            var right = EcoMath.Right(p.yaw);
            var target = p.pos + Vector3.up * 1.55f;
            var room = game.room;
            float lim = room != null ? room.half - 0.35f : 1e9f;
            float want = 4.2f;
            for (; want > 0.8f; want -= 0.2f)
            {
                var c = target + right * Shoulder - look * want;
                if (Mathf.Abs(c.x) > lim || Mathf.Abs(c.z) > lim || c.y < 0.3f) continue;
                bool inPillar = false;
                if (room != null) foreach (var q in room.pillars) if (EcoMath.FlatDist(c, new Vector3(q.x, 0, q.z)) < q.r + 0.3f && c.y < q.h) { inPillar = true; break; }
                if (!inPillar) break;
            }
            dist = want < dist ? want : dist + (want - dist) * Mathf.Min(1, dt * 4);
            cam.transform.position = target + right * Shoulder - look * dist;
            cam.transform.rotation = Quaternion.Euler(-p.pitch * EcoMath.Deg, p.yaw * EcoMath.Deg, 0);
            float fov = p.IsDashing ? 78 : 70;
            cam.fieldOfView += (fov - cam.fieldOfView) * Mathf.Min(1, dt * 10);
        }

        public void OnHurt() { body.Flinch(1); }
        public void Dispose() { body.Dispose(); }
    }

    // Jogador: movimento, ataque, aparo e esquiva são iguais para as duas classes.
    public class PlayerController
    {
        public const float Eye_ = 1.65f, Grav = 26, DodgeTime = 0.24f, Iframes = 0.32f, PerfectDodgeWindow = 0.2f;

        readonly GameManager game;
        public readonly ClassDef cls;
        public readonly bool hasClass, thirdPerson;
        public Stats stats;
        public Vector3 pos, vel, dodgeDir;
        public float vy, yaw, pitch, facing, radius = 0.45f, hp;
        public int dashCharges, attackId, combo, dodgeId, perfectUsed = -1;
        public float dashTimer, dodgeT = -1, iframes, parryT = -1, parryCooldown, attackT = -1, comboTimer, hurtCooldown, parryFlash;
        public bool attackDone, queuedAttack, critNext, grounded = true, dead, locked;
        public float fury;
        // Árvore de habilidades
        public float res, cdR, flurryT, dragonT, stormT, counterT;
        readonly IPlayerView view;

        public PlayerController(GameManager game, ClassDef cls, Stats stats)
        {
            this.game = game;
            hasClass = cls != null;
            this.cls = cls ?? Classes.Mago;
            this.stats = stats;
            hp = stats.maxHp;
            dashCharges = MaxDash;
            thirdPerson = hasClass && !this.cls.firstPerson;
            view = thirdPerson ? (IPlayerView)new ThirdPersonView(this, game.cam, game) : new FirstPersonView(this, game.cam, hasClass);
        }

        public int MaxDash => stats.dashCharges + cls.dashBonus;
        public float ParryWindow => cls.parryWindow * stats.parryWindowMult;
        public bool IsParrying => parryT >= 0 && parryT <= ParryWindow;
        public bool IsInvulnerable => iframes > 0;
        public bool IsDashing => dodgeT >= 0 && dodgeT < DodgeTime;
        public bool IsPerfectDodge => dodgeT >= 0 && dodgeT <= PerfectDodgeWindow;
        public Vector3 Eye => pos + Vector3.up * Eye_;
        public Vector3 Forward => EcoMath.Forward(yaw);           // frente da câmera (movimento)
        public Vector3 AimForward => EcoMath.Forward(facing);     // frente do corpo (golpes)
        public Vector3 AimDir3 => game.cam.transform.forward;
        public float SwingTime => cls.swingTime / stats.attackSpeed;
        public Vector3 Muzzle(int combo) => view.Muzzle(combo);
        public void Heal(float n) { hp = Mathf.Min(stats.maxHp, hp + n); }

        // Em 3ª pessoa, vira o corpo para o inimigo mais próximo na direção da câmera.
        public void FaceAim()
        {
            if (!thirdPerson) return;
            var camF = Forward;
            Enemy best = null; float bd = 6.5f;
            foreach (var e in game.enemies)
            {
                if (e.dead || e.baseY > 1.5f) continue;
                var to = EcoMath.Flat(e.pos - pos);
                float d = to.magnitude;
                if (d < bd && Vector3.Dot(camF, to.normalized) > 0.45f) { bd = d; best = e; }
            }
            var dir = best != null ? EcoMath.Flat(best.pos - pos) : camF;
            facing = EcoMath.YawOf(dir);
        }

        public void Update(float dt)
        {
            var md = GameInput.MouseDelta();
            float s = 0.0022f * GameInput.Sensitivity;
            if (!locked) { yaw += md.x * s; pitch += md.y * s; }
            float pmin = thirdPerson ? -0.85f : -1.45f, pmax = thirdPerson ? 0.75f : 1.45f;
            pitch = Mathf.Clamp(pitch, pmin, pmax);

            if (dashCharges < MaxDash) { dashTimer += dt; if (dashTimer >= stats.dashRecharge) { dashTimer = 0; dashCharges++; } }
            else dashTimer = 0;

            var f = Forward; var r = EcoMath.Right(yaw);
            var wish = Vector3.zero;
            if (!locked && !dead)
            {
                if (GameInput.Held("W")) wish += f;
                if (GameInput.Held("S")) wish -= f;
                if (GameInput.Held("D")) wish += r;
                if (GameInput.Held("A")) wish -= r;
            }
            if (wish.sqrMagnitude > 0) wish.Normalize();
            bool moving = wish.sqrMagnitude > 0;

            bool canAct = !locked && !dead && flurryT <= 0;
            cdR = Mathf.Max(0, cdR - dt);
            counterT = Mathf.Max(0, counterT - dt);
            if (flurryT > 0) { flurryT -= dt; iframes = Mathf.Max(iframes, 0.05f); }
            if (dragonT > 0) dragonT -= dt;
            if (stormT > 0) stormT -= dt;

            bool attacking = attackT >= 0;
            float speed = 7.2f * stats.moveSpeed * (attacking ? 0.55f : 1) * (parryT >= 0 && parryT < 0.3f ? 0.6f : 1) * (flurryT > 0 ? 0.35f : 1);

            if (canAct && (GameInput.Consume("Shift") || GameInput.Consume("Q")))
                TryDodge(moving ? wish : (thirdPerson ? -AimForward : -f));

            if (dodgeT >= 0)
            {
                dodgeT += dt;
                if (dodgeT < DodgeTime)
                {
                    float k = 1 - dodgeT / DodgeTime;
                    float sp = dragonT > 0 ? 32 : cls.dodgeSpeed * stats.dodgeDistMult;
                    pos += dodgeDir * sp * (0.4f + k) * dt;
                }
                if (dodgeT > 0.5f) dodgeT = -1;
            }
            if (!IsDashing)
            {
                float accel = grounded ? 14 : 4;
                vel.x += (wish.x * speed - vel.x) * Mathf.Min(1, accel * dt);
                vel.z += (wish.z * speed - vel.z) * Mathf.Min(1, accel * dt);
                pos.x += vel.x * dt; pos.z += vel.z * dt;
            }
            iframes = Mathf.Max(0, iframes - dt);

            if (canAct && GameInput.Consume("Space") && grounded) { vy = 8.5f; grounded = false; Sfx.Play("jump"); }
            vy -= Grav * dt;
            pos.y += vy * dt;
            if (pos.y <= 0) { pos.y = 0; vy = 0; grounded = true; }

            // Aparo
            if (parryCooldown > 0) parryCooldown -= dt;
            if (canAct && (GameInput.Consume("Mouse1") || GameInput.Consume("F")) && parryCooldown <= 0 && dodgeT < 0)
            {
                parryT = 0; parryCooldown = 0.42f; attackT = -1; queuedAttack = false;
                FaceAim();
                Sfx.Play("parryWhiff");
            }
            if (parryT >= 0) { parryT += dt; if (parryT > 0.35f) parryT = -1; }

            // Ataque
            if (canAct && hasClass && GameInput.Consume("Mouse0"))
            {
                if (attackT < 0 && parryT < 0 && !IsDashing) StartAttack();
                else queuedAttack = true;
            }
            if (attackT >= 0)
            {
                float st = SwingTime;
                attackT += dt;
                if (thirdPerson && attackT < st * cls.activeAt) pos += AimForward * 3 * dt; // passo à frente no soco
                if (!attackDone && attackT >= st * cls.activeAt) { attackDone = true; FaceAim(); game.PlayerStrike(combo); }
                if (attackT >= st)
                {
                    attackT = -1; comboTimer = 0.45f; combo = (combo + 1) % 3;
                    if (queuedAttack) { queuedAttack = false; StartAttack(); }
                }
            }
            else if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) combo = 0; }

            // Direção do corpo
            if (!thirdPerson) facing = yaw;
            else if (moving && attackT < 0 && parryT < 0)
            {
                float want = IsDashing ? EcoMath.YawOf(dodgeDir) : EcoMath.YawOf(wish);
                facing += EcoMath.WrapAngle(want - facing) * Mathf.Min(1, dt * 14);
            }

            game.room.Collide(ref pos, radius);
            if (hurtCooldown > 0) hurtCooldown -= dt;
            parryFlash = Mathf.Max(0, parryFlash - dt * 4);
            view.Update(dt, moving);
        }

        // Atualiza só a câmera (diálogos, pausa).
        public void UpdateViewOnly(float dt) { view.Update(dt, false); }

        public void TryDodge(Vector3 dir)
        {
            if (dashCharges <= 0 || dodgeT >= 0) return;
            dashCharges--;
            dodgeT = 0; dodgeId++;
            iframes = Iframes;
            dodgeDir = EcoMath.Flat(dir).normalized;
            attackT = -1; queuedAttack = false; parryT = -1;
            Sfx.Play("dodge");
            if (cls.id == "mago" && hasClass) game.fx.Burst(pos + Vector3.up * 1.2f, cls.color, 10, 3, 0.4f);
            game.OnPlayerDodge();
        }

        // Investida do Dragão: esquiva longa na direção do corpo, sem gastar carga.
        public void DragonDash()
        {
            FaceAim();
            dodgeT = 0; dodgeId++;
            iframes = 0.42f; dragonT = 0.3f;
            dodgeDir = AimForward;
            attackT = -1; parryT = -1; queuedAttack = false;
        }

        void StartAttack()
        {
            attackT = 0; attackId++; attackDone = false;
            FaceAim();
            Sfx.Play("swing");
        }

        public void OnHurt() { view.OnHurt(); }
        public void Dispose() { view.Dispose(); }
    }
}
