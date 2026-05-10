import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  generateEndpointTypes,
  hostedMcpJson,
  installCommand,
  previewManifest,
  resolveSecret,
  secretFromEnv,
  writeMcpInstall,
} from "../dist/index.js";

test("manifest preview validates endpoints and policy coverage", () => {
  const plan = previewManifest({
    name: "Auth MCP",
    upstream: "https://api.example.com",
    endpoints: [{ method: "POST", path: "/auth/login", scope: "auth:login" }],
    policies: [{ scope: "auth:login", rateLimitRpm: 60 }],
  });

  assert.equal(plan.valid, true);
  assert.equal(plan.endpointCount, 1);
  assert.deepEqual(plan.scopes, ["auth:login"]);
  assert.deepEqual(plan.warnings, []);
});

test("install snippet writers merge Cursor-style MCP config", async () => {
  const dir = await mkdtemp(join(tmpdir(), "preman-sdk-"));
  const path = join(dir, "mcp.json");
  const result = await writeMcpInstall({
    target: "cursor",
    path,
    serverName: "auth-mcp",
    url: "https://flow.opentest.live/h/mcp_123/mcp",
    token: "ot_hmcp_test",
  });

  const written = JSON.parse(await readFile(path, "utf8"));
  assert.equal(result.wrote, true);
  assert.equal(written.mcpServers["auth-mcp"].headers.Authorization, "Bearer ot_hmcp_test");
  assert.equal(hostedMcpJson({ serverName: "auth-mcp", url: "u", token: "t" }).mcpServers["auth-mcp"].url, "u");
  assert.match(installCommand({ serverName: "auth-mcp", url: "u", token: "t" }, "claude"), /claude mcp add/);
});

test("typegen emits endpoint request and response types", () => {
  const output = generateEndpointTypes([
    {
      method: "POST",
      path: "/auth/login",
      requestBodySchema: {
        type: "object",
        properties: { email: { type: "string" }, password: { type: "string" } },
        required: ["email", "password"],
      },
      responseSchema: {
        type: "object",
        properties: { access_token: { type: "string" } },
        required: ["access_token"],
      },
    },
  ]);

  assert.match(output, /export namespace PremanEndpoints/);
  assert.match(output, /export type PostAuthLoginRequest/);
  assert.match(output, /"access_token": string/);
});

test("secret providers read environment values", async () => {
  process.env.PREMAN_TEST_SECRET = "secret-value";
  try {
    assert.equal(await resolveSecret(secretFromEnv("PREMAN_TEST_SECRET")), "secret-value");
    assert.equal(await resolveSecret({ type: "inline", value: "inline-secret" }), "inline-secret");
  } finally {
    delete process.env.PREMAN_TEST_SECRET;
  }
});
