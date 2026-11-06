using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using UnityEngine;

namespace Eco
{
    /*
     * LORE E DIÁLOGOS
     * Os textos ficam em Assets/Resources/Story/dialogos.json (editável sem código).
     * Cada diálogo é uma lista de falas { s: quemFala, t: texto }. Uma fala pode ter
     * `choices` [{ t, action, next, end }]. `action` é tratada por GameManager.DialogueAction
     * ("classe:mago", "classe:punhos", "meta", "skills"). Texto aceita {caminho}, {saudacao} etc.
     */
    [Serializable] public class Speaker { public string id, name, color; }
    [Serializable] public class Choice { public string t, action, next; public bool end; }
    [Serializable] public class Line { public string s, t, next; public List<Choice> choices = new List<Choice>(); }
    [Serializable] public class Dialogue { public string id; public List<Line> lines = new List<Line>(); }

    [Serializable]
    public class StoryData
    {
        public List<Speaker> speakers = new List<Speaker>();
        public List<Dialogue> dialogues = new List<Dialogue>();
        public List<string> conselhos = new List<string>(), retornos = new List<string>(), saudacoes = new List<string>();

        static StoryData cached;
        public static StoryData Get()
        {
            if (cached != null) return cached;
            var ta = Resources.Load<TextAsset>("Story/dialogos");
            cached = ta != null ? JsonUtility.FromJson<StoryData>(ta.text) : new StoryData();
            if (ta == null) Debug.LogError("[história] Resources/Story/dialogos.json não encontrado");
            return cached;
        }

        public Dialogue Find(string id) => dialogues.Find(d => d.id == id);
        public Speaker SpeakerOf(string id) => speakers.Find(s => s.id == id) ?? new Speaker { id = id, name = "", color = "#b9b4cc" };
    }

    // Executa um diálogo: avança falas, efeito de máquina de escrever, escolhas.
    public class DialogueRunner
    {
        public bool Active { get; private set; }
        public Speaker Speaker { get; private set; }
        public string FullText { get; private set; } = "";
        public string Shown => FullText.Substring(0, Mathf.Min(FullText.Length, (int)typed));
        public bool Typing => typed < FullText.Length;
        public bool IsNarration => Speaker != null && Speaker.id == "narrador";
        public List<Choice> Choices => !Typing && current != null && current.choices != null && current.choices.Count > 0 ? current.choices : null;

        StoryData data;
        List<Line> lines;
        int idx;
        Line current;
        float typed;
        Func<string, string> vars;
        Action<string> onAction;
        Action onDone;

        public void Run(string id, Func<string, string> vars, Action<string> onAction, Action onDone)
        {
            data = StoryData.Get();
            this.vars = vars; this.onAction = onAction; this.onDone = onDone;
            Active = true;
            Load(id);
        }

        void Load(string id)
        {
            var d = data.Find(id);
            if (d == null) { Debug.LogWarning("[diálogo] não existe: " + id); Finish(); return; }
            lines = d.lines; idx = 0; Show();
        }

        public string Fill(string text) => Regex.Replace(text ?? "", @"\{(\w+)\}", m => vars != null ? vars(m.Groups[1].Value) : "");

        void Show()
        {
            while (true)
            {
                if (idx >= lines.Count) { Finish(); return; }
                var line = lines[idx];
                if (string.IsNullOrEmpty(line.t))
                {
                    if (!string.IsNullOrEmpty(line.next)) { Load(line.next); return; }
                    idx++; continue;
                }
                current = line;
                Speaker = data.SpeakerOf(line.s);
                FullText = Fill(line.t);
                typed = 0;
                return;
            }
        }

        public void Tick(float dt) { if (Active && Typing) typed += dt * 120f; }

        public void Advance()
        {
            if (!Active) return;
            if (Typing) { typed = FullText.Length; return; }
            if (Choices != null) return;
            Sfx.Play("parryWhiff");
            idx++;
            Show();
        }

        public void Pick(int i)
        {
            var ch = Choices;
            if (ch == null || i < 0 || i >= ch.Count) return;
            var c = ch[i];
            Sfx.Play("pickup");
            if (!string.IsNullOrEmpty(c.action)) onAction?.Invoke(c.action);
            if (!Active) return; // a ação pode ter encerrado o diálogo
            if (c.end) { Finish(); return; }
            if (!string.IsNullOrEmpty(c.next)) { Load(c.next); return; }
            idx++;
            Show();
        }

        public void Finish()
        {
            if (!Active) return;
            Active = false;
            var cb = onDone; onDone = null;
            cb?.Invoke();
        }
    }
}
