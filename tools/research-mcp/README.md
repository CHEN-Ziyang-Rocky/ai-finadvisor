# FinAdvisor local research tools

Install Node 24 or newer. From the repository root run `npm ci --prefix tools/research-mcp` and `npm test --prefix tools/research-mcp`. The test launches a real stdio server, discovers both tools and calls them with the official MCP client.

In a stdio-compatible MCP client, use the following server configuration, replacing the path with the absolute path to this checkout.

```json
{
  "mcpServers": {
    "finadvisor-public": {
      "command": "node",
      "args": ["/absolute/path/to/ai-finadvisor/tools/research-mcp/server.mjs"]
    }
  }
}
```

`read_example_allocation` returns public frozen portfolio metrics and receipt identifiers. `search_research_library` accepts a question up to 500 characters and returns local source passages. Both tools share the web application's research code, operate locally, and require no credentials. The hosted website separately provides session-scoped account calculations.
