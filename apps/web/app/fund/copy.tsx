"use client";

import { useState } from "react";

export default function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="secondary"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
      }}
    >
      {done ? "Copied" : "Copy address"}
    </button>
  );
}
