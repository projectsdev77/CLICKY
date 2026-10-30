"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function VerifyEmailBanner({ email }: { email: string }) {
  const [sent, setSent] = useState(false);
  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm">
      Please confirm your email ({email}) so you can receive invitations and alerts.{" "}
      {sent ? (
        <span className="text-muted">Sent. Check your inbox.</span>
      ) : (
        <button
          className="text-brand-ink underline"
          onClick={async () => {
            await authClient.sendVerificationEmail({ email, callbackURL: "/dashboard" });
            setSent(true);
          }}
        >
          Resend the email
        </button>
      )}
    </div>
  );
}
