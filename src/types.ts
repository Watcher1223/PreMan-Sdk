export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export type JsonSchema = Record<string, unknown>;

export type EndpointDefinition = {
  method: HttpMethod;
  path: string;
  baseUrl?: string;
  description?: string;
  tags?: string[];
  scope?: string;
  requestBodySchema?: JsonSchema;
  responseSchema?: JsonSchema;
  headersSchema?: JsonSchema;
  querySchema?: JsonSchema;
};

export type RegisterEndpointsRequest = {
  projectId?: string;
  upstreamBaseUrl?: string;
  endpoints: EndpointDefinition[];
};

export type RegisterEndpointsResponse = {
  projectId: string;
  endpointCount: number;
  dashboardUrl: string;
};

export type DeployMcpRequest = {
  name: string;
  upstreamBaseUrl: string;
  endpointIds?: string[];
  endpoints?: EndpointDefinition[];
  scopes?: string[];
};

export type DeployMcpResponse = {
  mcpId: string;
  name: string;
  hostedUrl: string;
  dashboardUrl: string;
  toolCount: number;
};

export type CreateTokenRequest = {
  mcpId: string;
  agentId?: string;
  customerId?: string;
  label?: string;
  scopes: string[];
  ttlSeconds?: number;
  maxToolCalls?: number;
};

export type CreateTokenResponse = {
  token: string;
  tokenId: string;
  expiresAt: string;
  installSnippet: {
    mcpJson: Record<string, unknown>;
    mcpJsonString: string;
  };
};

export type AuditEvent = {
  agentId?: string;
  customerId?: string;
  action: string;
  resource?: string;
  outcome?: "success" | "error" | "denied";
  metadata?: Record<string, unknown>;
};

export type AuditLogResponse = {
  id: string;
  createdAt: string;
};

export type VerifyTokenRequest = {
  token: string;
  requiredScope?: string;
};

export type VerifyTokenResponse = {
  valid: boolean;
  scopes: string[];
  tokenId?: string;
  agentId?: string;
  customerId?: string;
  expiresAt?: string;
};

export type PremanClientOptions = {
  apiKey?: string;
  apiUrl?: string;
  appUrl?: string;
  fetchImpl?: typeof fetch;
};

