import { createAuthClient } from "better-auth/react";
import { magicLinkClient, organizationClient, twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [
    organizationClient(),
    magicLinkClient(),
    twoFactorClient({
      onTwoFactorRedirect() {
        const next = new URLSearchParams(location.search).get("next");
        // A full navigation is intended here (this runs outside React).
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        location.href = `/two-factor${next ? `?next=${encodeURIComponent(next)}` : ""}`;
      },
    }),
  ],
});
