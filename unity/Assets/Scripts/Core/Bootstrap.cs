using UnityEngine;

namespace Eco
{
    // Cria o jogo sozinho ao dar Play em qualquer cena (inclusive uma cena vazia).
    // Se você preferir montar a cena à mão, adicione GameManager + GameUI num objeto e
    // este bootstrap não fará nada.
    public static class Bootstrap
    {
        public const string TrailerKey = "eco_gravar_trailer";

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Init()
        {
#if UNITY_2023_1_OR_NEWER
            var gm = Object.FindAnyObjectByType<GameManager>();
#else
            var gm = Object.FindObjectOfType<GameManager>();
#endif
            if (gm == null)
            {
                var go = new GameObject("EcoDaLamina");
                gm = go.AddComponent<GameManager>();
                go.AddComponent<GameUI>();
                Object.DontDestroyOnLoad(go);
            }
            // Trailer: pedido pelo menu do editor (PlayerPrefs) ou pelo argumento -trailer num build
            bool trailer = PlayerPrefs.GetInt(TrailerKey, 0) == 1 || System.Array.IndexOf(System.Environment.GetCommandLineArgs(), "-trailer") >= 0;
            PlayerPrefs.DeleteKey(TrailerKey);
            if (trailer) TrailerDirector.Launch(gm);
        }
    }
}
