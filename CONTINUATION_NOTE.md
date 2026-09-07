# Inventory Management App — Continuation Note

Updated: 7 September 2026 (Asia/Kolkata)

## Password recovery update

- Added a `Forgot password?` action to the login screen.
- Supabase Auth sends the reset email to the entered user email address.
- The emailed recovery link returns the user to the app and shows a dedicated new-password form.
- The form requires at least eight characters and matching password confirmation, then signs the user out so they can log in with the new password.
- Deployed to `https://fedora-inventory-management.web.app` on 7 September 2026 and verified that the live login page shows the action without browser errors.
- The production URL should be listed in Supabase Authentication redirect URLs for emailed recovery links to return to the live app; dashboard verification is pending because a fresh Supabase dashboard sign-in is required.

## Backup review

The transferred backups were treated as read-only. Relevant transcripts were found under:

- `/Users/macmarketing/Documents/Codex Chat Backup/sessions/`
- `/Users/macmarketing/Documents/Codex Chat Backup/archived_sessions/`

`/Users/macmarketing/Documents/Codex Chat Backup` is a symbolic link to the transferred backup at `/Users/macmarketing/Documents/Codex-Mac-Transfer/Codex Chat Backup`. The separate `/Users/macmarketing/Documents/Codex` folder did not contain a newer substantive Inventory Management App transcript.

The newest substantive app transcript is:

- `sessions/2026/07/04/rollout-2026-07-04T16-35-50-019f2cce-6202-7812-a64f-d96752318538.jsonl`

Although its filename starts on 4 July, the same transcript continues through 15 July 2026. Later transcripts that mention the app are approval-review copies or unrelated conversations rather than newer implementation work.

## Decisions and completed work

- Production hosting project: `fedora-inventory-management`.
- Live URL: `https://fedora-inventory-management.web.app`.
- Supabase is used for cloud state and the `send-issue-alert` Edge Function.
- Dispatch Planning keeps calculation logic while presenting concise tables.
- Dispatch Planning status filters are multi-select: Recommended, Manual Dispatch, and Covered.
- The Recommended footer total represents all visible filtered rows.
- A separate left-side total represents selected-only pattern count, boxes/loose rolls, and rolls.
- Dispatch checkbox selections persist by warehouse and SKU across refresh/navigation.
- Creating a pallet-ready SO clears the covered selections.
- The extra checkbox focus rectangle was removed.
- Manual issue emails are working.
- Automatic technical-error emails are enabled for runtime errors and unhandled promise failures.
- The temporary `Test Error Alert` button was tested successfully and then removed.
- Automatic alert sending has recursion protection and a 30-minute duplicate guard for the same error/page.
- The Catalogue Master sticky-header bug that caused repeated `classList.add` errors was fixed and deployed on 15 July.
- The Firebase CLI sometimes reports authentication/update-check/network warnings even after a successful release; deployment success must be judged by the explicit Hosting release output.

## Most recent requested feature

Add a `Create SO on Zoho` action to Dispatch Planning so the warehouse manager can create a Zoho Inventory Sales Order from selected SKUs and exact roll quantities without exporting and copy/pasting Excel data.

Agreed architecture:

1. Browser sends the selected dispatch lines to a secure Supabase Edge Function.
2. The Edge Function exchanges a Zoho refresh token for an access token.
3. The Edge Function calls the Zoho Inventory Sales Orders API.
4. The app records the returned Zoho Sales Order ID and number.
5. The UI prevents duplicate clicks/syncs and shows the created SO number.

Safety decision: the first version should create a **Draft Sales Order only** and be tested with one or two SKUs before wider use. OAuth credentials must be Supabase secrets and must never be stored in browser code or committed files.

## Unfinished work / required inputs

No Zoho integration code is present yet. Implementation is waiting for:

1. Zoho Inventory organization ID.
2. Zoho OAuth client ID, client secret, and refresh token with Sales Order creation access. These should be entered directly as Supabase secrets, not pasted into chat or saved in this repository.
3. The Zoho customer to use, including its `customer_id` (one transfer customer or separate Delhi/Bangalore customers).
4. Confirmation that Zoho item SKUs exactly match app SKUs; otherwise an App SKU to Zoho `item_id` mapping is required.
5. Source warehouse/location rules and relevant Zoho location/warehouse IDs.
6. Confirmation to keep the first version Draft-only (recommended).
7. The reference/naming convention Zoho should use for these dispatch SOs.

## Recommended next implementation sequence

1. Confirm the seven inputs above.
2. Add a database record for sync status and Zoho SO identity, with a unique idempotency key.
3. Add a secure Supabase `create-zoho-sales-order` Edge Function.
4. Add the Dispatch Planning button, confirmation summary, loading state, and already-synced state.
5. Dry-run payload validation without creating an external SO.
6. With explicit approval, create one Draft SO containing one or two test SKUs in Zoho.
7. Verify quantities, customer, warehouse/location, reference, and duplicate protection before enabling normal use.

## Current local verification

- The July 15 sticky-header correction is present in `app.js`.
- Persistent dispatch selections are present in `app.js`.
- Automatic error monitoring and issue-alert Edge Function are present.
- No `Create SO on Zoho` UI or Zoho Edge Function exists yet.
- `app.js` passes `node --check` using the bundled workspace Node.js runtime.
