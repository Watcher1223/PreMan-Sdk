import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { homedir } from "os";

export type McpInstallTarget = "cursor" | "vscode" | "claude";

export type HostedMcpConfig = {
  serverName: string;
  url: string;
  token: string;
};

export type WriteInstallOptions = HostedMcpConfig & {
  target: McpInstallTarget;
  path?: string;
  dryRun?: boolean;
};

export function hostedMcpJson(config: HostedMcpConfig): Record<string, unknown> {
  return {
    mcpServers: {
      [config.serverName]: {
        url: config.url,
        headers: {
          Authorization: `Bearer ${config.token}`,
        },
      },
    },
  };
}

export function installCommand(config: HostedMcpConfig, target: McpInstallTarget): string {
  if (target === "claude") {
    return `claude mcp add ${config.serverName} --transport http ${config.url} --header "Authorization: Bearer ${config.token}"`;
  }
  return JSON.stringify(hostedMcpJson(config), null, 2);
}

export async function writeMcpInstall(options: WriteInstallOptions): Promise<{ path: string; config: Record<string, unknown>; wrote: boolean }> {
  const path = options.path ?? defaultInstallPath(options.target);
  const next = hostedMcpJson(options);
  if (options.target === "claude") {
    return { path, config: next, wrote: false };
  }

  const existing = await readJson(path);
  const merged = mergeMcpServers(existing, next);
  if (!options.dryRun) {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, JSON.stringify(merged, null, 2), { mode: 0o600 });
  }
  return { path, config: merged, wrote: !options.dryRun };
}

export function defaultInstallPath(target: McpInstallTarget): string {
  if (target === "cursor") return join(homedir(), ".cursor", "mcp.json");
  if (target === "vscode") return join(process.cwd(), ".vscode", "mcp.json");
  return "";
}

function mergeMcpServers(existing: Record<string, unknown>, next: Record<string, unknown>): Record<string, unknown> {
  const existingServers = objectAt(existing, "mcpServers");
  const nextServers = objectAt(next, "mcpServers");
  return {
    ...existing,
    mcpServers: {
      ...existingServers,
      ...nextServers,
    },
  };
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function objectAt(value: Record<string, unknown>, key: string): Record<string, unknown> {
  const item = value[key];
  return item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {};
}
