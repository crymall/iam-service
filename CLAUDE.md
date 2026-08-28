# iam-service

Express + PostgreSQL service handling identity, authentication, and permissions for every Midden app.
Routes live in `routes/`, migrations in `db/migrations/`.
Runs on port 3000 locally; the other apps reach it through the `/iam` path prefix (Vite proxy in dev, nginx ingress in production).

## Logging in locally

Login is two steps: `POST /auth/login` with username and password returns a `temp_token`, then `POST /auth/verify-login` exchanges that token plus a six-digit code for the session cookie.

Locally there is no mail server, so **the second factor is not emailed — it is printed to this service's own console**:

```
[DEV] Verification code for someone@example.com: 481920
```

That branch is gated on `SKIP_EMAIL_VERIFICATION=true` in `.env` (`routes/auth.js`).
When the flag is set the same code is also returned in the login response as `dev_code`, so an automated client can read it without scraping stdout.
Unset the flag and `sendVerificationEmail` is called for real instead.

Codes live in `verification_codes` and expire after 10 minutes; the `temp_token` expires on the same clock.

So: watch the terminal running `npm start` for iam-service, not the browser console and not canteen-service's log.
