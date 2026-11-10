// ============================================================
// 范例 ①：接口契约 / 冒烟测试（这一份是写透的，其余用例文件都照这个形状写）
// ------------------------------------------------------------
// 运行：npm run test:api
// 框架：Node 内置 test runner（node:test），零依赖，不用装 jest/mocha
//
// 「接口契约测试」测什么？
//   不看代码怎么实现，只看"约好的输入 → 约好的输出"。
//   状态码、字段名、字段类型、错误体格式，都是前后端之间的合同。
//   合同一变，测试立刻红，比联调时才发现强得多。
//
// 一个用例的标准形状（记住这三段就够了）：
//   const { status, data } = await api(...);   // 1. 准备 + 执行
//   assert.equal(status, 200);                 // 2. 断言
//   // 上面那行没抛错 = 通过；抛错 = 失败并打印实际值
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, BASE } from './helpers/client.js';

// ------------------------------------------------------------
// TC-API-001 健康检查：部署平台靠它判断服务死没死
// 设计方法：正常流 + 响应结构 + 一条最基础的性能冒烟
// ------------------------------------------------------------
test('TC-API-001 健康检查返回 200、ok=true、合法时间，且 1 秒内响应', async () => {
  const { status, data, ms } = await api('/api/health');

  assert.equal(status, 200, '服务活着就该是 200');
  assert.equal(data.ok, true);
  assert.equal(typeof data.time, 'string', 'time 字段不能消失或变成数字');
  assert.ok(!Number.isNaN(Date.parse(data.time)), 'time 应是可解析的 ISO 时间');
  assert.ok(ms < 1000, `健康检查耗时 ${ms}ms，太慢了`);
});

// ------------------------------------------------------------
// TC-API-002 未知接口：错误也必须是 JSON
// 设计方法：异常流。前端 axios 会按 JSON 解析响应体，
//   如果这里返回一段 HTML，前端会抛"解析失败"而不是显示"接口不存在"，
//   用户看到的就成了一个莫名其妙的白屏。
// ------------------------------------------------------------
test('TC-API-002 未知接口返回 404，且响应体是带 error 字段的 JSON', async () => {
  const { status, data, headers } = await api('/api/this-endpoint-does-not-exist');

  assert.equal(status, 404);
  assert.match(headers.get('content-type') || '', /json/i, '错误响应也应是 JSON');
  assert.equal(typeof data.error, 'string');
  assert.ok(data.error.length > 0);
});

// ------------------------------------------------------------
// TC-API-003 列表响应结构：字段名就是合同
// 设计方法：契约校验。只断言"必须有、类型对、逻辑自洽"，
//   不断言具体有几篇文章 —— 数据会变，合同不该跟着变。
// ------------------------------------------------------------
test('TC-API-003 文章列表字段齐全且分页信息自洽', async () => {
  const { status, data } = await api('/api/posts?page=1&pageSize=2');

  assert.equal(status, 200);
  assert.ok(Array.isArray(data.items), 'items 必须是数组');
  assert.equal(typeof data.total, 'number');
  assert.equal(data.page, 1);
  assert.equal(data.pageSize, 2);
  assert.equal(data.totalPages, Math.max(1, Math.ceil(data.total / 2)));
  assert.ok(data.items.length <= 2, '每页条数不能超过 pageSize');
});

// ------------------------------------------------------------
// TC-API-004 权限边界：游客看不到草稿
// 设计方法：安全测试里的"越权"检查。
//   这类用例价值最高 —— 它防的是数据泄露，不是页面好不好看。
// ------------------------------------------------------------
test('TC-API-004 未登录时公开列表不出现草稿', async () => {
  const { data } = await api('/api/posts?pageSize=50');

  assert.ok(data.items.length > 0, '演示数据里应该有已发布文章');
  assert.ok(
    data.items.every((p) => p.status === 'published'),
    '公开列表里混进了非 published 的文章'
  );
});

// ------------------------------------------------------------
// TC-API-005 写接口鉴权
// ------------------------------------------------------------
test('TC-API-005 未登录新建文章返回 401，且没有真的写入数据', async () => {
  const { status } = await api('/api/posts', {
    method: 'POST',
    body: { title: '越权测试', content: '不该被创建' }
  });
  assert.equal(status, 401);

  const { data } = await api('/api/posts?q=越权测试');
  assert.equal(data.total, 0, '401 之后不应该能在列表里查到这篇文章');
});

// ------------------------------------------------------------
// TC-API-006 分页参数边界值
// 设计方法：边界值分析 —— 0、超大值、非法值最容易暴露 bug。
//   注意断言的是"被夹回合法范围"，而不是"报错"：
//   公开接口对脏参数要宽容，这也是一种约定。
// ------------------------------------------------------------
test('TC-API-006 非法分页参数被纠正到合法范围', async () => {
  const zero = await api('/api/posts?page=0&pageSize=0');
  assert.equal(zero.data.page, 1, 'page=0 应被纠正为 1');
  assert.equal(zero.data.pageSize, 6, 'pageSize=0 应回落到默认 6');

  const huge = await api('/api/posts?pageSize=9999');
  assert.equal(huge.data.pageSize, 50, 'pageSize 上限 50，防止一次拉爆数据库');
});

// 把被测地址打在报告里，出问题第一时间知道打的是哪个环境
test('TC-API-000 当前被测环境', () => {
  console.log(`      被测接口地址：${BASE}`);
  assert.ok(BASE.startsWith('http'), 'API_BASE_URL 必须是完整地址');
});
