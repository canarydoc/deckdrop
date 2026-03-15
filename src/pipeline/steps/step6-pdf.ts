/**
 * Step 6 — Convert Markdown report → HTML → PDF via Puppeteer.
 */
import puppeteer from 'puppeteer';
import { marked } from 'marked';

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.35;
    color: #111;
    background: #fff;
  }

  .page {
    max-width: 100%;
    margin: 0 auto;
    padding: 0;
  }

  h1 { font-size: 14pt; font-weight: 700; color: #0f172a; margin: 16px 0 6px; border-bottom: 2px solid #0f172a; padding-bottom: 3px; }
  h2 { font-size: 12pt; font-weight: 700; color: #1e3a5f; margin: 12px 0 4px; border-bottom: 1px solid #cbd5e1; padding-bottom: 2px; }
  h3 { font-size: 10.5pt; font-weight: 700; color: #334155; margin: 8px 0 3px; }
  h4 { font-size: 10pt; font-weight: 700; color: #475569; margin: 6px 0 2px; }

  p { margin-bottom: 4px; }
  ul, ol { margin: 2px 0 5px 16px; }
  li { margin-bottom: 1px; }

  strong { font-weight: 700; }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 6px 0;
    font-size: 7.5pt;
  }
  th {
    background: #0f172a;
    color: white;
    padding: 3px 6px;
    text-align: left;
    font-weight: 700;
    white-space: nowrap;
  }
  td {
    padding: 3px 6px;
    border-bottom: 1px solid #e2e8f0;
    vertical-align: top;
  }
  tr:nth-child(even) td { background: #f8fafc; }

  blockquote {
    border-left: 3px solid #3b82f6;
    padding: 4px 8px;
    margin: 5px 0;
    background: #f0f7ff;
    color: #1e40af;
    font-size: 7.5pt;
  }

  code {
    background: #f1f5f9;
    padding: 1px 3px;
    border-radius: 2px;
    font-size: 7.5pt;
    font-family: monospace;
  }

  a { color: #1e40af; text-decoration: none; }
  a:hover { text-decoration: underline; }

  .sources-list { font-size: 7pt; color: #475569; }

  hr { border: none; border-top: 1px solid #cbd5e1; margin: 7px 0; }

  @page {
    margin: 10mm 12mm;
    size: A4;
  }

  @media print {
    h2 { page-break-before: auto; }
    table, blockquote { page-break-inside: avoid; }
  }
`;

export async function generatePdf(
  markdownReport: string,
  companyName: string
): Promise<Buffer> {
  const bodyHtml = await marked(markdownReport);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Deckdrop — ${companyName}</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="page">
    ${bodyHtml}
  </div>
</body>
</html>`;

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
