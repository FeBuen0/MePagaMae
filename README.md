# MePagaMãe

Family expense submissions and reimbursements, in Brazilian Portuguese. The interface is designed for a parent to review expenses and for children to submit only their own.

[Abrir o site](https://conta-em-casa-felipe.pzfs2wxpk4.chatgpt.site) · [Repositório](https://github.com/FeBuen0/MePagaMae)

## Run locally

Requires Node.js 22.13 or newer. Run `npm ci`, then `npm run dev`. Use `npm run check` for the currency/import checks and TypeScript, or `npm run build` for a production build. The PDF worker is generated from the locked dependency during development and builds.

## Current behavior

- A clearly labeled, in-memory demonstration is available before a family is configured. Demonstration records are never inserted into a real database.
- Visitors sign in through the Sites platform using their own ChatGPT accounts. The Sites server passes the verified per-site user ID to the backend; clients cannot select a live role.
- The family creator chooses their own role and generates one-use invitations for others. The parent role is unique per family. Family creation, invite redemption, expense batches and batch payments are atomic database operations.
- Children can see their own expenses only and can edit/delete only expenses still awaiting review. The parent can review, approve, decline and mark approved expenses paid. No funds are transferred by this app.
- Values are stored as integer cents. Pending and approved unpaid amounts are shown separately. Export downloads the current filtered view as CSV.
- CSV and OFX import, plus text-selectable PDFs, are supported. The account/card selector determines which value sign is an expense in CSVs. The import preview requires confirmation and a category for every selected row. Receipts are optional, private, and downloaded through short-lived signed URLs. OCR/AI is not enabled.

## Supabase connection

This project deliberately does not fall back to browser-local records when the database is unavailable. Real submission stays gated until a Supabase project is connected.

1. In a free Supabase project, run `supabase/migrations/202611250001_family.sql` once. Use the SQL editor or the Supabase migration interface. It creates the tables, restricted server RPCs, and the private `cec-receipts` bucket.
2. Generate a cryptographically random server secret of at least 32 bytes. Keep it out of source control and client code. Configure its SHA-256 hex digest in `APP_SECRET_SHA256` in `supabase/functions/family-api/index.ts`.
3. Deploy that file to a Supabase Edge Function named `family-api`. It uses built-in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Disable Supabase JWT verification for this one endpoint: it has its own mandatory high-entropy server-secret authentication and does not accept browser identity. See `supabase/config.toml`.
4. Set the Sites runtime secrets `SUPABASE_EDGE_URL` to the deployed function URL and `FAMILY_API_SECRET` to the original server secret. Redeploy the Site to apply runtime environment changes.
5. Sign in, create the family, choose **Enviar meus gastos** for Felipe, and generate an invitation with the parent role for the mother. The other child gets a child-role invitation. No email is sent by the app.
6. The Site is initially owner-private. Grant the family's accounts access through the Site sharing controls before they can open their invitation links. Application invitations do not change the hosting audience.

RLS is enabled on all application tables, with all direct anon/authenticated access revoked. Database and storage service credentials stay within the Supabase function. Its mandatory server-secret check authenticates the Sites backend. Every action then checks verified family membership and role before reading or writing records.

## Verification

- `node scripts/check-behavior.mjs` tests currency parsing, category rules, dates, CSV account/card sign conventions, credit/refund exclusion, quoted CSV records, OFX, and text-extracted statement lines.
- `npx tsc --noEmit` validates the Site source. Supabase/Deno source is separately deployed and excluded from the Site TypeScript project.
- Build through the Sites `build-site.mjs` helper.
- Browser QA covered the parent and child screens, a 390px mobile viewport, manual submissions, auto categorization, and review/approval balance changes in demonstration mode. Browser file upload was blocked by permissions; the full file chooser/PDF worker flow and live Supabase operations still require validation after connection.
