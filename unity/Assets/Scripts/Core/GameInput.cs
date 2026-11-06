using System.Collections.Generic;
using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace Eco
{
    // Leitura de teclado e mouse que funciona com o Input System novo (padrão no Unity 6)
    // ou com o Input Manager antigo. As ações usam nomes simples: "W", "Space", "Mouse0"...
    public static class GameInput
    {
        public static float Sensitivity = 1.2f;
        static readonly HashSet<string> consumed = new HashSet<string>();
        static int frame = -1;

        static void NewFrame()
        {
            if (frame == Time.frameCount) return;
            frame = Time.frameCount;
            consumed.Clear();
        }

#if ENABLE_INPUT_SYSTEM
        static readonly Dictionary<string, Key> keys = new Dictionary<string, Key>
        {
            ["W"] = Key.W, ["A"] = Key.A, ["S"] = Key.S, ["D"] = Key.D, ["E"] = Key.E, ["F"] = Key.F, ["Q"] = Key.Q,
            ["R"] = Key.R, ["V"] = Key.V, ["Space"] = Key.Space, ["Shift"] = Key.LeftShift, ["Escape"] = Key.Escape,
            ["Enter"] = Key.Enter, ["1"] = Key.Digit1, ["2"] = Key.Digit2, ["3"] = Key.Digit3, ["4"] = Key.Digit4,
            ["5"] = Key.Digit5, ["6"] = Key.Digit6,
        };

        public static bool Held(string k)
        {
            if (k.StartsWith("Mouse")) { var m = Mouse.current; if (m == null) return false; return k == "Mouse0" ? m.leftButton.isPressed : m.rightButton.isPressed; }
            var kb = Keyboard.current;
            if (kb == null || !keys.TryGetValue(k, out var key)) return false;
            if (k == "Shift") return kb.leftShiftKey.isPressed || kb.rightShiftKey.isPressed;
            return kb[key].isPressed;
        }

        static bool DownRaw(string k)
        {
            if (k.StartsWith("Mouse")) { var m = Mouse.current; if (m == null) return false; return k == "Mouse0" ? m.leftButton.wasPressedThisFrame : m.rightButton.wasPressedThisFrame; }
            var kb = Keyboard.current;
            if (kb == null || !keys.TryGetValue(k, out var key)) return false;
            if (k == "Shift") return kb.leftShiftKey.wasPressedThisFrame || kb.rightShiftKey.wasPressedThisFrame;
            return kb[key].wasPressedThisFrame;
        }

        public static Vector2 MouseDelta()
        {
            var m = Mouse.current;
            return m == null ? Vector2.zero : m.delta.ReadValue(); // pixels por quadro (y positivo = para cima)
        }
#else
        static KeyCode Code(string k)
        {
            switch (k)
            {
                case "Space": return KeyCode.Space;
                case "Shift": return KeyCode.LeftShift;
                case "Escape": return KeyCode.Escape;
                case "Enter": return KeyCode.Return;
                case "Mouse0": return KeyCode.Mouse0;
                case "Mouse1": return KeyCode.Mouse1;
            }
            if (k.Length == 1 && char.IsDigit(k[0])) return KeyCode.Alpha0 + (k[0] - '0');
            return (KeyCode)System.Enum.Parse(typeof(KeyCode), k);
        }

        public static bool Held(string k) => Input.GetKey(Code(k)) || (k == "Shift" && Input.GetKey(KeyCode.RightShift));
        static bool DownRaw(string k) => Input.GetKeyDown(Code(k)) || (k == "Shift" && Input.GetKeyDown(KeyCode.RightShift));
        public static Vector2 MouseDelta() => new Vector2(Input.GetAxisRaw("Mouse X"), Input.GetAxisRaw("Mouse Y")) * 10f;
#endif

        // Borda de descida, consumida uma vez por quadro (equivalente ao input.consume do protótipo).
        public static bool Consume(string k)
        {
            NewFrame();
            if (consumed.Contains(k)) return false;
            if (!DownRaw(k)) return false;
            consumed.Add(k);
            return true;
        }

        public static bool Locked => Cursor.lockState == CursorLockMode.Locked;
        public static void Lock() { Cursor.lockState = CursorLockMode.Locked; Cursor.visible = false; }
        public static void Unlock() { Cursor.lockState = CursorLockMode.None; Cursor.visible = true; }
    }
}
