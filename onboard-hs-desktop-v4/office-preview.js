'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {execFile} = require('node:child_process');

const OFFICE_EXTENSIONS = new Set(['.doc', '.docx', '.xls', '.xlsx', '.xlsm', '.xlsb', '.ods', '.csv']);
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const MAX_PREVIEW_BYTES = 30 * 1024 * 1024;

// Excel/Word do the rendering, so cell widths, merge ranges, formulas, print areas,
// page breaks, fonts and layout follow the user's own Office installation. The
// source is opened read-only with macros disabled and is never written back.
const OFFICE_PDF_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$source = $env:ONBOARD_PREVIEW_SOURCE
$destination = $env:ONBOARD_PREVIEW_PDF
$extension = [IO.Path]::GetExtension($source).ToLowerInvariant()
if ($extension -in @('.xls', '.xlsx', '.xlsm', '.xlsb', '.ods', '.csv')) {
  $excel = $null
  $workbook = $null
  try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $excel.EnableEvents = $false
    $excel.AskToUpdateLinks = $false
    $excel.AutomationSecurity = 3
    $workbook = $excel.Workbooks.Open($source, 0, $true)
    $workbook.ExportAsFixedFormat(0, $destination)
  } finally {
    if ($null -ne $workbook) {
      $workbook.Close($false)
      [void][Runtime.InteropServices.Marshal]::ReleaseComObject($workbook)
    }
    if ($null -ne $excel) {
      $excel.Quit()
      [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
    }
  }
} else {
  $word = $null
  $document = $null
  try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $word.AutomationSecurity = 3
    $word.Options.UpdateLinksAtOpen = $false
    $document = $word.Documents.Open($source, $false, $true, $false)
    # Adjust only the disposable in-memory SSOW preview. Never save the Word source.
    # Word's PDF export otherwise clips fixed-width tables that extend beyond the page edge.
    if ($env:ONBOARD_PREVIEW_SECTION -eq 'ssow') {
      foreach ($table in $document.Tables) {
        # wdAutoFitWindow = 2. Fit wide procedure / hazard tables to printable page width.
        $table.AutoFitBehavior(2)
      }
      $document.Repaginate()
    }
    $document.ExportAsFixedFormat($destination, 17)
  } finally {
    if ($null -ne $document) {
      $document.Close(0)
      [void][Runtime.InteropServices.Marshal]::ReleaseComObject($document)
    }
    if ($null -ne $word) {
      $word.Quit()
      [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)
    }
  }
}
if (-not (Test-Path -LiteralPath $destination -PathType Leaf)) {
  throw 'Microsoft Office did not create a PDF preview.'
}
`;

function convertWithMicrosoftOffice(source, destination, options = {}) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', OFFICE_PDF_SCRIPT], {
      windowsHide: true,
      timeout: 90000,
      maxBuffer: 1024 * 1024,
      env: {...process.env, ONBOARD_PREVIEW_SOURCE: source, ONBOARD_PREVIEW_PDF: destination, ONBOARD_PREVIEW_SECTION: options?.section || ''}
    }, (error, _stdout, stderr) => {
      if (!error) return resolve();
      const detail = String(stderr || error.message).trim().slice(0, 350);
      reject(new Error('Microsoft Office could not export the document. Check Excel/Word is installed and the file opens normally. ' + detail));
    });
  });
}

function createOfficePreview({readRecords, tempDirectory, convertPdf = convertWithMicrosoftOffice}) {
  return async function previewSavedOfficeAttachment(section, id, index) {
    let tempFolder;
    try {
      if (typeof section !== 'string' || typeof id !== 'string' ||
          !Number.isSafeInteger(index) || index < 0) throw Error('Invalid attachment selection');
      const saved = readRecords();
      if (!saved.ok || !saved.data) throw Error('Saved attachments are unavailable');
      const record = Array.isArray(saved.data[section]) ? saved.data[section].find(item => item.id === id) : null;
      const attachment = record?.attachments?.[index];
      if (!attachment || typeof attachment.name !== 'string' || typeof attachment.data !== 'string') throw Error('Attachment not found');
      const ext = path.extname(attachment.name).toLowerCase();
      if (!OFFICE_EXTENSIONS.has(ext)) throw Error('This file does not need an Office PDF preview');
      const match = /^data:[^,]*;base64,([a-zA-Z0-9+/=]+)$/.exec(attachment.data);
      if (!match || match[1].length > Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4 + 4) throw Error('Invalid attachment encoding');
      const original = Buffer.from(match[1], 'base64');
      if (!original.length || original.length > MAX_ATTACHMENT_BYTES) throw Error('Attachment size is invalid');

      tempFolder = await fs.promises.mkdtemp(path.join(tempDirectory(), 'Onboard-Office-Preview-'));
      const source = path.join(tempFolder, 'document' + ext);
      const destination = path.join(tempFolder, 'preview.pdf');
      await fs.promises.writeFile(source, original, {flag: 'wx', mode: 0o600});
      await convertPdf(source, destination, {section});
      const output = await fs.promises.readFile(destination);
      if (output.length < 5 || output.length > MAX_PREVIEW_BYTES || output.subarray(0, 5).toString() !== '%PDF-') {
        throw Error('Office returned an invalid or oversized PDF');
      }
      return {ok: true, data: 'data:application/pdf;base64,' + output.toString('base64')};
    } catch (error) {
      return {ok: false, error: error.message};
    } finally {
      if (tempFolder) await fs.promises.rm(tempFolder, {recursive: true, force: true});
    }
  };
}

module.exports = {createOfficePreview, convertWithMicrosoftOffice, OFFICE_PDF_SCRIPT};
