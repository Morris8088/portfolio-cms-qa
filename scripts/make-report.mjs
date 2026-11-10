// ============================================================
// make-report.mjs —— 把三份结果汇总成一份能直接给面试官看的 HTML
// ------------------------------------------------------------
// 数据来自三处，缺任何一份都能出报告（不会因为没有某次运行就崩）：
//   cases/testcases.json          用例清单（单一数据源）
//   reports/run-summary.json      本次两层运行的通过/失败、耗时
//   reports/playwright-results.json  Playwright 的逐条用例结果
//
// 单独运行：npm run report（npm test 结束时也会自动调一次）
// ============================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const REPORTS = resolve(ROOT, 'reports');
mkdirSync(REPORTS, { recursive: true });

function readJson(rel, fallback) {
  try {
    return JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8'));
  } catch {
    return fallback;
  }
}

const casesDoc = readJson('cases/testcases.json', { cases: [] });
const summary = readJson('reports/run-summary.json', null);
const pw = readJson('reports/playwright-results.json', null);
const cases = casesDoc.cases || [];

const automated = cases.filter((c) => c.status === 'automated');
const practice = cases.filter((c) => c.status === 'practice');
const p0 = cases.filter((c) => c.priority === 'P0');

// 自己写的小工具：把内容里的 < > & 转义，避免用例标题里的符号把 HTML 弄坏
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[ch]));

function resultCard(r) {
  if (!r) return '';
  const color = r.ok ? '#0f9d58' : '#d93025';
  const label = r.ok ? '通过' : '失败';
  return `<div class="card">
      <div class="card-name">${esc(r.name)}</div>
      <div class="card-state" style="color:${color}">${label}</div>
      <div class="card-meta">耗时 ${(r.durationMs / 1000).toFixed(1)}s · 退出码 ${r.exitCode}</div>
    </div>`;
}

const pwStats = pw?.stats
  ? `<div class="note">Playwright 明细：通过 ${pw.stats.expected ?? 0} · 失败 ${pw.stats.unexpected ?? 0} · 跳过 ${pw.stats.skipped ?? 0}</div>`
  : '';

const pwLink = existsSync(resolve(REPORTS, 'playwright/index.html'))
  ? '<a class="link" href="playwright/index.html">打开 Playwright 逐条报告（含失败截图 / trace）→</a>'
  : '';

const rows = cases.map((c) => {
  const badge = c.status === 'automated'
    ? '<span class="tag green">已自动化</span>'
    : '<span class="tag amber">练习位</span>';
  const layer = c.layer === 'api'
    ? '<span class="tag blue">接口层</span>'
    : '<span class="tag purple">页面层</span>';
  return `<tr>
      <td class="mono">${esc(c.id)}</td>
      <td>${layer}</td>
      <td>${esc(c.module)}</td>
      <td>${esc(c.title)}</td>
      <td><span class="prio ${c.priority.toLowerCase()}">${esc(c.priority)}</span></td>
      <td>${esc(c.method)}</td>
      <td>${badge}</td>
      <td class="mono dim">${esc(c.file)}</td>
    </tr>`;
}).join('\n');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>portfolio-cms 测试报告</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin:0; padding:32px 24px 64px; background:#f6f8fb; color:#1f2733;
         font:14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; }
  .wrap { max-width:1080px; margin:0 auto; }
  h1 { font-size:26px; margin:0 0 6px; }
  .sub { color:#5b6b7f; margin:0 0 28px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:14px; margin-bottom:18px; }
  .card { background:#fff; border:1px solid #e3e9f0; border-radius:12px; padding:18px 20px; }
  .card-name { color:#5b6b7f; font-size:13px; }
  .card-state { font-size:26px; font-weight:700; margin:4px 0; }
  .card-meta { color:#8492a6; font-size:12px; }
  .stat { background:#fff; border:1px solid #e3e9f0; border-radius:12px; padding:16px 20px; }
  .stat b { font-size:22px; display:block; }
  .stat span { color:#5b6b7f; font-size:12px; }
  .note { color:#5b6b7f; font-size:13px; margin:12px 0; }
  .link { display:inline-block; margin:10px 0 22px; color:#1a6fd4; text-decoration:none; }
  .link:hover { text-decoration:underline; }
  h2 { font-size:17px; margin:28px 0 10px; }
  table { width:100%; border-collapse:collapse; background:#fff; border:1px solid #e3e9f0; border-radius:12px; overflow:hidden; }
  th,td { text-align:left; padding:10px 12px; border-bottom:1px solid #eef2f7; vertical-align:top; }
  th { background:#f0f4f9; color:#5b6b7f; font-weight:600; font-size:12px; white-space:nowrap; }
  tr:last-child td { border-bottom:none; }
  .mono { font-family:ui-monospace,Consolas,monospace; font-size:12px; white-space:nowrap; }
  .dim { color:#8492a6; }
  .tag { display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; white-space:nowrap; }
  .green { background:#e6f4ea; color:#137333; }
  .amber { background:#fef3e0; color:#a05a00; }
  .blue  { background:#e8f0fe; color:#1a56b0; }
  .purple{ background:#f1e9fd; color:#6b3bb5; }
  .prio { font-family:ui-monospace,Consolas,monospace; font-size:12px; font-weight:700; }
  .p0 { color:#d93025; } .p1 { color:#c07a00; } .p2 { color:#5b6b7f; }
  footer { margin-top:28px; color:#8492a6; font-size:12px; line-height:1.9; }
</style>
</head>
<body>
<div class="wrap">
  <h1>portfolio-cms · 自动化测试报告</h1>
  <p class="sub">被测系统：portfolio-cms ｜ 生成时间：${esc(summary?.generatedAt || '尚未运行 npm test')} ｜ Node ${esc(summary?.node || process.version)}</p>

  <div class="grid">
    ${(summary?.results || []).map(resultCard).join('') || '<div class="card">还没有运行记录，先执行 <code>npm test</code></div>'}
  </div>

  <div class="grid">
    <div class="stat"><b>${cases.length}</b><span>用例总数（用例清单）</span></div>
    <div class="stat"><b>${automated.length}</b><span>已自动化</span></div>
    <div class="stat"><b>${practice.length}</b><span>练习位（待补）</span></div>
    <div class="stat"><b>${p0.length}</b><span>P0 高优先级</span></div>
  </div>

  <div class="note">接口被测地址：${esc(summary?.apiBaseUrl || 'http://127.0.0.1:3301')}</div>
  <div class="note">页面被测地址：${esc(summary?.e2eBaseUrl || 'http://127.0.0.1:4173/portfolio-cms/')}</div>
  ${pwStats}
  ${pwLink}

  <h2>用例清单</h2>
  <table>
    <thead><tr><th>编号</th><th>层次</th><th>模块</th><th>用例标题</th><th>优先级</th><th>设计方法</th><th>状态</th><th>文件</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <footer>
    报告由 <code>scripts/make-report.mjs</code> 汇总生成，用例清单的唯一数据源是 <code>cases/testcases.json</code>；<br>
    文档与报告共用同一份数据，避免手写表格三处不一致。失败时 Playwright 会在 <code>reports/playwright/</code> 留下截图与 trace。<br>
    运行方式：<code>npm test</code>（两层全跑）· <code>npm run test:api</code>（仅接口）· <code>npm run test:e2e</code>（仅页面）。
  </footer>
</div>
</body>
</html>`;

writeFileSync(resolve(REPORTS, 'index.html'), html, 'utf8');
console.log('[report] reports/index.html 已更新');
