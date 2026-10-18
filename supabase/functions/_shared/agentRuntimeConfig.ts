/**
 * Agent secrets come from the edge runtime environment. On the self-hosted
 * stack they sit in runtime-secrets.json next to this function, because that
 * file is not part of the git tree. The user worker cannot read that file.
 * main/index.ts reads it and copies the values into the worker environment
 * before the function starts.
 */

const SECRET_FILE = "/home/deno/functions/agent-community-rules/runtime-secrets.json";

let fileSecrets: Record<string, string> | null = null;

function readFileSecrets(): Record<string, string> {
  if (fileSecrets) return fileSecrets;
  try {
    const parsed = JSON.parse(Deno.readTextFileSync(SECRET_FILE));
    fileSecrets = parsed && typeof parsed === "object" ? parsed as Record<string, string> : {};
  } catch {
    fileSecrets = {};
  }
  return fileSecrets;
}

export function agentSecret(name: string): string {
  const fromEnv = Deno.env.get(name)?.trim() ?? "";
  if (fromEnv) return fromEnv;
  const fromFile = readFileSecrets()[name];
  return typeof fromFile === "string" ? fromFile.trim() : "";
}
