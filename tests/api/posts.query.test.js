// ============================================================
// TC-API-030 ~ 035：列表查询、排序、分页、注入防护
// ------------------------------------------------------------
// 这一组最能体现「测试设计方法」，面试很爱问：
//   · 等价类：能命中的关键词 / 一定搜不到的关键词
//   · 边界值：page 越界、pageSize 上下限、标签子串
//   · 安全性：把 SQL 片段塞进 sort / q，看白名单和参数化有没有生效
//   · 断言技巧：不断言"一共几篇"，断言"每一篇都满足条件"
//
// 自建数据 + t.after 清理，保证用例不依赖演示数据里恰好有某篇文章。
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, login } from './helpers/client.js';
import { makePost } from '../../fixtures/factory.js';

/** 造一篇已发布文章并登记清理 */
async function seedPost(t, token, overrides = {}) {
  const body = makePost({ status: 'published', ...overrides });
  const res = await api('/api/posts', { method: 'POST', body, token });
  assert.equal(res.status, 201, '准备测试数据失败');
  t.after(async () => {
    await api(`/api/posts/${res.data.id}`, { method: 'DELETE', token });
  });
  return res.data;
}

// ------------------------------------------------------------
// TC-API-030 关键词搜索命中标题
// 用唯一随机词，避免"演示数据里正好也有"造成的假阳性。
// ------------------------------------------------------------
test('TC-API-030 关键词搜索能命中标题', async (t) => {
  const token = await login();
  const marker = `searchhit${Date.now()}`;
  const post = await seedPost(t, token, { title: `搜索命中验证 ${marker}` });

  const { status, data } = await api(`/api/posts?q=${encodeURIComponent(marker)}`);
  assert.equal(status, 200);
  assert.ok(data.total >= 1);
  assert.ok(
    data.items.some((p) => p.id === post.id),
    '结果里应该包含刚创建的那篇'
  );
  assert.ok(
    data.items.every((p) =>
      [p.title, p.summary, p.content ?? '', p.tags ?? '']
        .join(' ')
        .toLowerCase()
        .includes(marker.toLowerCase())
    ),
    '每一条结果都应该真的命中关键词'
  );
});

// ------------------------------------------------------------
// TC-API-031 空结果：搜不到是正常业务，不是错误
// 断言 200 + total=0 + items=[]，专门防"后端把空列表写成 500"
// ------------------------------------------------------------
test('TC-API-031 搜不到时返回空数组而不是 5xx', async () => {
  const impossible = `zzz-no-such-post-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const { status, data } = await api(`/api/posts?q=${encodeURIComponent(impossible)}`);

  assert.equal(status, 200);
  assert.equal(data.total, 0);
  assert.deepEqual(data.items, []);
  assert.equal(data.totalPages, 1, '空结果也应给出合法的分页信息');
});

// ------------------------------------------------------------
// TC-API-032 标签按完整值匹配（子串陷阱）
// 数据库里 tags 是 "A,B" 逗号串，用 LIKE 模糊匹配很容易把
// "QaTagA" 的子串 "QaTag" 也算命中。后端用 ',tag,' 包裹解决了，
// 这条用例就是守住这个约定。
// ------------------------------------------------------------
test('TC-API-032 标签按完整值筛选，不误匹配子串', async (t) => {
  const token = await login();
  const full = `QaTag${Date.now()}`;
  const partial = full.slice(0, -2); // 去掉最后两个字符，一定是子串而非完整标签
  const post = await seedPost(t, token, { tags: `${full},另一个标签` });

  const hit = await api(`/api/posts?tag=${encodeURIComponent(full)}`);
  assert.equal(hit.status, 200);
  assert.ok(hit.data.items.some((p) => p.id === post.id), '完整标签应命中');

  const miss = await api(`/api/posts?tag=${encodeURIComponent(partial)}`);
  assert.equal(miss.status, 200);
  assert.ok(
    !miss.data.items.some((p) => p.id === post.id),
    `子串标签 ${partial} 不该匹配到 ${full}`
  );
});

// ------------------------------------------------------------
// TC-API-033 sort=popular 按阅读量倒序
// 两层断言：顺序确实非递增 + 第一名就是全局最大值。
// 只断言"第一比第二大"是不够的，中间乱序照样能混过去。
// ------------------------------------------------------------
test('TC-API-033 sort=popular 按阅读量倒序', async () => {
  const all = await api('/api/posts?pageSize=50&sort=newest');
  const popular = await api('/api/posts?pageSize=50&sort=popular');

  assert.equal(all.status, 200);
  assert.equal(popular.status, 200);
  assert.equal(popular.data.total, all.data.total, '排序不该改变结果集');
  assert.ok(popular.data.items.length > 1, '至少要有两篇才能验证顺序');

  const views = popular.data.items.map((p) => p.views);
  for (let i = 0; i < views.length - 1; i += 1) {
    assert.ok(views[i] >= views[i + 1], `第 ${i + 1} 篇阅读量不应小于第 ${i + 2} 篇`);
  }
  assert.equal(
    views[0],
    Math.max(...all.data.items.map((p) => p.views)),
    '第一篇应该是阅读量最高的'
  );
});

// ------------------------------------------------------------
// TC-API-034 安全：非法 sort 不造成 SQL 注入
// 后端用白名单映射排序字段，非法值回落到 newest，绝不拼进 SQL。
// 断言"表还在、数据还能查"比只断言 200 更有说服力 ——
// 万一 DROP TABLE 真执行了，后面的查询才会暴露出来。
// ------------------------------------------------------------
test('TC-API-034 非法 sort 与带引号的 q 不会破坏数据库', async () => {
  const injectedSort = encodeURIComponent('created_at;DROP TABLE posts;--');
  const injectedQ = encodeURIComponent("O'Reilly OR 1=1 --");

  const bySort = await api(`/api/posts?sort=${injectedSort}`);
  assert.equal(bySort.status, 200, '非法 sort 应回落到默认排序，而不是报错');
  assert.ok(Array.isArray(bySort.data.items));
  assert.ok(bySort.data.total > 0, '回落排序后仍应查到数据');

  const byQ = await api(`/api/posts?q=${injectedQ}`);
  assert.equal(byQ.status, 200, '带引号的关键词应由参数化查询安全处理');
  assert.ok(Array.isArray(byQ.data.items));

  const after = await api('/api/posts?pageSize=50');
  assert.equal(after.status, 200);
  assert.ok(after.data.total > 0, 'posts 表必须还在 —— 注入没有被执行');
  assert.equal((await api('/api/health')).status, 200, '服务也不能被拖垮');
});

// ------------------------------------------------------------
// TC-API-035 边界值：分页不重复、越界不报错
// ------------------------------------------------------------
test('TC-API-035 分页不重复、越界返回空列表且不报错', async () => {
  const p1 = await api('/api/posts?page=1&pageSize=2');
  const p2 = await api('/api/posts?page=2&pageSize=2');
  assert.equal(p1.status, 200);
  assert.equal(p2.status, 200);

  const ids1 = p1.data.items.map((p) => p.id);
  const ids2 = p2.data.items.map((p) => p.id);
  assert.equal(
    ids1.filter((id) => ids2.includes(id)).length,
    0,
    '相邻两页不能有重复文章'
  );

  const beyond = await api('/api/posts?page=9999&pageSize=2');
  assert.equal(beyond.status, 200, '越界应是空结果，不是 500');
  assert.deepEqual(beyond.data.items, []);
  assert.equal(beyond.data.page, 9999, 'page 如实回显，便于前端判断');
  assert.equal(
    beyond.data.totalPages,
    Math.max(1, Math.ceil(beyond.data.total / 2)),
    'totalPages 要按总数算，而不是按当前页'
  );
});
