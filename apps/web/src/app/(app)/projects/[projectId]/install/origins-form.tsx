"use client";

import { useActionState } from "react";
import { updateOrigins } from "@/app/actions";
import { Button, FormMessage, Textarea } from "@/components/ui";

export function OriginsForm({ projectId, origins, disabled }: { projectId: string; origins: string[]; disabled: boolean }) {
  const [state, action, pending] = useActionState(updateOrigins.bind(null, projectId), null);
  return (
    <form action={action} className="space-y-3">
      <Textarea
        name="origins"
        rows={Math.max(3, origins.length + 1)}
        defaultValue={origins.join("\n")}
        placeholder={"https://app.acme.com\nhttp://localhost:5173"}
        disabled={disabled}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || disabled}>
          Save websites
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
