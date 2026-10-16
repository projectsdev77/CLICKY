# End-to-end tests

Browser tests that drive the real dashboard and the demo app. They expect:

- Postgres with migrations applied and `pnpm db:seed` run (they reset the seed project's data)
- `apps/web` running on :3000 (`pnpm --filter @clicky/web build && pnpm --filter @clicky/web start`), with
  `CLICKY_ALLOW_PRIVATE_FETCH=1` so the crawler can read the demo help center on localhost, and no Anthropic key
  (or `CLICKY_ASSISTANT_PROVIDER=stub`) so answers are deterministic
- `apps/demo` running on :5173
- `psql` on the PATH

```sh
cd e2e && pnpm install
CHROMIUM_PATH=/path/to/chromium pnpm all   # omit CHROMIUM_PATH if Playwright browsers are installed
```

Speech is faked in the browser (`SpeechRecognition` and `speechSynthesis`), so the voice tests need no microphone.
Screenshots land in `e2e/screenshots/`.
