Database read optimization

Implemented behavior

- Patient overview reads the patient, registrar, and a stored count summary. It does not download medical collections. Admitted patients additionally read their latest admission; bed charges recheck current documents in a transaction only when due.
- Patient tabs fetch 25 documents per source collection, with cursor-based Load More. Clinical Notes initially fetches 25 doctor and 25 nurse notes. Repeat tab visits within 60 seconds reuse results. Adding a note reloads and recounts only its section.
- Patient, staff, inventory, price, discharge, notification, conversation, and activity lists are paginated. Search is applied before pagination, with a 300 ms debounce and normalized search prefixes.
- The pending medication queue keeps only 25 pending bills live. Historical pages load explicitly. Opening a bill reads only its distinct medications. Dispensing still rechecks stock and bill state atomically and retains patient history and audit records.
- Dashboard counters and financial totals use stored display summaries backed by aggregation queries. Dashboard summaries expire after 60 seconds; patient record count summaries after five minutes. These summaries never authorize a payment, stock change, or dispensing operation.
- Analytics queries bills and registrations for the selected period. Repeated period visits and supporting staff/pricing reads are cached.
- Report previews use totals and small samples. Detailed rankings and unique-patient previews load only when requested. Full report/export actions intentionally fetch the records needed for a complete output, filtered by date/report type.
- The sidebar watches one unread-message summary document rather than every conversation. Sending increments it atomically; reading a conversation decrements it in a transaction. The unread-notification listener remains limited to unread notifications.
- Only the latest 25 chat messages stay live; older messages load explicitly.
- Cached requests are deduplicated, expire, have a maximum of 300 entries, and are cleared on authentication changes. Offline Firestore persistence uses the compat SDK API.

Data migration

scripts/optimizeFirestore.cjs defaults to a dry-run. Supply FIREBASE_ADMIN_EMAIL and FIREBASE_ADMIN_PASSWORD through the environment, or pass --seed-admin to use the existing seeded administrator. --apply updates derived metadata; --verify tests representative bounded queries without modifying records.

The migration never changes quantities, patient balances, or clinical text. It adds search prefixes, stockValue/isLowStock, pharmacy bill summaries and pending-state metadata, current admission dates, and inbox counters. Legacy medical documents without an ordering timestamp get a null createdAt unless another recorded timestamp exists; it does not invent a note's time.

Applied on 17 September 2026: two patients, 12 users, two inventory items, two prices, four bills; one current admission date and 12 inbox summaries initialized. No stock quantity or balance adjustment was performed.

Remaining deployment requirement

All current query shapes were checked against the live project; missing-index creation links are available in [firestore-index-links.md](firestore-index-links.md) and [the browser checklist](firestore-index-links.html).

The current Firebase CLI account received HTTP 403 when listing this project's indexes. Representative live queries verified that new composite indexes are required. firestore.indexes.json contains the required index definitions and firebase.json references it. These optimizations are not ready for production until indexes are deployed and ready.

With an account that has Firestore index permissions, from the repository:

    firebase login --reauth
    firebase firestore:indexes --project maranathasapphire
    firebase deploy --only firestore:indexes --project maranathasapphire --non-interactive

Preserve any existing indexes and field overrides when deploying. The prepared configuration has not been merged with the remote definitions because the CLI account cannot list them. Do not use --force to delete existing indexes. After index construction completes, run:

    node scripts/optimizeFirestore.cjs --verify --seed-admin

Validation

    npm run typecheck
    npm test
    npm run build

Tests cover cache expiration and invalidation races, normalized search, patient overview read boundaries, section-specific loading and refresh, page cursors, inbox-counter concurrency and rollback, duplicate bed billing, dispensing transactions, and billing never deducting stock.

Measure production usage

Use Firebase Console → Firestore Database → Usage to compare reads per comparable clinic session before and after rollout. Separate the one-time migration and index initialization from normal daily activity. Test opening a profile, switching tabs repeatedly, searching, opening a pharmacy bill, and dispensing it. Record the number of active users and actions alongside the read totals. No percentage reduction has been measured yet.
