"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { authClient } from "@/lib/auth-client";
import { Button, Field, Input } from "@/components/ui";

type Msg = { error?: string; ok?: string } | null;

function Message({ msg }: { msg: Msg }) {
  if (msg?.error) return <p className="text-sm text-red-600">{msg.error}</p>;
  if (msg?.ok) return <p className="text-sm text-green-700 dark:text-green-400">{msg.ok}</p>;
  return null;
}

export function ProfileForm({ name, email, verified }: { name: string; email: string; verified: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <form
      className="space-y-4"
      action={async (formData) => {
        const { error } = await authClient.updateUser({ name: String(formData.get("name") ?? "").trim() });
        setMsg(error ? { error: error.message ?? "Couldn't save." } : { ok: "Saved." });
        router.refresh();
      }}
    >
      <Field label="Name">
        <Input name="name" defaultValue={name} required maxLength={100} />
      </Field>
      <Field label="Email" hint={verified ? "Confirmed." : "Not confirmed yet."}>
        <Input value={email} disabled readOnly />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit">Save</Button>
        <Message msg={msg} />
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <form
      className="space-y-4"
      action={async (formData) => {
        const { error } = await authClient.changePassword({
          currentPassword: String(formData.get("current") ?? ""),
          newPassword: String(formData.get("new") ?? ""),
          revokeOtherSessions: true,
        });
        setMsg(error ? { error: error.message ?? "Couldn't change the password." } : { ok: "Password changed. Other devices were signed out." });
      }}
    >
      <Field label="Current password">
        <Input name="current" type="password" required autoComplete="current-password" />
      </Field>
      <Field label="New password" hint="At least 8 characters.">
        <Input name="new" type="password" required minLength={8} autoComplete="new-password" />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit">Change password</Button>
        <Message msg={msg} />
      </div>
    </form>
  );
}

export function TwoFactorSettings({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [setup, setSetup] = useState<{ qr: string; secret: string; backupCodes: string[] } | null>(null);

  if (enabled) {
    return (
      <form
        className="space-y-3"
        action={async (formData) => {
          const { error } = await authClient.twoFactor.disable({ password: String(formData.get("password") ?? "") });
          if (error) return setMsg({ error: error.message ?? "Couldn't turn it off." });
          setMsg({ ok: "Two-step verification is off." });
          router.refresh();
        }}
      >
        <p className="text-sm">✓ On. You&apos;ll be asked for a code when you sign in.</p>
        <Field label="Password to turn it off">
          <Input name="password" type="password" required autoComplete="current-password" className="max-w-xs" />
        </Field>
        <div className="flex items-center gap-3">
          <Button type="submit" variant="secondary">
            Turn off
          </Button>
          <Message msg={msg} />
        </div>
      </form>
    );
  }

  if (setup) {
    return (
      <form
        className="space-y-4"
        action={async (formData) => {
          const { error } = await authClient.twoFactor.verifyTotp({ code: String(formData.get("code") ?? "").replace(/\s/g, "") });
          if (error) return setMsg({ error: error.message ?? "That code didn't work. Check the time on your phone and try again." });
          setSetup(null);
          setMsg({ ok: "Two-step verification is on." });
          router.refresh();
        }}
      >
        <p className="text-sm">1. Scan this with your authenticator app.</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={setup.qr} alt="QR code for your authenticator app" width={180} height={180} className="rounded bg-white p-2" />
        <p className="text-xs text-muted">
          Can&apos;t scan? Enter this key: <code className="font-mono">{setup.secret}</code>
        </p>
        <p className="text-sm">2. Save these backup codes somewhere safe. Each works once if you lose your phone.</p>
        <pre tabIndex={0} className="rounded-md border border-border bg-background p-3 font-mono text-xs">
          {setup.backupCodes.join("\n")}
        </pre>
        <Field label="3. Enter the 6-digit code from the app">
          <Input name="code" required inputMode="numeric" autoComplete="one-time-code" className="max-w-40" />
        </Field>
        <div className="flex items-center gap-3">
          <Button type="submit">Turn on</Button>
          <Message msg={msg} />
        </div>
      </form>
    );
  }

  return (
    <form
      className="space-y-3"
      action={async (formData) => {
        const { data, error } = await authClient.twoFactor.enable({ password: String(formData.get("password") ?? "") });
        if (error || !data || data.method !== "totp") return setMsg({ error: error?.message ?? "Couldn't start setup." });
        const secret = new URL(data.totpURI).searchParams.get("secret") ?? "";
        setSetup({ qr: await QRCode.toDataURL(data.totpURI, { margin: 1, width: 180 }), secret, backupCodes: data.backupCodes });
        setMsg(null);
      }}
    >
      <Field label="Confirm your password to set it up">
        <Input name="password" type="password" required autoComplete="current-password" className="max-w-xs" />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit">Set up</Button>
        <Message msg={msg} />
      </div>
    </form>
  );
}

export function DeleteAccount() {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      action={async (formData) => {
        if (!confirm("Delete your account? This can't be undone.")) return;
        const { error } = await authClient.deleteUser({ password: String(formData.get("password") ?? "") });
        if (error) return setMsg({ error: error.message ?? "Couldn't delete the account." });
        router.push("/");
      }}
    >
      <Field label="Password">
        <Input name="password" type="password" required autoComplete="current-password" className="max-w-xs" />
      </Field>
      <Button type="submit" variant="danger">
        Delete my account
      </Button>
      <div className="w-full">
        <Message msg={msg} />
      </div>
    </form>
  );
}
