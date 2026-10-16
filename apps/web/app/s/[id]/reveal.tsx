"use client";

import { useEffect, useState } from "react";
import { decrypt, type EncryptedPayload } from "ncrypted/crypto";

type State =
  | { kind: "ready" }
  | { kind: "nokey" }
  | { kind: "loading" }
  | { kind: "passphrase"; payload: EncryptedPayload; error?: string }
  | { kind: "shown"; text: string }
  | { kind: "gone"; message: string };

export default function Reveal({ id }: { id: string }) {
  const [state, setState] = useState<State>({ kind: "ready" });
  const [key, setKey] = useState("");
  const [pass, setPass] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const k = window.location.hash.slice(1);
    if (!k) setState({ kind: "nokey" });
    setKey(k);
  }, []);

  async function open(payload: EncryptedPayload, passphrase?: string) {
    try {
      setState({ kind: "shown", text: await decrypt(payload, key, passphrase) });
      // The key is useless now, but drop it from the address bar and history anyway.
      history.replaceState(null, "", window.location.pathname);
    } catch (e) {
      if (payload.hasPassphrase) setState({ kind: "passphrase", payload, error: passphrase ? "Wrong passphrase." : undefined });
      else setState({ kind: "gone", message: (e as Error).message });
    }
  }

  async function reveal() {
    setState({ kind: "loading" });
    const res = await fetch(`/api/v1/secrets/${id}/reveal`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return setState({ kind: "gone", message: body.error ?? "This secret is no longer available." });
    }
    const payload = (await res.json()) as EncryptedPayload;
    if (payload.hasPassphrase) setState({ kind: "passphrase", payload });
    else await open(payload);
  }

  switch (state.kind) {
    case "nokey":
      return (
        <>
          <h1>Incomplete link</h1>
          <p>This link is missing its decryption key (the part after <code>#</code>). Ask the sender for the full link. Nothing has been revealed or destroyed.</p>
        </>
      );
    case "ready":
    case "loading":
      return (
        <>
          <h1>Someone shared a secret with you</h1>
          <p>It can be viewed <b>only once</b>. After you reveal it, it is permanently destroyed, so copy it somewhere safe.</p>
          <button onClick={reveal} disabled={state.kind === "loading" || !key}>
            {state.kind === "loading" ? "Decrypting…" : "Reveal secret"}
          </button>
        </>
      );
    case "passphrase":
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            open(state.payload, pass);
          }}
        >
          <h1>Passphrase required</h1>
          <p>The sender protected this secret with a passphrase they shared separately. The secret has already been removed from the server; only this page holds it now, so don't close the tab.</p>
          <input type="password" autoFocus value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Passphrase" />
          {state.error && <p className="warn">{state.error}</p>}
          <p><button type="submit">Decrypt</button></p>
        </form>
      );
    case "shown":
      return (
        <>
          <h1>Your secret</h1>
          <pre className="secret">{state.text}</pre>
          <button
            className="secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(state.text);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <p>This secret has been destroyed on the server. Reloading this page won't bring it back.</p>
        </>
      );
    case "gone":
      return (
        <>
          <h1>Secret unavailable</h1>
          <p>{state.message}</p>
          <p>If you didn't open it, ask the sender to create a new one, and to rotate the credential if it may have been seen by someone else.</p>
        </>
      );
  }
}
