'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createOfficePreview, OFFICE_PDF_SCRIPT} = require('./office-preview');

function fixture(name = 'Boot Claim.xlsm', bytes = Buffer.from('original Excel file bytes')) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'onboard-office-test-'));
  const attachment = {name, data: 'data:application/octet-stream;base64,' + bytes.toString('base64')};
  const record = {id: 'boot-claim-1', attachments: [attachment]};
  const saved = {ppe: [record]};
  return {temp, bytes, attachment, saved,
    readRecords: () => ({ok: true, data: saved}),
    cleanup: () => fs.rmSync(temp, {recursive: true, force: true})};
}

test('Excel form is exported from its exact saved bytes into a PDF and temp copies are removed', async () => {
  const x = fixture('../../../Gokhan Turedi.xlsm');
  let sourcePath;
  try {
    const preview = createOfficePreview({readRecords: x.readRecords, tempDirectory: () => x.temp,
      convertPdf: async (source, destination) => {
        sourcePath = source;
        assert.equal(path.basename(source), 'document.xlsm');
        assert.deepEqual(fs.readFileSync(source), x.bytes);
        fs.writeFileSync(destination, '%PDF-1.7\nMock PDF preview');
      }});
    const output = await preview('ppe', 'boot-claim-1', 0);
    assert.equal(output.ok, true);
    assert.equal(Buffer.from(output.data.split(',')[1], 'base64').toString(), '%PDF-1.7\nMock PDF preview');
    assert.equal(fs.existsSync(sourcePath), false);
    assert.deepEqual(Buffer.from(x.attachment.data.split(',')[1], 'base64'), x.bytes);
    assert.deepEqual(fs.readdirSync(x.temp), []);
  } finally { x.cleanup(); }
});

test('Word, Excel, and older supported spreadsheet formats use the same PDF route', async () => {
  for (const ext of ['.doc', '.docx', '.xls', '.xlsx', '.xlsm', '.xlsb', '.ods', '.csv']) {
    const x = fixture('attachment' + ext);
    try {
      const preview = createOfficePreview({readRecords: x.readRecords, tempDirectory: () => x.temp,
        convertPdf: async (_source, destination) => fs.writeFileSync(destination, '%PDF-1.7\nMock')});
      assert.equal((await preview('ppe', 'boot-claim-1', 0)).ok, true, ext);
    } finally { x.cleanup(); }
  }
});

test('Missing, oversized, unsupported and invalid attachments never reach the converter', async () => {
  const x = fixture();
  let calls = 0;
  try {
    const preview = createOfficePreview({readRecords: x.readRecords, tempDirectory: () => x.temp,
      convertPdf: async () => {calls++;}});
    assert.equal((await preview('ppe', 'missing', 0)).ok, false);
    assert.equal((await preview('ppe', 'boot-claim-1', -1)).ok, false);
    assert.equal((await preview('ppe', 'boot-claim-1', 3)).ok, false);
    x.attachment.name = 'unknown.exe';
    assert.match((await preview('ppe', 'boot-claim-1', 0)).error, /does not need/);
    x.attachment.name = 'Boot Claim.xlsm';
    x.attachment.data = 'not-base64';
    assert.match((await preview('ppe', 'boot-claim-1', 0)).error, /encoding/);
    x.attachment.data = 'data:application/octet-stream;base64,' + Buffer.alloc(15 * 1024 * 1024 + 1).toString('base64');
    assert.match((await preview('ppe', 'boot-claim-1', 0)).error, /invalid/);
    assert.equal(calls, 0);
    assert.deepEqual(fs.readdirSync(x.temp), []);
  } finally { x.cleanup(); }
});

test('Failed conversion keeps the original and cleans up temporary Office files', async () => {
  const x = fixture();
  let sourcePath;
  try {
    const preview = createOfficePreview({readRecords: x.readRecords, tempDirectory: () => x.temp,
      convertPdf: async source => {sourcePath = source; throw Error('Microsoft Excel is not installed');}});
    const result = await preview('ppe', 'boot-claim-1', 0);
    assert.deepEqual(result, {ok: false, error: 'Microsoft Excel is not installed'});
    assert.equal(fs.existsSync(sourcePath), false);
    assert.deepEqual(fs.readdirSync(x.temp), []);
    assert.deepEqual(Buffer.from(x.attachment.data.split(',')[1], 'base64'), x.bytes);
  } finally { x.cleanup(); }
});

test('SSOW Word previews fit wide tables to page using only temporary conversion and preserve original', async () => {
  const x = fixture('BHS Corrugator SSOW.doc', Buffer.from('unchanged original Word attachment'));
  let convertedOptions;
  try {
    x.saved.ssow = [{id:'ssow-1',attachments:[x.attachment]}];
    const preview=createOfficePreview({readRecords:x.readRecords,tempDirectory:()=>x.temp,
      convertPdf:async(source,destination,options)=>{
        convertedOptions=options;
        assert.equal(path.basename(source),'document.doc');
        assert.deepEqual(fs.readFileSync(source),x.bytes);
        fs.writeFileSync(destination,'%PDF-1.7\\nMock SSOW');
      }});
    const result=await preview('ssow','ssow-1',0);
    assert.equal(result.ok,true);
    assert.deepEqual(convertedOptions,{section:'ssow'});
    assert.deepEqual(Buffer.from(x.attachment.data.split(',')[1],'base64'),x.bytes);
    assert.deepEqual(fs.readdirSync(x.temp),[]);
  } finally {x.cleanup()}
});
test('Word layout adjustment applies only to SSOW previews and never saves the document',()=>{
  assert.match(OFFICE_PDF_SCRIPT,/ONBOARD_PREVIEW_SECTION -eq 'ssow'/);
  assert.match(OFFICE_PDF_SCRIPT,/\$table\.AutoFitBehavior\(2\)/);
  assert.match(OFFICE_PDF_SCRIPT,/\$document\.Repaginate\(\)/);
  assert.match(OFFICE_PDF_SCRIPT,/\$document\.Close\(0\)/);
  assert.doesNotMatch(OFFICE_PDF_SCRIPT,/\$document\.Save(?:As|As2)?\(/);
});
test('Microsoft Office opens files read-only with VBA macros and external link updates disabled', () => {
  assert.equal((OFFICE_PDF_SCRIPT.match(/AutomationSecurity = 3/g) || []).length, 2);
  assert.match(OFFICE_PDF_SCRIPT, /Workbooks\.Open\(\$source, 0, \$true\)/);
  assert.match(OFFICE_PDF_SCRIPT, /Documents\.Open\(\$source, \$false, \$true, \$false\)/);
  assert.match(OFFICE_PDF_SCRIPT, /AskToUpdateLinks = \$false/);
  assert.match(OFFICE_PDF_SCRIPT, /UpdateLinksAtOpen = \$false/);
});
