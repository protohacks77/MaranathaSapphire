const fs = require('node:fs');
const { indexSuggestion } = require('./firestoreIndexSuggestion.cjs');
const input = JSON.parse(fs.readFileSync('docs/firestore-index-verification.json', 'utf8'));
const grouped = new Map();
for (const {name,url,index: suppliedIndex} of input.links) {
 if (!url.startsWith('https://console.firebase.google.com/')) continue;
 const index = suppliedIndex || indexSuggestion({message:url});
 const key = index ? JSON.stringify(index) : url;
 if (!grouped.has(key)) grouped.set(key, {url,names:[]});
 grouped.get(key).names.push(name);
}
const labels = {
 pendingQueue:'Pharmacy pending queue',queueSearch:'Pharmacy queue search',patientBills:'Patient bills',patientPayments:'Patient payments',patientDispensed:'Patient dispensed medicines',inventorySearch:'Inventory search',patientListSearch:'Patient name search',staffSearch:'Staff search',priceSearch:'Price-list search',notifications:'Notifications',notificationsUnread:'Read/unread notifications',conversations:'Conversations',admitted:'Admitted patients',admittedSearch:'Admitted-patient search',wardPatients:'Ward occupancy',dischargeHistory:'Discharge history',paidPreview:'Paid/partially paid invoices',billAggregate:'Bill totals',billAggregateByDate:'Bill totals by date',inventoryAggregate:'Inventory totals',cashPaymentsAggregate:'Cash/EFT payment totals',
 'activity-bills':'Staff billing activity','activity-payments':'Staff payment activity','activity-patients':'Staff patient registration activity',
};
const label = names => [...new Set(names.map(name=>labels[name] || name.replace(/^patients-prefix([01])-status([01])-age([01])$/,(_,prefix,status,age)=>`Patient list: ${[prefix==='1'?'name search':'',status==='1'?'status filter':'',age==='1'?'age filter':''].filter(Boolean).join(' + ') || 'surname order'}`)))].join(' / ');
const markdown = '# Firestore index creation links\n\nThese links were returned by Firestore while checking the app’s live queries. Sign into a Google account with access to **maranathasapphire**. Open each link and click **Create**, then wait until every index is **Enabled** before retrying in the app. Several queries share one index; each link below appears once.\n\n';
const rows = [...grouped.values()].map(({url,names})=>({url,label:label(names)}));
fs.writeFileSync('docs/firestore-index-links.md',markdown+rows.map(row=>`- [ ] [${row.label}](${row.url})`).join('\n')+'\n\nAlternatively deploy firestore.indexes.json using the CLI from this repository:\n\n```sh\nnpx firebase-tools@14 login --reauth\nnpx firebase-tools@14 deploy --only firestore:indexes --project maranathasapphire --non-interactive\n```\n\nThe current CLI account (prominencek77@gmail.com) lacks project permissions. Sign into the project owner/editor account or ask the owner to grant the required permissions. Deploy without --force to preserve existing remote indexes.\n');
const escape = value => value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
fs.writeFileSync('docs/firestore-index-links.html',`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Firestore index setup</title><style>body{font:16px system-ui;background:#0d1117;color:#e5e7eb;max-width:950px;margin:40px auto;padding:0 20px}li{padding:16px;border-bottom:1px solid #30363d;display:flex;gap:14px;align-items:center}a{color:#38bdf8}small{color:#9ca3af}input{width:18px;height:18px}h1{font-size:28px}</style><h1>Firestore index setup</h1><p>Sign into the Google account that owns <strong>maranathasapphire</strong>. Open each link and click <strong>Create</strong>. Wait for all indexes to become <strong>Enabled</strong>, then retry loading records.</p><p><small>${rows.length} distinct missing indexes · Verified ${escape(input.checkedAt)}</small></p><ul>${rows.map(row=>`<li><input type="checkbox" aria-label="Completed ${escape(row.label)}"><a href="${escape(row.url)}" target="_blank" rel="noopener noreferrer">${escape(row.label)}</a></li>`).join('')}</ul></html>`);
console.log(JSON.stringify({distinctMissingIndexes:rows.length,markdown:'docs/firestore-index-links.md',html:'docs/firestore-index-links.html'}));
