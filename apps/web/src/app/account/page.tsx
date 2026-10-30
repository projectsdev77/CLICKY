import { requireUser } from "@/lib/dal";
import { Card } from "@/components/ui";
import { DeleteAccount, PasswordForm, ProfileForm, TwoFactorSettings } from "./account-forms";

export default async function AccountPage() {
  const { user } = await requireUser();
  const twoFactorEnabled = Boolean((user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled);
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Your account</h1>
      <Card title="Profile">
        <ProfileForm name={user.name} email={user.email} verified={user.emailVerified} />
      </Card>
      <Card title="Password">
        <PasswordForm />
      </Card>
      <Card
        title="Two-step verification"
        description="Ask for a code from an authenticator app (like 1Password, Google Authenticator or Authy) when you sign in."
      >
        <TwoFactorSettings enabled={twoFactorEnabled} />
      </Card>
      <Card title="Delete account" description="Removes your login. Your teams and their data stay unless you delete them.">
        <DeleteAccount />
      </Card>
    </div>
  );
}
