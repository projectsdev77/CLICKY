"use client";

import { useActionState } from "react";
import { sendDigestPreview } from "@/app/actions";
import { FormMessage } from "@/components/ui";

export function DigestPreviewButton({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState(() => sendDigestPreview(projectId), null);
  return (
    <form action={action} className="flex items-center gap-2">
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className="text-sm text-brand-ink disabled:opacity-50">
        Email me this week&apos;s summary
      </button>
    </form>
  );
}
