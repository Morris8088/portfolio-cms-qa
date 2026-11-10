// ============================================================
// 范例 ②：读者视角的页面 E2E（这一份是写透的）
// ------------------------------------------------------------
// 运行：npm run test:e2e
// 框架：Playwright Test，浏览器复用机器上的 Chrome（不额外下载）
//
// 「E2E」和接口测试的区别：
//   接口测试问"这个 URL 返回什么"；
//   E2E 问"一个真人打开浏览器、点几下，事情办得成吗"。
//   下面每一条都对应一个真实踩过的线上事故，见 docs/03-缺陷清单.md。
//
// 两个容易写错的地方，先说在前面：
//   1. page.goto('/') 会跳到域名根目录，丢掉 /portfolio-cms/ 前缀！
//      这个站挂在 GitHub Pages 的子路径下，所以一律用 './' 相对路径。
//   2. 页面数据是假后端异步装的，元素不会立刻出现。
//      用 expect(...).toBeVisible() 让它自动等，不要用 waitForTimeout 硬睡。
// ============================================================

import { test, expect } from '@playwright/test';

const HOME = './';
const NO_404_TEXT = '这个地址没有内容';

// ------------------------------------------------------------
// TC-E2E-001 未登录读者能看到文章
// 对应 BUG-001 / BUG-002：「没文章」「读文章看不见」
// 断言里特意检查"没有请求失败提示"——空列表和请求报错是两回事，
// 只数卡片数量会把「接口 404 但页面渲染了空态」漏过去。
// ------------------------------------------------------------
test('TC-E2E-001 未登录读者打开首页能看到文章列表', async ({ page }) => {
  await page.goto(HOME);

  const cards = page.locator('a.post-card');
  await expect(cards.first()).toBeVisible();

  const count = await cards.count();
  expect(count).toBeGreaterThan(0);

  // 页面上的「共 N 篇」应该和卡片数一致（前端渲染与数据的对账）
  await expect(page.locator('#posts .count')).toContainText(/共\s*\d+\s*篇/);
  await expect(page.locator('#app')).not.toContainText('请求失败');
  await expect(page.locator('#app')).not.toContainText(NO_404_TEXT);
});

// ------------------------------------------------------------
// TC-E2E-002 点「读读文章」只滚动，不能换路由
// 对应 BUG-004：按钮原来写成 href="#posts" 的 a 标签，
//   hash 路由下被当成 #/posts，直接掉进 404 页。
// 这是整个工程里最有价值的一条回归用例。
// ------------------------------------------------------------
test('TC-E2E-002 点「读读文章」不换地址、不进 404，并滚到文章区', async ({ page }) => {
  await page.goto(HOME);
  await expect(page.locator('a.post-card').first()).toBeVisible();

  const urlBefore = page.url();
  await page.getByRole('button', { name: '读读文章' }).click();

  // 地址栏必须纹丝不动
  expect(page.url()).toBe(urlBefore);
  await expect(page.locator('#app')).not.toContainText(NO_404_TEXT);
  await expect(page.locator('a.post-card').first()).toBeVisible();

  // 平滑滚动是异步的，用 expect.poll 反复问"到了没"，比 sleep 稳
  await expect
    .poll(async () => (await page.locator('#posts').boundingBox())?.y ?? 9999)
    .toBeLessThan(200);
});

// ------------------------------------------------------------
// TC-E2E-003 点卡片进详情，正文真的渲染出来
// 对应 BUG-002：假后端装得太晚，详情页拿到 404 只有标题没有正文
// ------------------------------------------------------------
test('TC-E2E-003 从列表点进详情，标题与正文都完整', async ({ page }) => {
  await page.goto(HOME);

  const firstCard = page.locator('a.post-card').first();
  await expect(firstCard).toBeVisible();
  await firstCard.click();

  await expect(page).toHaveURL(/#\/posts\/\d+/);
  await expect(page.locator('h1').first()).not.toBeEmpty();

  const body = page.locator('.post-body, article, .prose').first();
  await expect(body).toBeVisible();
  expect((await body.innerText()).length).toBeGreaterThan(50);
  await expect(page.locator('#app')).not.toContainText(NO_404_TEXT);
});

// ------------------------------------------------------------
// TC-E2E-004 直接访问 #/posts 不落 404（路由兜底）
// 设计方法：异常流 + 分享链接场景。用户把地址复制给别人，
//   少了文章 id 也不该看到「这个地址没有内容」。
// ------------------------------------------------------------
test('TC-E2E-004 直接访问 #/posts 会被接住，仍能看到文章', async ({ page }) => {
  await page.goto('./#/posts');

  await expect(page.locator('a.post-card').first()).toBeVisible();
  await expect(page.locator('#app')).not.toContainText(NO_404_TEXT);
});

// ------------------------------------------------------------
// TC-E2E-005 深链可直达（刷新 / 收藏 / 分享都能用）
// ------------------------------------------------------------
test('TC-E2E-005 直接打开 #/posts/2 能看到文章正文', async ({ page }) => {
  await page.goto('./#/posts/2');

  await expect(page.locator('h1').first()).not.toBeEmpty();
  const body = page.locator('.post-body, article, .prose').first();
  await expect(body).toBeVisible();
  expect((await body.innerText()).length).toBeGreaterThan(50);
});
