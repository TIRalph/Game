// Converte src/story.js no JSON de diálogos da versão Unity.
// Uso (na raiz): node tools/story_to_unity_json.mjs "$PWD/src/story.js" > unity/Assets/Resources/Story/dialogos.json
const m = await import(process.argv[2]);
const out = { speakers: [], dialogues: [], conselhos: m.CONSELHOS, retornos: m.RETORNOS, saudacoes: m.SAUDACOES };
for (const [id, sp] of Object.entries(m.SPEAKERS)) out.speakers.push({ id, name: sp.name, color: sp.color });
for (const [id, lines] of Object.entries(m.DIALOGUES)) {
  out.dialogues.push({ id, lines: lines.map(l => ({
    s: l.s || '', t: l.t || '', next: l.next || '',
    choices: (l.choices || []).map(c => ({ t: c.t, action: c.action || '', next: c.next || '', end: c.next === null })),
  })) });
}
process.stdout.write(JSON.stringify(out, null, 2));
