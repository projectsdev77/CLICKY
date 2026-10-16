"use client";

import { useActionState } from "react";
import { inviteMember } from "@/app/actions";
import { Button, FormMessage, Input } from "@/components/ui";

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteMember, null);
  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <Input name="email" type="email" required placeholder="teammate@acme.com" className="max-w-xs" />
        <select name="role" className="rounded-md border border-border bg-card px-3 py-2 text-sm">
          <option value="member">Viewer</option>
          <option value="admin">Admin</option>
        </select>
        <Button type="submit" disabled={pending}>
          Send invite
        </Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
