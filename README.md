# PreMan SDK

[![GitHub stars](https://img.shields.io/github/stars/Watcher1223/PreMan-Sdk?style=social)](https://github.com/Watcher1223/PreMan-Sdk/stargazers)
[![Website](https://img.shields.io/badge/PreMan-preman.live-black)](https://preman.live)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

PreMan turns company APIs into secure MCP servers with scoped tokens and audit logs for AI agents.

The SDK is the developer on-ramp. It helps you register endpoints, deploy hosted MCPs, mint short-lived agent/customer tokens, verify tokens in your own API, and write audit events. The hosted PreMan site remains the control plane for policies, consumers, revocation, audit logs, and agent observability.

```text
Your codebase/API
  -> PreMan SDK/CLI
  -> Hosted PreMan control plane
  -> Secure MCP URL + scoped tokens for agents/customers
```

## Install

```bash
npm install @preman/sdk
```

CLI usage after publishing:

```bash
npx preman init --api-key pm_live_your_key
```

## Quick Start

Create `endpoints.json`:

```json
[
  {
    "method": "POST",
    "path": "/auth/login",
    "description": "Login with email and password.",
    "scope": "auth:login",
    "requestBodySchema": {
      "type": "object",
      "properties": {
        "email": { "type": "string", "format": "email" },
        "password": { "type": "string" }
      },
      "required": ["email", "password"]
    }
  }
]
```

Register endpoints:

```bash
preman register --file endpoints.json --upstream https://api.company.com
```

Deploy a hosted MCP:

```bash
preman deploy \
  --name "Company Auth MCP" \
  --file endpoints.json \
  --upstream https://api.company.com
```

Mint a scoped session token:

```bash
preman token \
  --mcp-id mcp_123 \
  --agent-id cursor-agent \
  --scopes auth:login \
  --ttl 900
```

The hosted dashboard at [preman.live](https://preman.live) is where teams mint customer tokens, revoke access, inspect audit logs, and manage MCP servers.

## TypeScript SDK

```ts
import { PremanClient } from "@preman/sdk";

const preman = new PremanClient({
  apiKey: process.env.PREMAN_API_KEY,
});

const mcp = await preman.deployMcp({
  name: "Auth MCP",
  upstreamBaseUrl: "https://api.company.com",
  endpoints: [
    {
      method: "POST",
      path: "/auth/login",
      scope: "auth:login",
      description: "Login with email and password.",
      requestBodySchema: {
        type: "object",
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string" },
        },
        required: ["email", "password"],
      },
    },
  ],
});

const token = await preman.createToken({
  mcpId: mcp.mcpId,
  agentId: "cursor-agent",
  scopes: ["auth:login"],
  ttlSeconds: 900,
});

console.log(token.installSnippet.mcpJsonString);
```

## Protect Your API

If PreMan issues scoped tokens, your API can verify them before serving agent traffic.

```ts
import { PremanClient, verifyBearerToken } from "@preman/sdk";

const preman = new PremanClient();

export async function POST(request: Request) {
  const identity = await verifyBearerToken(request.headers, {
    client: preman,
    requiredScope: "orders:write",
  });

  return Response.json({
    ok: true,
    agentId: identity.agentId,
  });
}
```

## What Belongs In The SDK?

The SDK should stay thin:

- endpoint registration
- hosted MCP deployment helpers
- scoped token creation
- token verification middleware/helpers
- custom audit event logging
- CLI commands for local setup and CI

The hosted PreMan control plane owns:

- MCP hosting
- customer/agent token management
- policy and revocation
- audit logs
- observability dashboards
- future knowledge graph / agent memory

## CLI Reference

```bash
preman init --api-key pm_live_...
preman status
preman register --file endpoints.json --upstream https://api.company.com
preman deploy --name "Auth MCP" --file endpoints.json --upstream https://api.company.com
preman token --mcp-id mcp_123 --scopes auth:login --ttl 900
```

## Configuration

The CLI stores local config at:

```text
~/.preman/config.json
```

Environment variables override local config:

```bash
PREMAN_API_KEY=pm_live_your_key
PREMAN_API_URL=https://api.preman.live
PREMAN_APP_URL=https://preman.live
```

## Development

```bash
npm install
npm run build
```

## License

MIT

