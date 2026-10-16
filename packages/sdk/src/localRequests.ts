// Node-only storage for the private keys of pending secret requests (one 0600 file per request).
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface LocalRequest {
  id: string;
  origin: string;
  publicKey: string;
  privateKey: JsonWebKey;
  pollToken: string;
  label: string;
  expiresAt: string;
}

export function requestsDir(): string {
  return process.env.NCRYPTED_REQUESTS_DIR || join(homedir(), ".config", "ncrypted", "requests");
}

const fileFor = (id: string) => {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(id)) throw new Error("Invalid request id");
  return join(requestsDir(), `${id}.json`);
};

export async function saveLocalRequest(r: LocalRequest): Promise<void> {
  await mkdir(requestsDir(), { recursive: true, mode: 0o700 });
  await writeFile(fileFor(r.id), JSON.stringify(r), { mode: 0o600 });
}

export async function loadLocalRequest(id: string): Promise<LocalRequest> {
  try {
    return JSON.parse(await readFile(fileFor(id), "utf8")) as LocalRequest;
  } catch {
    throw new Error(`No pending request ${id} on this machine (it was collected already, or created elsewhere).`);
  }
}

export const removeLocalRequest = (id: string) => rm(fileFor(id), { force: true });
