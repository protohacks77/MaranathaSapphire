#!/usr/bin/env node
// Preview by default. Credentials are read from GOOGLE_APPLICATION_CREDENTIALS.
const fs = require('node:fs');

function isTestName(...names) {
  return names.some(name => typeof name === 'string' && /(^|[^\p{L}\p{N}])test($|[^\p{L}\p{N}])/iu.test(name));
}

function linkedToPatient(data, patients, bills) {
  return patients.has(data.patientId) || patients.has(data.recipientPatientId) || bills.has(data.billId);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: GOOGLE_APPLICATION_CREDENTIALS=/path/key.json node scripts/removeTestData.cjs --project PROJECT_ID [--apply]');
    return;
  }
  let project;
  let apply = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') apply = true;
    else if (args[i] === '--project' && args[i + 1] && !args[i + 1].startsWith('--')) project = args[++i];
    else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
  }
  if (!project) throw new Error('Supply --project PROJECT_ID explicitly.');
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath) throw new Error('Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path.');
  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  if (key.type !== 'service_account' || key.project_id !== project) {
    throw new Error('The service account must belong to the specified project.');
  }
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('Unset emulator environment variables before using this service account script.');
  }
  const { initializeApp, cert, deleteApp } = require('firebase-admin/app');
  const { getFirestore, FieldPath } = require('firebase-admin/firestore');
  const { getAuth } = require('firebase-admin/auth');
  const app = initializeApp({ credential: cert(key), projectId: project });
  const db = getFirestore(app);
  const auth = getAuth(app);
  // Page scans to avoid loading the entire database in memory.
  async function scan(collection, visit) {
    let cursor;
    while (true) {
      let query = db.collection(collection).orderBy(FieldPath.documentId()).limit(300);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      for (const doc of page.docs) visit(doc);
      if (page.size < 300) break;
      cursor = page.docs[page.docs.length - 1];
    }
  }
  try {
    const roots = new Map();
    const patients = new Set();
    const users = new Set();
    const bills = new Set();
    const authUsers = new Map();
    function add(doc, reason) { roots.set(doc.ref.path, reason); }
    await scan('patients', doc => {
      const data = doc.data();
      if (isTestName(data.name, data.surname)) {
        patients.add(doc.id);
        add(doc, `test patient: ${data.name || ''} ${data.surname || ''}`);
      }
    });
    await scan('users', doc => {
      const data = doc.data();
      if (isTestName(data.name, data.surname)) {
        users.add(doc.id);
        add(doc, `test user: ${data.name || ''} ${data.surname || ''}`);
      }
    });
    let pageToken;
    do {
      const page = await auth.listUsers(1000, pageToken);
      for (const user of page.users) {
        if (users.has(user.uid) || isTestName(user.displayName)) {
          users.add(user.uid);
          authUsers.set(user.uid, user.displayName || '(matched Firestore profile)');
          roots.set(`users/${user.uid}`, 'test Auth user profile and subcollections');
        }
      }
      pageToken = page.pageToken;
    } while (pageToken);
    await scan('bills', doc => {
      if (patients.has(doc.data().patientId)) { bills.add(doc.id); add(doc, 'test patient bill'); }
    });
    for (const collection of ['payments', 'dispensingRecords', 'inventoryLogs']) {
      await scan(collection, doc => {
        if (linkedToPatient(doc.data(), patients, bills)) add(doc, 'test patient transaction');
      });
    }
    await scan('notifications', doc => {
      const data = doc.data();
      if (users.has(data.recipientId) || users.has(data.senderId) || linkedToPatient(data, patients, bills)) {
        add(doc, 'test user or patient notification');
      }
    });
    await scan('chats', doc => {
      if ((doc.data().participants || []).some(id => users.has(id))) add(doc, 'chat involving test user');
    });
    const cachePaths = [];
    if (roots.size || authUsers.size) {
      await scan('users', doc => {
        if (!users.has(doc.id)) cachePaths.push(`${doc.ref.path}/summaries/inbox`);
      });
      for (const ref of await db.collection('summaries').listDocuments()) cachePaths.push(ref.path);
    }
    console.log(`${apply ? 'DELETE' : 'PREVIEW'} — project ${project}`);
    for (const [path, reason] of roots) console.log(`${path} — ${reason} (including all subcollections)`);
    for (const [uid, name] of authUsers) console.log(`Auth/${uid} — ${name}`);
    console.log(`${patients.size} patients, ${users.size} user IDs, ${roots.size} Firestore roots, ${authUsers.size} Auth accounts.`);
    for (const path of cachePaths) console.log(`${path} — clear summary cache`);
    console.log('Inventory quantities are not reversed. Uploaded attachments are not deleted.');
    if (!apply) {
      console.log('No writes performed. Review the preview, then rerun with --apply to delete.');
      return;
    }
    // Linked roots go first; retain named profiles until their linked cleanup succeeds.
    const ordered = [...roots.keys()].sort((a, b) => {
      const profile = path => /^(patients|users)\//.test(path) ? 1 : 0;
      return profile(a) - profile(b);
    });
    for (const path of ordered) {
      await db.recursiveDelete(db.doc(path));
      console.log(`Deleted ${path}`);
    }
    for (const uid of authUsers.keys()) {
      try { await auth.deleteUser(uid); }
      catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
      console.log(`Deleted Auth/${uid}`);
    }
    // Refresh surviving inbox caches after deleting shared chats and notifications.
    for (const path of cachePaths) await db.recursiveDelete(db.doc(path));
    console.log('Cleanup complete.');
  } finally {
    await deleteApp(app);
  }
}

module.exports = { isTestName, linkedToPatient };
if (require.main === module) main().catch(error => {
  console.error(`Cleanup failed: ${error.message}`);
  process.exitCode = 1;
});
