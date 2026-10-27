"use client";

import { useState } from "react";

export function CopyBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre tabIndex={0} className="overflow-x-auto rounded-md border border-border bg-background p-3 pr-16 font-mono text-xs leading-relaxed">
        {code}
      </pre>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute right-2 top-2 rounded border border-border bg-card px-2 py-1 text-xs"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
