"use client";

import { useEffect, useState } from "react";
import { sealToPublicKey } from "ncrypted/crypto";

type State =
  | { kind: "loading" }
  | { kind: "nokey" }
  | { kind: "gone"; message: string }
  | { kind: "open"; label: string; expiresAt: string }
  | { kind: "sending"; label: string }
  | { kind: "sent" }
  | { kind: "error"; label: string; expiresAt: string; message: string };

export default function Submit({ id }: { id: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [publicKey, setPublicKey] = useState("");
  const [value, setValue] = useState("");

  useEffect(() => {
    const pk = window.location.hash.slice(1);
    if (!pk) return setState({ kind: "nokey" });
    setPublicKey(pk);
    fetch(`/api/v1/requests/${id}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) return setState({ kind: "gone", message: body.error ?? "This request is no longer available." });
        if (body.status === "fulfilled") return setState({ kind: "gone", message: "This request was already answered." });
        setState({ kind: "open", label: body.label, expiresAt: body.expiresAt });
      })
      .catch(() => setState({ kind: "gone", message: "Couldn't load this request." }));
  }, [id]);

  async function send(label: string, expiresAt: string) {
    setState({ kind: "sending", label });
    try {
      const sealed = await sealToPublicKey(value, publicKey);
      const res = await fetch(`/api/v1/requests/${id}/fulfill`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sealed),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't send.");
      setValue("");
      history.replaceState(null, "", window.location.pathname);
      setState({ kind: "sent" });
    } catch (e) {
      setState({ kind: "error", label, expiresAt, message: (e as Error).message });
    }
  }

  switch (state.kind) {
    case "loading":
      return <p>Loading…</p>;
    case "nokey":
      return (
        <>
          <h1>Incomplete link</h1>
          <p>This request link is missing its key (the part after #). Ask for the full link.</p>
        </>
      );
    case "gone":
      return (
        <>
          <h1>Request unavailable</h1>
          <p>{state.message}</p>
        </>
      );
    case "sent":
      return (
        <>
          <h1>Sent</h1>
          <p>Your value was encrypted in this browser and can only be opened by the agent that made the request, once. You can close this page.</p>
        </>
      );
    case "open":
    case "sending":
    case "error": {
      const label = state.label;
      const expiresAt = state.kind === "sending" ? "" : state.expiresAt;
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (state.kind !== "sending" && value) send(label, expiresAt);
          }}
        >
          <h1>An agent is asking for a secret</h1>
          <p>
            Request: <b>&ldquo;{label}&rdquo;</b>
          </p>
          <p>
            Only continue if you asked your own AI agent to do something that needs this. The value is encrypted in your browser
            to the requesting agent&apos;s key; ncrypted can&apos;t read it, and it can be collected once.
          </p>
          <p>
            <b>Never enter a password or code for an account you weren&apos;t expecting to share, or because someone you
            don&apos;t know sent you this link.</b>
          </p>
          <p>
            <input
              type="password"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Paste the value"
              aria-label="Secret value"
            />
          </p>
          {state.kind === "error" && <p className="warn">{state.message}</p>}
          <p>
            <button type="submit" disabled={state.kind === "sending" || !value}>
              {state.kind === "sending" ? "Encrypting…" : "Encrypt and send"}
            </button>
          </p>
          {expiresAt && <p>Expires {new Date(expiresAt).toLocaleString()}.</p>}
        </form>
      );
    }
  }
}
