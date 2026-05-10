import assert from "node:assert/strict";
import test from "node:test";
import { PremanClient, PremanConfigError } from "../dist/index.js";

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

test("registerEndpoints writes to a Flow agent session", async () => {
  const calls = [];
  const client = new PremanClient({
    apiKey: "pm_live_test",
    apiUrl: "https://flow.opentest.live",
    appUrl: "https://www.flowtest.opentest.live",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return jsonResponse({ id: "session_123", endpoint_count: 1 });
    },
  });

  const result = await client.registerEndpoints({
    sessionId: "session_123",
    upstreamBaseUrl: "https://api.example.com",
    intent: "Auth",
    endpoints: [
      {
        method: "POST",
        path: "/auth/login",
        requestBodySchema: {
          type: "object",
          properties: { email: { type: "string" } },
        },
      },
    ],
  });

  assert.equal(calls[0].url, "https://flow.opentest.live/agent-sessions/session_123/endpoints");
  assert.equal(JSON.parse(calls[0].init.body).endpoints[0].path_template, "/auth/login");
  assert.equal(result.dashboardUrl, "https://www.flowtest.opentest.live/try?session=session_123");
});

test("deployMcp uses the hosted MCP deploy route and normalizes response", async () => {
  const calls = [];
  const client = new PremanClient({
    apiKey: "pm_live_test",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return jsonResponse({
        hosted_mcp: { id: "mcp_123", name: "Auth MCP" },
        hosted_mcp_url: "https://flow.opentest.live/h/mcp_123/mcp",
        tool_count: 1,
        raw_consumer_token: "ot_hmcp_test",
        consumer_token: { id: "token_123" },
        install_snippet: {
          url: "https://flow.opentest.live/h/mcp_123/mcp",
          mcp_json: { mcpServers: {} },
        },
      });
    },
  });

  const result = await client.deployMcp({
    sessionId: "session_123",
    name: "Auth MCP",
    upstreamBaseUrl: "https://api.example.com",
    endpoints: [{ method: "POST", path: "/auth/login" }],
  });

  assert.equal(calls[0].url, "https://flow.opentest.live/agent-sessions/session_123/mcp/deploy");
  assert.equal(JSON.parse(calls[0].init.body).initial_consumer_label, "default-consumer");
  assert.equal(result.mcpId, "mcp_123");
  assert.equal(result.hostedUrl, "https://flow.opentest.live/h/mcp_123/mcp");
  assert.equal(result.dashboardUrl, "https://www.flowtest.opentest.live/hosted-mcps/mcp_123");
});

test("createToken maps SDK token options to hosted MCP consumer tokens", async () => {
  const calls = [];
  const client = new PremanClient({
    apiKey: "pm_live_test",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return jsonResponse({
        raw_token: "ot_hmcp_test",
        token: { id: "token_123", expires_at: null },
        install_snippet: {
          url: "https://flow.opentest.live/h/mcp_123/mcp",
          mcp_json: { mcpServers: {} },
        },
      });
    },
  });

  const result = await client.createToken({
    mcpId: "mcp_123",
    consumerLabel: "Acme",
    scopes: ["auth:login"],
    rateLimitRpm: 60,
  });

  assert.equal(calls[0].url, "https://flow.opentest.live/hosted-mcps/mcp_123/tokens");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    consumer_label: "Acme",
    scopes: ["auth:login"],
    rate_limit_rpm: 60,
  });
  assert.equal(result.token, "ot_hmcp_test");
  assert.equal(result.tokenId, "token_123");
});

test("verifyToken fails clearly until the hosted API exposes verification", async () => {
  const client = new PremanClient({
    apiKey: "pm_live_test",
    fetchImpl: async () => {
      throw new Error("fetch should not be called");
    },
  });

  await assert.rejects(
    () => client.verifyToken({ mcpId: "mcp_123", token: "ot_hmcp_test", requiredScope: "auth:login" }),
    (error) => error instanceof PremanConfigError && /not exposed/.test(error.message),
  );
});
