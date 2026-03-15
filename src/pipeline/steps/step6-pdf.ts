/**
 * Step 6 — Convert Markdown report → HTML → PDF via Puppeteer.
 */
import puppeteer from 'puppeteer';
import { marked } from 'marked';

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', -apple-system, sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #1a1a2e;
    background: #fff;
  }

  .page {
    max-width: 800px;
    margin: 0 auto;
    padding: 40px 48px;
  }

  .cover {
    text-align: center;
    padding: 80px 48px 60px;
    background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%);
    color: white;
    margin-bottom: 0;
  }

  .cover .logo { font-size: 13pt; letter-spacing: 3px; opacity: 0.7; margin-bottom: 48px; }
  .cover h1 { font-size: 28pt; font-weight: 700; margin-bottom: 12px; }
  .cover .subtitle { font-size: 13pt; opacity: 0.8; margin-bottom: 48px; }
  .cover .meta { font-size: 10pt; opacity: 0.6; }

  h1 { font-size: 18pt; font-weight: 700; color: #0f172a; margin: 32px 0 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
  h2 { font-size: 14pt; font-weight: 600; color: #1e3a5f; margin: 24px 0 12px; }
  h3 { font-size: 12pt; font-weight: 600; color: #334155; margin: 20px 0 8px; }

  p { margin-bottom: 12px; }
  ul, ol { margin: 8px 0 12px 24px; }
  li { margin-bottom: 4px; }

  strong { font-weight: 600; color: #0f172a; }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0;
    font-size: 10pt;
  }
  th {
    background: #0f172a;
    color: white;
    padding: 8px 12px;
    text-align: left;
    font-weight: 600;
  }
  td {
    padding: 8px 12px;
    border-bottom: 1px solid #e2e8f0;
  }
  tr:nth-child(even) td { background: #f8fafc; }

  blockquote {
    border-left: 4px solid #3b82f6;
    padding: 12px 16px;
    margin: 16px 0;
    background: #f0f7ff;
    color: #1e40af;
    border-radius: 0 4px 4px 0;
  }

  code {
    background: #f1f5f9;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 9.5pt;
    font-family: 'JetBrains Mono', monospace;
  }

  pre {
    background: #0f172a;
    color: #e2e8f0;
    padding: 16px;
    border-radius: 6px;
    overflow-x: auto;
    margin: 12px 0;
  }

  pre code { background: none; padding: 0; color: inherit; }

  hr { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }

  @page {
    margin: 0;
    size: A4;
  }

  @media print {
    .cover { page-break-after: always; }
    h1 { page-break-before: auto; }
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
  <div class="cover">
    <div class="logo">DECKDROP</div>
    <h1>${companyName}</h1>
    <div class="subtitle">Investment Due Diligence Report</div>
    <div class="meta">Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
  </div>
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
