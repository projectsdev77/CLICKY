"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Button, Field, Input } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function onSubmit(formData: FormData) {
    setPending(true);
    const email = String(formData.get("email") ?? "");
    // Same response whether or not the account exists, so this can't be used to find accounts.
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    setPending(false);
    if (error?.status === 429) return setError("Too many attempts. Wait a minute and try again.");
    setSent(email);
  }
  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold">Reset your password</h1>
      {sent ? (
        <p className="text-sm text-muted">If there&apos;s an account for {sent}, we&apos;ve emailed a link to reset the password.</p>
      ) : (
        <form action={onSubmit} className="space-y-4">
          <Field label="Email">
            <Input name="email" type="email" required autoComplete="email" />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            Email me a reset link
          </Button>
        </form>
      )}
      <p className="text-center text-sm">
        <Link href="/sign-in" className="text-brand-ink">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
