// ============================================================
// run-all.mjs —— 一键跑全套：接口层 + 页面层 + 汇总报告
// ------------------------------------------------------------
// 为什么不让 npm test 直接写 "npm run test:api && npm run test:e2e"？
//   那样第一层一挂，第二层就不跑了，也拿不到完整报告。
//   这里两层都跑完，各自记结果，最后统一出报告 —— 这才是回归测试该有的样子：
//   「一次运行，一次说清楚哪些过了、哪些没过」。
// ============================================================

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const REPORTS = resolve(ROOT, 'reports');
mkdirSync(REPORTS, { recursive: true });

const steps = [
  {
    key: 'api',
    name: '接口契约测试',
    script: 'scripts/with-sut.mjs',
    // with-sut 的第一个参数是"要跑的命令"，这里传当前 node 的绝对路径
    // 串行跑：接口用例共用一个内存库，并行执行会互相改数据（未来写 CRUD 时尤其明显）
    args: [process.execPath, '--test', '--test-concurrency=1', 'tests/api']
  },
  {
    key: 'e2e',
    name: '页面 E2E 回归',
    script: 'node_modules/@playwright/test/cli.js',
    args: ['test']
  }
];

const results = [];
for (const step of steps) {
  console.log(`\n===== ${step.name} =====`);
  const started = Date.now();
  const exitCode = await new Promise((done) => {
    const child = spawn(process.execPath, [resolve(ROOT, step.script), ...step.args], {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env
    });
    child.on('error', (err) => {
      console.error(`[run-all] 启动失败：${err.message}`);
      done(1);
    });
    child.on('exit', (code) => done(code ?? 1));
  });
  results.push({
    key: step.key,
    name: step.name,
    ok: exitCode === 0,
    exitCode,
    durationMs: Date.now() - started
  });
  console.log(`===== ${step.name}：${exitCode === 0 ? '通过' : '失败'} =====`);
}

const summary = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  apiBaseUrl: process.env.API_BASE_URL || 'http://127.0.0.1:3301（自动启动）',
  e2eBaseUrl: process.env.E2E_BASE_URL || 'http://127.0.0.1:4173/portfolio-cms/（自动启动）',
  allPassed: results.every((r) => r.ok),
  results
};
writeFileSync(resolve(REPORTS, 'run-summary.json'), JSON.stringify(summary, null, 2));

// 报告一定生成，哪怕有失败 —— 失败时更要看报告
await import('./make-report.mjs');

console.log(`\n📄 报告已生成：reports/index.html`);
process.exit(summary.allPassed ? 0 : 1);
