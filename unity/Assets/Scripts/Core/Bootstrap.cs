using UnityEngine;

namespace Eco
{
    // Cria o jogo sozinho ao dar Play em qualquer cena (inclusive uma cena vazia).
    // Se você preferir montar a cena à mão, adicione GameManager + GameUI num objeto e
    // este bootstrap não fará nada.
    public static class Bootstrap
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Init()
        {
#if UNITY_2023_1_OR_NEWER
            if (Object.FindAnyObjectByType<GameManager>() != null) return;
#else
            if (Object.FindObjectOfType<GameManager>() != null) return;
#endif
            var go = new GameObject("EcoDaLamina");
            go.AddComponent<GameManager>();
            go.AddComponent<GameUI>();
            Object.DontDestroyOnLoad(go);
        }
    }
}
