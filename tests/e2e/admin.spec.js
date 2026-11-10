// ============================================================
// TC-E2E-010 ~ 013：后台管理视角的端到端流程
// ------------------------------------------------------------
// 和 reader.spec.js 的区别：那边测"读者能不能看"，这边测
// "作者能不能进、能不能发、发完读者能不能看" —— 跨角色、跨页面的完整业务流。
//
// 环境说明（很重要，别被假象骗了）：
//   默认靶子是 Demo 构建，用 axios 假后端，数据存在 localStorage 里。
//   Demo 的登录接口接受任意账号密码（方便面试官直接点进后台），
//   所以「密码错误」在这里永远测不出来。那条真实鉴权由接口层
//   TC-API-011 覆盖；页面层这里改测「表单必填校验」，见 TC-E2E-012。
//
// 每条用例 Playwright 都会给一个全新的浏览器上下文，
// localStorage 天然隔离，所以 013 发布的文章不会污染其它用例。
// ============================================================

import { test, expect } from '@playwright/test';

const LOGIN = './#/admin/login';
const ADMIN = './#/admin';
const NO_404_TEXT = '这个地址没有内容';

/** 走一遍登录表单（Demo 下任意非空密码都能通过） */
async function loginAsAdmin(page, password = 'admin123') {
  await page.goto(LOGIN);
  await page.getByPlaceholder('admin').fill('admin');
  await page.getByPlaceholder('••••••').fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
}

// ------------------------------------------------------------
// TC-E2E-010 权限越权：没登录直接敲后台地址
// 前端守卫把人送到登录页，并记下 redirect 参数。
// 注意这只是"体验层"拦截，真正的防线在后端 requireAuth（TC-API-005/013）。
// ------------------------------------------------------------
test('TC-E2E-010 未登录访问后台会被挡在登录页', async ({ page }) => {
  await page.goto('./#/admin');

  await expect(page).toHaveURL(/#\/admin\/login/);
  await expect(page).toHaveURL(/redirect=/);
  await expect(page.locator('.login-page')).toBeVisible();
  await expect(page.locator('.login-page').getByText('后台登录')).toBeVisible();
  await expect(page.getByPlaceholder('••••••')).toBeVisible();
  await expect(page.locator('.admin')).toHaveCount(0, '不该看到后台的内容管理表格');
});

// ------------------------------------------------------------
// TC-E2E-011 正常流：登录后进入后台
// 不只断言 URL 变了，还要断言"后台真的渲染出来了、导航变成已登录态"。
// ------------------------------------------------------------
test('TC-E2E-011 用正确账号能登录进后台', async ({ page }) => {
  await loginAsAdmin(page);

  await expect(page).toHaveURL(/#\/admin$/);
  await expect(page.locator('.admin h1')).toHaveText('内容管理');
  await expect(page.locator('.who')).toContainText('已登录');
  await expect(page.getByRole('button', { name: '退出' })).toBeVisible();
  await expect(page.getByRole('link', { name: /写文章/ })).toBeVisible();
});

// ------------------------------------------------------------
// TC-E2E-012 异常流：登录表单的必填校验
// 用户名/密码没填时，前端应该在发请求之前就拦下并给出提示，
// 页面也不能跳走。两种组合都测一遍。
//
// 为什么不是「密码错误」？见文件头：Demo 假后端接受任意密码。
// 真实后端的密码错误分支在 TC-API-011 里验证，那里能测到 401 与统一文案。
// 把测不了的东西如实换到能测的层次，比写一条永远红的用例有意义。
// ------------------------------------------------------------
test('TC-E2E-012 必填项为空时给出提示，且停在登录页', async ({ page }) => {
  await page.goto(LOGIN);

  // 两个都空
  await page.getByPlaceholder('admin').fill('');
  await page.getByPlaceholder('••••••').fill('');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.locator('.error')).toHaveText('请输入用户名和密码');

  // 只填用户名
  await page.getByPlaceholder('admin').fill('admin');
  await page.getByPlaceholder('••••••').fill('');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.locator('.error')).toHaveText('请输入用户名和密码');

  await expect(page).toHaveURL(/#\/admin\/login/);
  await expect(page.locator('.admin')).toHaveCount(0);
});

// ------------------------------------------------------------
// TC-E2E-013 最有含金量的一条：跨角色业务流程
//   登录 → 写文章 → 发布 → 退出 → 以读者身份在首页看到它
//
// 它一次性验证了：鉴权守卫、编辑器表单、创建接口、假后端持久化、
// 退出登录只清令牌不清内容、公开列表会包含新发布的文章。
// 任何一环断了，最后那个断言都会红 —— 这正是 E2E 的价值。
// ------------------------------------------------------------
test('TC-E2E-013 发布文章后退出登录，读者仍能在首页看到它', async ({ page }) => {
  const title = `E2E 发布验证 ${Date.now()}`;
  const content = '这是端到端用例发布的正文，用来验证作者退出登录后，未登录读者依然可以读到这篇文章。'.repeat(3);

  await loginAsAdmin(page);
  await expect(page).toHaveURL(/#\/admin$/);

  await page.getByRole('link', { name: /写文章/ }).click();
  await expect(page).toHaveURL(/#\/admin\/posts\/new$/);

  await page.getByPlaceholder('一句话说清这篇讲什么').fill(title);
  await page.locator('.content-input textarea').fill(content);
  await page.getByRole('button', { name: '发布', exact: true }).click();

  // 保存成功后编辑器会跳回后台列表
  await expect(page).toHaveURL(/#\/admin$/);
  await expect(page.locator('.admin h1')).toHaveText('内容管理');

  // 退出登录：导航回到未登录态
  await page.getByRole('button', { name: '退出' }).click();
  await expect(page.getByRole('link', { name: '后台登录' })).toBeVisible();

  // 重新以读者身份打开首页（刷新一次，确保数据是从存储里读出来的，
  // 而不是组件内存里恰好还留着）
  await page.goto('./');
  await expect(page.locator('a.post-card').first()).toBeVisible();
  await expect(
    page.locator('a.post-card h3.title').filter({ hasText: title })
  ).toBeVisible();
  await expect(page.locator('#app')).not.toContainText('请求失败');
  await expect(page.locator('#app')).not.toContainText(NO_404_TEXT);

  // 点进详情，确认正文也完整（不是只有标题的空壳卡片）
  await page.locator('a.post-card h3.title').filter({ hasText: title }).click();
  await expect(page).toHaveURL(/#\/posts\/\d+/);
  await expect(page.locator('h1').first()).toHaveText(title);
  const body = page.locator('.post-body, article, .prose').first();
  await expect(body).toBeVisible();
  expect((await body.innerText()).length).toBeGreaterThan(50);
});
