# Unity-MCP (controlar a Unity por IA)

O projeto já vem com o plugin [Unity-MCP](https://github.com/IvanMurzak/Unity-MCP) (`com.ivanmurzak.unity.mcp` 1.7.0, via OpenUPM) em `Packages/manifest.json`.
A Unity baixa o plugin sozinha quando você abre o projeto.

## No seu PC

1. Abra a pasta `unity/` no Unity Hub. O caminho não pode ter espaços (ex.: `C:\Jogos\Game\unity`).
2. Na Unity, abra **Window > AI Game Dev**.
3. Clique em **Configure Model Context Protocol (MCP)** e escolha o seu cliente (Claude Code ou Claude Desktop).
   Ou, pelo terminal, na raiz do repositório:
   ```bash
   npx unity-mcp-cli setup-skills claude-code ./unity
   ```
4. Deixe a Unity aberta enquanto usa a IA. O servidor MCP conversa com o editor pela porta 8080.

### Claude Code (manual, Windows)

```bash
claude mcp add ai-game-developer "C:/caminho/Game/unity/Library/mcp-server/win-x64/gamedev-mcp-server.exe" port=8080 client-transport=stdio
```

### Claude Desktop (manual)

Em `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ai-game-developer": {
      "command": "C:/caminho/Game/unity/Library/mcp-server/win-x64/gamedev-mcp-server.exe",
      "args": ["--port=8080", "--plugin-timeout=10000", "--client-transport=stdio"]
    }
  }
}
```

Troque `win-x64` por `osx-arm64` (Mac M1+), `osx-x64` ou `linux-x64` conforme o sistema. A pasta `Library/mcp-server` só aparece depois que a Unity abre o projeto com o plugin.

## Remover

Em **Window > Package Manager**, remova "AI Game Developer — MCP" e apague `Assets/Plugins/NuGet`.
