import {
  type AuditEvent,
  type AuditLogResponse,
  type CreateTokenRequest,
  type CreateTokenResponse,
  type DeployMcpRequest,
  type DeployMcpResponse,
  type HostedMcpInstallSnippet,
  type PremanClientOptions,
  type RegisterEndpointsRequest,
  type RegisterEndpointsResponse,
  type VerifyTokenRequest,
  type VerifyTokenResponse,
} from "./types.js";
import { PremanAuthError, PremanConfigError, PremanError, PremanPolicyDeniedError } from "./errors.js";
import { randomUUID } from "node:crypto";

const DEFAULT_API_URL = "https://flow.opentest.live";
const DEFAULT_APP_URL = "https://www.flowtest.opentest.live";

export class PremanClient {
  readonly apiUrl: string;
  readonly appUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: PremanClientOptions = {}) {
    const apiKey = options.apiKey ?? process.env["PREMAN_API_KEY"] ?? "";
    if (!apiKey.trim()) {
      throw new PremanConfigError("Missing PREMAN_API_KEY. Pass apiKey or set PREMAN_API_KEY.");
    }

    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new PremanConfigError("No fetch implementation available. Use Node >=18 or pass fetchImpl.");
    }

    this.apiKey = apiKey;
    this.apiUrl = stripTrailingSlash(options.apiUrl ?? process.env["PREMAN_API_URL"] ?? DEFAULT_API_URL);
    this.appUrl = stripTrailingSlash(options.appUrl ?? process.env["PREMAN_APP_URL"] ?? DEFAULT_APP_URL);
    this.fetchImpl = fetchImpl;
  }

  async registerEndpoints(request: RegisterEndpointsRequest): Promise<RegisterEndpointsResponse> {
    requireNonEmptyArray(request.endpoints, "endpoints");
    const sessionId = request.sessionId ?? randomUUID();
    const response = await this.request<{ id: string; endpoint_count: number }>(`/agent-sessions/${encodeURIComponent(sessionId)}/endpoints`, {
      method: "POST",
      body: {
        endpoints: request.endpoints.map(toBackendEndpoint),
        upstream_base_url: request.upstreamBaseUrl,
        intent: request.intent,
      },
    });
    const id = response.id || sessionId;
    const dashboardUrl = this.dashboardUrl(`/try?session=${encodeURIComponent(id)}`);
    return {
      sessionId: id,
      endpointCount: response.endpoint_count ?? request.endpoints.length,
      dashboardUrl,
      endpointsUrl: dashboardUrl,
    };
  }

  async deployMcp(request: DeployMcpRequest): Promise<DeployMcpResponse> {
    requireString(request.name, "name");
    requireString(request.upstreamBaseUrl, "upstreamBaseUrl");
    if (!request.endpoints?.length) {
      throw new PremanConfigError("deployMcp requires endpoints.");
    }
    const sessionId = request.sessionId ?? randomUUID();
    const response = await this.request<Record<string, unknown>>(`/agent-sessions/${encodeURIComponent(sessionId)}/mcp/deploy`, {
      method: "POST",
      body: {
        name: request.name,
        upstream_base_url: request.upstreamBaseUrl,
        endpoints: request.endpoints.map(toBackendEndpoint),
        initial_upstream_secret: request.initialUpstreamSecret,
        initial_upstream_secret_type: request.initialUpstreamSecretType,
        upstream_auth_style: request.upstreamAuthStyle,
        initial_consumer_label: request.initialConsumerLabel === undefined ? "default-consumer" : request.initialConsumerLabel,
      },
    });
    const hosted = objectAt(response, "hosted_mcp");
    const mcpId = stringAt(hosted, "id");
    const name = stringAt(hosted, "name") || request.name;
    const hostedUrl = stringAt(response, "hosted_mcp_url");
    return {
      mcpId,
      name,
      hostedUrl,
      dashboardUrl: this.dashboardUrl(`/hosted-mcps/${encodeURIComponent(mcpId)}`),
      toolCount: numberAt(response, "tool_count"),
      rawConsumerToken: nullableStringAt(response, "raw_consumer_token"),
      consumerToken: objectAt(response, "consumer_token"),
      installSnippet: normalizeInstallSnippet(objectAt(response, "install_snippet")),
    };
  }

  async createToken(request: CreateTokenRequest): Promise<CreateTokenResponse> {
    requireString(request.mcpId, "mcpId");
    requireNonEmptyArray(request.scopes, "scopes");
    const response = await this.request<Record<string, unknown>>(`/hosted-mcps/${encodeURIComponent(request.mcpId)}/tokens`, {
      method: "POST",
      body: {
        consumer_label: request.consumerLabel ?? request.label ?? request.agentId ?? request.customerId ?? "sdk-consumer",
        upstream_credential_id: request.upstreamCredentialId,
        scopes: request.scopes,
        rate_limit_rpm: request.rateLimitRpm,
      },
    });
    const metadata = objectAt(response, "token");
    const rawToken = stringAt(response, "raw_token");
    return {
      token: rawToken,
      tokenId: stringAt(metadata, "id"),
      expiresAt: nullableStringAt(metadata, "expires_at"),
      metadata,
      installSnippet: normalizeInstallSnippet(objectAt(response, "install_snippet")),
    };
  }

  async verifyToken(request: VerifyTokenRequest): Promise<VerifyTokenResponse> {
    requireString(request.token, "token");
    void request;
    throw new PremanConfigError(
      "verifyToken is not exposed by the hosted PreMan API yet. Hosted MCP calls are scoped and verified by PreMan automatically; use createToken for consumer access today.",
    );
  }

  async audit(event: AuditEvent): Promise<AuditLogResponse> {
    requireString(event.action, "action");
    void event;
    throw new PremanConfigError(
      "Custom audit event ingestion is not exposed by the hosted PreMan API yet. MCP tool calls are already audited in the hosted workspace.",
    );
  }

  dashboardUrl(path = "/dashboard"): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${this.appUrl}${normalizedPath}`;
  }

  private async request<T>(
    path: string,
    options: {
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      body?: unknown;
    },
  ): Promise<T> {
    const init: RequestInit = {
      method: options.method,
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "preman-sdk",
      },
    };
    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
    }

    const response = await this.fetchImpl(`${this.apiUrl}${path}`, init);

    if (response.ok) {
      const text = await response.text();
      if (!text) return {} as T;
      return JSON.parse(text) as T;
    }

    const requestId = response.headers.get("x-request-id") ?? undefined;
    const body = await readBody(response);
    const message = extractErrorMessage(body) ?? `PreMan API request failed with ${response.status}`;

    if (response.status === 401 || response.status === 403) {
      if (message.toLowerCase().includes("policy")) {
        throw new PremanPolicyDeniedError(message, { status: response.status, requestId, body });
      }
      throw new PremanAuthError(message, { status: response.status, requestId, body });
    }

    throw new PremanError(message, { status: response.status, requestId, body });
  }
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function requireString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new PremanConfigError(`${field} is required.`);
  }
}

function requireNonEmptyArray<T>(value: T[] | undefined, field: string): asserts value is T[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new PremanConfigError(`${field} must be a non-empty array.`);
  }
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorMessage(body: unknown): string | undefined {
  if (typeof body === "string") return body;
  if (!body || typeof body !== "object") return undefined;
  const record = body as Record<string, unknown>;
  const detail = record["detail"];
  const error = record["error"];
  if (typeof detail === "string") return detail;
  if (typeof error === "string") return error;
  return undefined;
}

function toBackendEndpoint(endpoint: import("./types.js").EndpointDefinition): Record<string, unknown> {
  const pathTemplate = endpoint.path_template ?? endpoint.pathTemplate ?? endpoint.path ?? "/";
  return omitUndefined({
    method: endpoint.method.toUpperCase(),
    path_template: pathTemplate,
    base_url: endpoint.base_url ?? endpoint.baseUrl,
    description: endpoint.description,
    tags: endpoint.tags,
    request_body_schema: endpoint.request_body_schema ?? endpoint.requestBodySchema,
    response_schema: endpoint.response_schema ?? endpoint.responseSchema,
    headers_schema: endpoint.headers_schema ?? endpoint.headersSchema,
    query_schema: endpoint.query_schema ?? endpoint.querySchema,
    scope: endpoint.scope,
  });
}

function objectAt(value: Record<string, unknown>, key: string): Record<string, unknown> {
  const item = value[key];
  return item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {};
}

function stringAt(value: Record<string, unknown>, key: string): string {
  const item = value[key];
  return typeof item === "string" ? item : "";
}

function nullableStringAt(value: Record<string, unknown>, key: string): string | null {
  const item = value[key];
  return typeof item === "string" ? item : null;
}

function numberAt(value: Record<string, unknown>, key: string): number {
  const item = value[key];
  return typeof item === "number" ? item : 0;
}

function normalizeInstallSnippet(value: Record<string, unknown>): HostedMcpInstallSnippet {
  const mcpJson = objectAt(value, "mcp_json");
  return {
    ...(value as Record<string, unknown>),
    url: stringAt(value, "url"),
    serverName: stringAt(value, "server_name") || undefined,
    authorizationHeader: stringAt(value, "authorization_header") || undefined,
    mcp_json: mcpJson,
    mcpJson,
    mcp_json_string: stringAt(value, "mcp_json_string") || undefined,
    mcpJsonString: stringAt(value, "mcp_json_string") || undefined,
    installText: stringAt(value, "install_text") || undefined,
  } as HostedMcpInstallSnippet;
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}
