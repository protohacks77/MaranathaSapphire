const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const modules = {};
for (const name of ['reportFormatting', 'reportA4', 'billDocument']) {
    const exported = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(`services/${name}.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exported, require: path => modules[path.replace('./', '')] });
    modules[name] = exported;
}
const bill = { id: 'invoice-123', patientName: '<script>Patient</script>', patientHospitalNumber: 'MH001', date: '2026-09-24', status: 'Unpaid', paymentMethod: 'Cash', totalBill: 60, amountPaidAtTimeOfBill: 0, balance: 60, items: [{ description: 'Bed charge', quantity: 1, unitPrice: 60, totalPrice: 60 }] };
const render = modules.billDocument.billDocumentPages;
const short = render(bill);
assert.equal(short.length, 1);
assert.ok(short[0].includes('&lt;script&gt;Patient&lt;/script&gt;'));
assert.ok(!short[0].includes('<script>'));
assert.match(short[0], /On Credit/);
assert.match(render(bill, true)[0], />RECEIPT</);
const pages = render({ ...bill, items: Array.from({ length: 120 }, (_, i) => ({ ...bill.items[0], description: `Service-${i}` })) });
assert.ok(pages.length > 1);
const all = pages.join('');
for (let i = 0; i < 120; i++) assert.equal(all.split(`>Service-${i}</text>`).length - 1, 1);
assert.equal(all.split('>Balance due</text>').length - 1, 1);
for (const page of pages) {
    assert.match(page, />DESCRIPTION</);
    for (const match of page.matchAll(/<rect[^>]*y="([\d.]+)"[^>]*height="([\d.]+)"/g)) assert.ok(Number(match[1]) + Number(match[2]) <= 1040);
}
const long = render({ ...bill, items: [{ ...bill.items[0], description: 'Long description '.repeat(1000) }] });
assert.ok(long.length > 1);
console.log('Invoice checks passed: escaping, receipt title, totals, pagination, repeated headers and oversized descriptions.');
