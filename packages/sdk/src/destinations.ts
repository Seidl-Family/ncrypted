// Node-only destinations that receive a secret's value directly, so it never passes through the model.
import { readFile, writeFile, chmod } from "node:fs/promises";
import { execFile } from "node:child_process";
import { homedir, platform } from "node:os";
import { join, resolve, dirname } from "node:path";

export type VercelTarget = "production" | "preview" | "development";

export interface VercelEnvDestination {
  type: "vercel_env";
  /** Env var name, e.g. STRIPE_SECRET_KEY. */
  key: string;
  /** Project name or id. Defaults to the project linked in <cwd>/.vercel/project.json. */
  project?: string;
  /** Team id (team_...) or slug. Defaults to the linked project's org. */
  team?: string;
  /** Default: production and preview. */
  targets?: VercelTarget[];
  /** Directory containing .vercel/project.json. Default: process.cwd(). */
  cwd?: string;
  comment?: string;
}

export interface DotenvDestination {
  type: "dotenv";
  key: string;
  /** Path to the .env file. Default: ./.env */
  path?: string;
}

export type Destination = VercelEnvDestination | DotenvDestination;

export interface DeliveryResult {
  destination: string;
  key: string;
  details: Record<string, unknown>;
}

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function checkKey(key: string) {
  if (!KEY_RE.test(key)) throw new Error(`Invalid variable name "${key}" (letters, digits and _, not starting with a digit)`);
}

// ---------------- Vercel ----------------

function vercelAuthPath(): string {
  if (process.env.VERCEL_AUTH_FILE) return process.env.VERCEL_AUTH_FILE;
  if (platform() === "darwin") return join(homedir(), "Library", "Application Support", "com.vercel.cli", "auth.json");
  if (platform() === "win32") return join(process.env.APPDATA ?? homedir(), "com.vercel.cli", "auth.json");
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "com.vercel.cli", "auth.json");
}

/** VERCEL_TOKEN, else the Vercel CLI's login session (`vercel login`). */
async function vercelToken(): Promise<string> {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;
  let auth: { token?: string; expiresAt?: number };
  try {
    auth = JSON.parse(await readFile(vercelAuthPath(), "utf8"));
  } catch {
    throw new Error("Not logged in to Vercel. Run `vercel login` (or set VERCEL_TOKEN) and try again.");
  }
  if (!auth.token) throw new Error("Not logged in to Vercel. Run `vercel login` (or set VERCEL_TOKEN) and try again.");
  if (auth.expiresAt && auth.expiresAt * (auth.expiresAt < 1e12 ? 1000 : 1) < Date.now() + 60_000) {
    throw new Error("Your Vercel CLI session has expired. Run `vercel whoami` to refresh it (or set VERCEL_TOKEN) and try again.");
  }
  return auth.token;
}

async function linkedProject(cwd: string): Promise<{ projectId: string; orgId?: string } | undefined> {
  try {
    return JSON.parse(await readFile(join(cwd, ".vercel", "project.json"), "utf8"));
  } catch {
    return undefined;
  }
}

interface ResolvedVercel {
  token: string;
  project: string;
  query: string;
  targets: VercelTarget[];
}

async function vercelApi(r: ResolvedVercel, method: string, path: string, body?: unknown) {
  const res = await fetch(`https://api.vercel.com${path}${path.includes("?") ? "&" : "?"}${r.query}`, {
    method,
    headers: { authorization: `Bearer ${r.token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & Record<string, unknown>;
  if (!res.ok) throw new Error(`Vercel API ${res.status}: ${data.error?.message ?? res.statusText}`);
  return data;
}

async function resolveVercel(d: VercelEnvDestination): Promise<ResolvedVercel> {
  checkKey(d.key);
  const token = await vercelToken();
  const linked = await linkedProject(d.cwd ?? process.cwd());
  const project = d.project ?? linked?.projectId;
  if (!project) throw new Error("No Vercel project given and no .vercel/project.json here. Pass `project` (name or id) or run `vercel link`.");
  const team = d.team ?? (d.project ? undefined : linked?.orgId);
  const query = team ? (team.startsWith("team_") ? `teamId=${encodeURIComponent(team)}` : `slug=${encodeURIComponent(team)}`) : "";
  const targets = d.targets?.length ? [...new Set(d.targets)] : (["production", "preview"] as VercelTarget[]);
  return { token, project, query, targets };
}

/** Checks auth and project access before a one-time secret is consumed. */
async function preflightVercel(d: VercelEnvDestination): Promise<ResolvedVercel> {
  const r = await resolveVercel(d);
  await vercelApi(r, "GET", `/v9/projects/${encodeURIComponent(r.project)}`);
  return r;
}

async function deliverVercel(value: string, d: VercelEnvDestination, r: ResolvedVercel): Promise<DeliveryResult> {
  // Sensitive vars can't target development; use encrypted there.
  const sensitiveTargets = r.targets.filter((t) => t !== "development");
  const entries = [
    ...(sensitiveTargets.length ? [{ key: d.key, value, type: "sensitive", target: sensitiveTargets }] : []),
    ...(r.targets.includes("development") ? [{ key: d.key, value, type: "encrypted", target: ["development"] }] : []),
  ].map((e) => ({ ...e, comment: d.comment ?? "Set via ncrypted (value never shown to the agent)" }));
  await vercelApi(r, "POST", `/v10/projects/${encodeURIComponent(r.project)}/env?upsert=true`, entries.length === 1 ? entries[0] : entries);
  return {
    destination: "vercel_env",
    key: d.key,
    details: {
      project: r.project,
      targets: r.targets,
      type: sensitiveTargets.length ? "sensitive" : "encrypted",
      note: "Redeploy for the new value to take effect.",
    },
  };
}

// ---------------- .env file ----------------

function quoteEnv(value: string): string {
  if (/^[A-Za-z0-9_./:@+-]*$/.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

function gitIgnored(path: string): Promise<boolean | undefined> {
  return new Promise((done) =>
    execFile("git", ["check-ignore", "-q", path], { cwd: dirname(path) }, (err) => {
      if (!err) return done(true);
      done((err as { code?: number }).code === 1 ? false : undefined); // 128: not a git repo
    }),
  );
}

async function deliverDotenv(value: string, d: DotenvDestination): Promise<DeliveryResult> {
  checkKey(d.key);
  const path = resolve(d.path ?? ".env");
  let text = "";
  try {
    text = await readFile(path, "utf8");
  } catch {}
  const line = `${d.key}=${quoteEnv(value)}`;
  const re = new RegExp(`^(export\\s+)?${d.key}=.*$`, "m");
  text = re.test(text) ? text.replace(re, line) : `${text}${text && !text.endsWith("\n") ? "\n" : ""}${line}\n`;
  await writeFile(path, text, { mode: 0o600 });
  await chmod(path, 0o600);
  const ignored = await gitIgnored(path);
  return {
    destination: "dotenv",
    key: d.key,
    details: {
      path,
      gitIgnored: ignored,
      ...(ignored === false ? { warning: `${path} is NOT git-ignored. Add it to .gitignore before committing.` } : {}),
    },
  };
}

// ---------------- dispatch ----------------

export interface PreparedDestination {
  deliver(value: string): Promise<DeliveryResult>;
}

/**
 * Validates a destination (auth, project access, names) without touching the secret.
 * Call this before consuming a one-time secret so a bad destination doesn't destroy it.
 */
export async function prepareDestination(d: Destination): Promise<PreparedDestination> {
  if (d.type === "vercel_env") {
    const r = await preflightVercel(d);
    return { deliver: (v) => deliverVercel(v, d, r) };
  }
  if (d.type === "dotenv") {
    checkKey(d.key);
    return { deliver: (v) => deliverDotenv(v, d) };
  }
  throw new Error(`Unknown destination type "${(d as { type: string }).type}"`);
}
