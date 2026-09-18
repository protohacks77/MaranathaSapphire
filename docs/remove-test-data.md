Run from the repository root. Install dependencies with `npm install` first.

Keep the service account JSON outside the repository and use an account with
Firestore read/delete and Firebase Authentication list/delete permissions.

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/service-account.json"
node scripts/removeTestData.cjs --project maranathasapphire
```

The default run only previews. After reviewing every listed ID, delete with:

```bash
node scripts/removeTestData.cjs --project maranathasapphire --apply
```

Matching uses the word `test`, case insensitive, in patient/user name or surname,
or Auth display name. `Test Patient` matches; `Tester` and `Testimony` do not.
Email addresses are not used to select accounts.

The script deletes patient and user documents recursively, linked bills,
payments, dispensing records and inventory logs, matching Auth accounts, chats
involving test users (including the other participant's messages), and
notifications sent to/from those users or explicitly linked by patient/bill ID.
Surviving inbox caches and global summary caches are cleared for regeneration.
Records for real patients are preserved even when created by test staff.

Inventory quantities are not reversed, uploaded attachment files are not
removed, and text-only references without IDs are not matched. Stop app writes
during cleanup. Deletes are permanent and not atomic; a failure may leave a
partial cleanup. Each successful deletion is logged. Named profiles are deleted
after linked records so most interrupted runs can rediscover the same targets.
