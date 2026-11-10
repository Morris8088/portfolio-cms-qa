// ============================================================
// 练习位 ⑤：后台管理视角 E2E（TC-E2E-010 ~ 013）
// ------------------------------------------------------------
// 这些先跳过（不计入通过数），等你把接口层练完再回来做。
// 做法：把 test.skip 改成 test，照 reader.spec.js 的形状写。
//
// 提醒：默认 E2E 打的是线上 Demo（假后端，数据存在浏览器里）。
// 要做「发布后读者立刻能看到」这种真链路，把 E2E_BASE_URL 指向本地
// 前后端联调环境（后端 3001 + vite dev 5173），并在 docs/01 里看环境说明。
// ============================================================

import { test, expect } from '@playwright/test';

test.skip('TC-E2E-010 未登录访问后台会被挡在登录页', async ({ page }) => {
  // 提示：page.goto('./#/admin')，断言出现登录表单、不出现文章管理表格
  expect(page).toBeDefined();
});

test.skip('TC-E2E-011 用正确账号能登录进后台', async ({ page }) => {
  // 提示：getByPlaceholder 填账号密码 → getByRole('button', { name: /登录/ }).click()
  expect(page).toBeDefined();
});

test.skip('TC-E2E-012 密码错误时给出提示且仍停在登录页', async ({ page }) => {
  expect(page).toBeDefined();
});

test.skip('TC-E2E-013 发布一篇文章后，退出登录仍能在首页看到它', async ({ page }) => {
  // 这是最有含金量的一条：跨角色、跨页面的业务流程
  expect(page).toBeDefined();
});
