"use client";

import { useActionState } from "react";
import { acceptInvitation } from "@/app/actions";
import { Button, FormMessage } from "@/components/ui";

export function AcceptInvite({ invitationId }: { invitationId: string }) {
  const [state, action, pending] = useActionState(() => acceptInvitation(invitationId), null);
  return (
    <form action={action} className="space-y-3">
      <Button type="submit" disabled={pending}>
        Accept invitation
      </Button>
      <FormMessage state={state} />
    </form>
  );
}
