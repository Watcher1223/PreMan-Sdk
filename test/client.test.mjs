import assert from "node:assert/strict";
import test from "node:test";
import { PremanAuthError, PremanClient, PremanError, verifyBearerToken } from "../dist/index.js";

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
    apiKey: "ot_live_12345678901234567890123456789012",
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
    apiKey: "ot_live_12345678901234567890123456789012",
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
    apiKey: "ot_live_12345678901234567890123456789012",
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

test("verifyToken posts to the hosted MCP verification endpoint and normalizes identity", async () => {
  const calls = [];
  const client = new PremanClient({
    apiKey: "ot_live_12345678901234567890123456789012",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return jsonResponse({
        valid: true,
        scopes: ["auth:login"],
        token_id: "token_123",
        expires_at: "2026-05-10T12:00:00Z",
        identity: {
          agent_id: "agent_123",
          customer_id: "customer_123",
        },
      });
    },
  });

  const result = await client.verifyToken({
    mcpId: "mcp_123",
    token: "ot_hmcp_test",
    requiredScope: "auth:login",
  });

  assert.equal(calls[0].url, "https://flow.opentest.live/hosted-mcps/mcp_123/tokens/verify");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    token: "ot_hmcp_test",
    required_scope: "auth:login",
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.scopes, ["auth:login"]);
  assert.deepEqual(result.identity, {
    tokenId: "token_123",
    agentId: "agent_123",
    customerId: "customer_123",
  });
  assert.equal(result.tokenId, "token_123");
  assert.equal(result.expiresAt, "2026-05-10T12:00:00Z");
});

test("verifyToken rejects invalid verification responses with a helpful error", async () => {
  const client = new PremanClient({
    apiKey: "ot_live_12345678901234567890123456789012",
    fetchImpl: async () => jsonResponse({ scopes: ["auth:login"] }),
  });

  await assert.rejects(
    () => client.verifyToken({ mcpId: "mcp_123", token: "ot_hmcp_test" }),
    (error) => error instanceof PremanError && /expected boolean `valid` field/.test(error.message),
  );
});

test("verifyBearerToken requires mcpId and returns identity", async () => {
  const headers = { authorization: "Bearer ot_hmcp_test" };
  const client = {
    verifyToken: async () => ({
      valid: true,
      scopes: ["auth:login"],
      identity: {
        tokenId: "token_123",
        agentId: "agent_123",
        customerId: "customer_123",
      },
    }),
  };

  await assert.rejects(
    () => verifyBearerToken(headers, { client, mcpId: "", requiredScope: "auth:login" }),
    (error) => error instanceof PremanAuthError && /mcpId is required/.test(error.message),
  );

  const result = await verifyBearerToken(headers, {
    client,
    mcpId: "mcp_123",
    requiredScope: "auth:login",
  });

  assert.deepEqual(result.identity, {
    tokenId: "token_123",
    agentId: "agent_123",
    customerId: "customer_123",
  });
  assert.equal(result.tokenId, "token_123");
});

test("audit posts custom events and normalizes response", async () => {
  const calls = [];
  const client = new PremanClient({
    apiKey: "ot_live_12345678901234567890123456789012",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return jsonResponse({ id: "audit_123", created_at: "2026-05-10T12:00:00Z" });
    },
  });

  const result = await client.audit({
    agentId: "agent_123",
    customerId: "cus_123",
    action: "auth.login",
    resource: "user:123",
    outcome: "success",
    metadata: { ip: "127.0.0.1" },
  });

  assert.equal(calls[0].url, "https://flow.opentest.live/audit/events");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer ot_live_12345678901234567890123456789012");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    agent_id: "agent_123",
    customer_id: "cus_123",
    action: "auth.login",
    resource: "user:123",
    outcome: "success",
    metadata: { ip: "127.0.0.1" },
  });
  assert.deepEqual(result, {
    id: "audit_123",
    createdAt: "2026-05-10T12:00:00Z",
  });
});

test("client accepts OPENTEST_API_KEY as a compatibility fallback", async () => {
  const previous = process.env.OPENTEST_API_KEY;
  process.env.OPENTEST_API_KEY = "ot_live_12345678901234567890123456789012";
  try {
    const client = new PremanClient({
      fetchImpl: async () => jsonResponse({ id: "session_123", endpoint_count: 0 }),
    });
    assert.equal(client.apiUrl, "https://flow.opentest.live");
  } finally {
    if (previous === undefined) {
      delete process.env.OPENTEST_API_KEY;
    } else {
      process.env.OPENTEST_API_KEY = previous;
    }
  }
});

test("client retries idempotent POST requests and emits hooks", async () => {
  const events = [];
  let count = 0;
  const client = new PremanClient({
    apiKey: "ot_live_12345678901234567890123456789012",
    retry: { retries: 1, initialDelayMs: 1, maxDelayMs: 1 },
    hooks: {
      onRequest: (event) => events.push(["request", event.attempt, event.idempotencyKey]),
      onResponse: (event) => events.push(["response", event.status]),
      onError: (event) => events.push(["error", event.status]),
    },
    fetchImpl: async () => {
      count += 1;
      if (count === 1) {
        return new Response(JSON.stringify({ detail: "temporary" }), { status: 503 });
      }
      return jsonResponse({
        raw_token: "ot_hmcp_test",
        token: { id: "token_123" },
        install_snippet: { url: "https://flow.opentest.live/h/mcp_123/mcp", mcp_json: {} },
      });
    },
  });

  const result = await client.createToken({
    mcpId: "mcp_123",
    consumerLabel: "agent",
    scopes: ["auth:login"],
    request: { idempotencyKey: "idem_123" },
  });

  assert.equal(result.tokenId, "token_123");
  assert.equal(count, 2);
  assert.deepEqual(events.map((event) => event[0]), ["request", "response", "error", "request", "response"]);
});

test("token list revoke and rotate use hosted MCP token lifecycle endpoints", async () => {
  const calls = [];
  const client = new PremanClient({
    apiKey: "ot_live_12345678901234567890123456789012",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/tokens?include_revoked=true")) {
        return jsonResponse({ tokens: [{ id: "token_old", consumer_label: "agent", scopes: ["auth:login"] }] });
      }
      if (init.method === "DELETE") {
        return jsonResponse({ revoked: true, token_id: "token_old" });
      }
      return jsonResponse({
        raw_token: "ot_hmcp_new",
        token: { id: "token_new" },
        install_snippet: { url: "https://flow.opentest.live/h/mcp_123/mcp", mcp_json: {} },
      });
    },
  });

  const listed = await client.listTokens({ mcpId: "mcp_123", includeRevoked: true });
  const rotated = await client.rotateToken({
    mcpId: "mcp_123",
    tokenId: "token_old",
    scopes: ["auth:login"],
    consumerLabel: "agent",
  });

  assert.equal(listed.tokens[0].id, "token_old");
  assert.equal(rotated.newToken.tokenId, "token_new");
  assert.equal(rotated.revoked.tokenId, "token_old");
  assert.equal(calls[0].url, "https://flow.opentest.live/hosted-mcps/mcp_123/tokens?include_revoked=true");
  assert.equal(calls[2].init.method, "DELETE");
});
