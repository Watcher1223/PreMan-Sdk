export type SecretProvider =
  | { type: "env"; name: string }
  | { type: "inline"; value: string }
  | { type: "custom"; read: () => string | Promise<string> };

export async function resolveSecret(provider: SecretProvider | undefined): Promise<string | undefined> {
  if (!provider) return undefined;
  if (provider.type === "inline") return provider.value;
  if (provider.type === "env") {
    const value = process.env[provider.name];
    if (!value) throw new Error(`Missing secret environment variable ${provider.name}.`);
    return value;
  }
  return provider.read();
}

export function secretFromEnv(name: string): SecretProvider {
  return { type: "env", name };
}
