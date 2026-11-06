using UnityEngine;

namespace Eco
{
    /*
     * CAMADA DE MODELOS
     * Todo personagem é criado por ModelLibrary.Create(chave, opções). Ordem de procura:
     *   1. Prefab em Assets/Resources/Characters/<chave>.prefab com Animator → AnimatorCharacter
     *   2. Modelo segmentado (.bytes em Resources/Models, ex.: protagonista) → ProceduralRig com as partes
     *   3. Boneco procedural de primitivas → ProceduralRig
     * Todos expõem a mesma interface, então a lógica do jogo não muda.
     *
     * Estados de animação pedidos pelo jogo:
     *   idle, run, jump, dodge, hit, stagger, death, talk,
     *   attack1, attack2, attack3, parry           (jogador)
     *   windup, strike, windup_heavy, strike_heavy, aim, lunge  (inimigos)
     *   cast1, cast2, cast3                         (mãos do mago)
     */
    public interface ICharacterVisual
    {
        Transform Root { get; }
        string State { get; }
        float StateTime { get; }
        void Play(string state, float duration = 0.3f);
        void Tick(float dt, float speed);
        void SetGlow(Color? color, float k = 1f);
        void Flinch(float k = 1f);
        Transform Socket(string name); // handR, handL, head, chest
        void Dispose();
    }

    public class RigJoints
    {
        public float hipY, chestY, neckY, shoulderX, upperArm, foreArm, hipX, thigh;

        public static RigJoints Default(float h) => new RigJoints
        {
            hipY = h * 0.5f, chestY = h * 0.28f, neckY = h * 0.04f, shoulderX = h * 0.2f,
            upperArm = h * 0.16f, foreArm = h * 0.16f, hipX = h * 0.065f, thigh = h * 0.25f,
        };
    }

    // Opções do boneco procedural (usadas quando não há modelo próprio).
    public class RigOptions
    {
        public float height = 1.8f;
        public Color color = EcoMath.Hex(0x6a6480);
        public Color? skin, robe, beard, hood, cape;
        public Color eyeColor = EcoMath.Hex(0xffe0a0);
        public Color gloveColor = EcoMath.Hex(0xb04a2a);
        public string weapon = "none"; // blade, rapier, club, greatsword, bow, staff, none
        public bool weaponLeft, fighter, crown;
        public RigJoints joints;
    }
}
