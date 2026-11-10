// ============================================================
// playwright.config.js —— 页面自动化测试的"总开关"
// ------------------------------------------------------------
// 两个关键决定，面试都值得讲：
//
// 1) 为什么不 npx playwright install 下载浏览器？
//    多一步下载就多一个失败点，而且很慢。这里复用机器上已装的 Chrome：
//    设了 CHROME_PATH 用它 → 标准路径下有就用它 → 都没有才让 Playwright 自己找。
//
// 2) 为什么默认打本地静态服务器，而不是线上站点？
//    国内访问 GitHub Pages 时快时慢，并发跑容易 net::ERR_TIMED_OUT ——
//    失败原因是网络不是产品，这种"假红"最消耗对测试的信任。
//    默认用 scripts/static-server.mjs 本地复刻 Pages（离线、秒开、可重复）；
//    想做线上回归时设 E2E_BASE_URL=https://morris8088.github.io/portfolio-cms/ 即可，
//    设了它就不会再起本地服务器。
// ============================================================

import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const DEFAULT_CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const chromePath = process.env.CHROME_PATH || DEFAULT_CHROME;
const hasLocalChrome = existsSync(chromePath);

const LOCAL_BASE = 'http://127.0.0.1:4173/portfolio-cms/';
const externalBase = process.env.E2E_BASE_URL;

export default defineConfig({
  // 只在 tests/e2e 找 .spec.js，别把 tests/api 里的 node:test 文件也当成 Playwright 用例
  testDir: './tests/e2e',

  // 本地站点很快，单 worker 足够；也避免多个浏览器同时抢资源
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  retries: process.env.CI ? 1 : 0,

  // 三份产出：控制台清单、可点开的 HTML 报告、给汇总脚本读的 JSON
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/playwright', open: 'never' }],
    ['json', { outputFile: 'reports/playwright-results.json' }]
  ],

  use: {
    baseURL: externalBase || LOCAL_BASE,
    headless: true,
    ...(hasLocalChrome
      ? { launchOptions: { executablePath: chromePath, args: ['--no-sandbox'] } }
      : { channel: 'chrome' }),

    viewport: { width: 1280, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },

  // Playwright 会在开跑前自动起这个服务器、跑完自动关掉（和 with-sut.mjs 一个思路）
  ...(externalBase
    ? {}
    : {
        webServer: {
          command: `"${process.execPath}" scripts/static-server.mjs`,
          url: LOCAL_BASE,
          reuseExistingServer: !process.env.CI,
          timeout: 30_000
        }
      })
});
