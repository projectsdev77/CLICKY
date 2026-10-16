"use client";

import { useEffect, useState } from "react";

type Status = { lastSeenAt: string | null; lastSeenUrl: string | null };

/** Polls until the SDK has checked in from an allowed website. */
export function InstallStatus({ projectId, initial }: { projectId: string; initial: Status }) {
  const [status, setStatus] = useState(initial);

  useEffect(() => {
    if (status.lastSeenAt) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/projects/${projectId}/status`, { cache: "no-store" });
      if (res.ok) setStatus(await res.json());
    }, 3000);
    return () => clearInterval(timer);
  }, [projectId, status.lastSeenAt]);

  if (status.lastSeenAt) {
    return (
      <div className="rounded-lg border border-green-600/30 bg-green-600/10 p-4 text-sm">
        <p className="font-medium text-green-700 dark:text-green-400">Clicky is installed</p>
        <p className="mt-1 text-muted">
          Last seen {new Date(status.lastSeenAt).toLocaleString()}
          {status.lastSeenUrl && <> on {status.lastSeenUrl}</>}
        </p>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-sm">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
      </span>
      Waiting for Clicky to load on your website…
    </div>
  );
}
