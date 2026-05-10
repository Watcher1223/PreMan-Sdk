import { readFile } from "fs/promises";
import type { EndpointDefinition } from "./types.js";

export type PremanPolicyRule = {
  scope: string;
  paths?: string[];
  methods?: string[];
  rateLimitRpm?: number;
  ttlSeconds?: number;
};

export type PremanManifest = {
  name?: string;
  upstream: string;
  intent?: string;
  endpoints: EndpointDefinition[];
  policies?: PremanPolicyRule[];
  deploy?: {
    name?: string;
    initialConsumerLabel?: string | null;
  };
};

export type ManifestPlan = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  endpointCount: number;
  scopes: string[];
  deployName?: string;
};

export async function readManifest(path: string): Promise<PremanManifest> {
  return parseManifest(await readFile(path, "utf8"));
}

export function parseManifest(input: string | Record<string, unknown>): PremanManifest {
  const data = typeof input === "string" ? JSON.parse(input) as Record<string, unknown> : input;
  return data as PremanManifest;
}

export function previewManifest(manifest: PremanManifest): ManifestPlan {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!manifest.upstream) errors.push("manifest.upstream is required.");
  if (!Array.isArray(manifest.endpoints) || manifest.endpoints.length === 0) {
    errors.push("manifest.endpoints must contain at least one endpoint.");
  }

  const endpointScopes = new Set<string>();
  for (const [index, endpoint] of (manifest.endpoints ?? []).entries()) {
    if (!endpoint.method) errors.push(`endpoints[${index}].method is required.`);
    if (!endpoint.path && !endpoint.pathTemplate && !endpoint.path_template) {
      errors.push(`endpoints[${index}].path is required.`);
    }
    if (endpoint.scope) endpointScopes.add(endpoint.scope);
  }

  const policyScopes = new Set((manifest.policies ?? []).map((policy) => policy.scope).filter(Boolean));
  for (const scope of endpointScopes) {
    if (!policyScopes.has(scope)) warnings.push(`No policy rule found for endpoint scope '${scope}'.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    endpointCount: manifest.endpoints?.length ?? 0,
    scopes: [...new Set([...endpointScopes, ...policyScopes])].sort(),
    deployName: manifest.deploy?.name ?? manifest.name,
  };
}
