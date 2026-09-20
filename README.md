# Fastmail Unsubscribe

A private, Inbox-only Fastmail subscription scanner and unsubscribe dashboard.

The app scans headers and basic metadata for messages currently in the Fastmail Inbox. It does not scan Archive, custom folders, Sent, Drafts, Spam, or Trash. Standards-compliant RFC 8058 requests can be sent after confirmation; other methods are handed back as manual links.

## Local development

1. Copy `.dev.vars.example` to `.dev.vars` and supply a base64-encoded 32-byte key plus a local email identity.
2. Copy `wrangler.example.jsonc` to `wrangler.jsonc`. The real deployment configuration is intentionally ignored because it contains account-specific resource identifiers.
3. Apply the local D1 migration:

   ```sh
   npm run db:migrate:local
   ```

4. Start the Cloudflare-compatible development server:

   ```sh
   npm run dev
   ```

5. Open `http://localhost:3000`.

## Deployment checklist

These are the external pieces the repository cannot create without access to your accounts.

1. **Cloudflare account and Workers project**
   - Sign in with Wrangler: `npx wrangler login`.
   - The first deployment creates the `fastmail-unsubscribe` Worker.

2. **Cloudflare D1 database**
   - Run `npx wrangler d1 create fastmail-unsubscribe`.
   - Copy the returned database ID into `wrangler.jsonc`, replacing `00000000-0000-0000-0000-000000000000`.
   - Run `npm run db:migrate:remote`.

3. **Production encryption secret**
   - Generate a fresh 32-byte value: `openssl rand -base64 32`.
   - Save it without putting it in source control: `npx wrangler secret put CREDENTIALS_KEY`.
   - Do not reuse the local example key.

4. **Configure the production hostname and deploy the Worker**
   - Copy `wrangler.example.jsonc` to the ignored `wrangler.jsonc`, then add your production hostname and D1 database ID.
   - Keep `workers_dev` set to `false`; production is served only from the custom domain.
   - Run `npm run build`.
   - Run `npm run deploy`.

5. **Enable login in Cloudflare Access (recommended: email code)**
   - In Cloudflare Zero Trust, go to Integrations → Identity providers → Add new identity provider.
   - Select **One-time PIN**. This requires no OAuth client, callback URL, or client secret.
   - If you prefer Google OAuth instead, first find your team name under Zero Trust → Settings. In Google, use `https://<team-name>.cloudflareaccess.com` as the authorized JavaScript origin and `https://<team-name>.cloudflareaccess.com/cdn-cgi/access/callback` as the authorized redirect URI. Then paste Google's client ID and secret into the Cloudflare Google identity provider.

6. **Protect the application with Cloudflare Access**
   - Create a Self-hosted Access application for your production custom domain.
   - Add an Allow policy whose Include rule is **Emails** and contains only your exact email address.
   - Select One-time PIN (or Google, if configured) as the application's login method.
   - Do not create a public bypass policy.
   - Copy the application Audience (AUD) tag and your full team domain, such as `https://your-team.cloudflareaccess.com`.
   - Store both values outside source control:

     ```sh
     npx wrangler secret put ACCESS_TEAM_DOMAIN
     npx wrangler secret put ACCESS_AUD
     ```

   - The Worker rejects requests unless the signed Access JWT has a valid signature, issuer, audience, and email claim.

7. **Fastmail JMAP API token**
   - In Fastmail, open Settings → Privacy & Security → API tokens.
   - Create a token with Mail access. The app reads Inbox metadata and can move explicitly selected messages to Trash; it never permanently destroys mail or needs your normal password.
   - Paste the token into the app's Connect Fastmail screen after deployment.
   - Fastmail Basic plans do not provide API tokens.

8. **First production test**
   - Sign in through Google/Cloudflare Access.
   - Connect Fastmail and run an Inbox scan.
   - Test one manual unsubscribe before testing an RFC 8058 one-click request.
   - Confirm the Activity screen contains no full unsubscribe URLs or token material.

## Commands

```sh
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run db:migrate:local
npm run db:migrate:remote
npm run deploy
```
