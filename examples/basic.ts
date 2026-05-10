import { PremanClient } from "preman-sdk";

const preman = new PremanClient({
  apiKey: process.env.PREMAN_API_KEY,
});

const deployed = await preman.deployMcp({
  name: "Auth MCP",
  upstreamBaseUrl: "https://api.example.com",
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
  mcpId: deployed.mcpId,
  agentId: "cursor-agent",
  scopes: ["auth:login"],
  ttlSeconds: 900,
});

console.log(token.installSnippet.mcpJsonString);
