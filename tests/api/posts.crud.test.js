// ============================================================
// TC-API-020 ~ 025：文章增删改查
// ------------------------------------------------------------
// 这一组最核心的工程纪律是「用例不互相污染」：
//   1. 数据一律用 fixtures/factory.js 的 makePost() 造，标题带随机后缀，
//      否则第二次跑就撞上 slug 唯一的 409，测试变成"只能跑一次"
//   2. 每个用例把自己创建的数据登记进 ids，用 t.after() 兜底删除，
//      哪怕断言中途抛错也会执行 —— 失败不能留下脏数据
//   3. 不断言"数据库里第 3 条是什么"，只断言自己创建的那个 id
//
// 所有用例共享同一个内存库（SUT 起一次），所以 --test-concurrency=1 是必须的。
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, login } from './helpers/client.js';
import { makePost } from '../../fixtures/factory.js';

/** 造一篇合法文章并发 POST，返回响应和请求体，方便用例对照 */
async function create(token, overrides = {}) {
  const body = makePost(overrides);
  const res = await api('/api/posts', { method: 'POST', body, token });
  return { res, body };
}

/** 登记清理：用例结束后把自己造的文章删掉 */
function cleanup(t, token, ids) {
  t.after(async () => {
    for (const id of ids) {
      // 已删除的会返回 404，忽略即可；清理要幂等
      await api(`/api/posts/${id}`, { method: 'DELETE', token });
    }
  });
}

// ------------------------------------------------------------
// TC-API-020 正常流 + 隐式默认值
// 设计方法：契约校验。slug / summary / status / views 都是"后端算出来的"，
//   前端没传，后端必须补上 —— 这正是最容易在重构里悄悄丢掉的东西。
// ------------------------------------------------------------
test('TC-API-020 新建返回 201，自动生成 slug 与摘要', async (t) => {
  const token = await login();
  const ids = [];
  cleanup(t, token, ids);

  const { res, body } = await create(token);
  assert.equal(res.status, 201);
  ids.push(res.data.id);

  const post = res.data;
  assert.ok(Number.isInteger(post.id));
  assert.equal(post.title, body.title);
  assert.equal(post.status, 'published', '显式传 published 就该是 published');
  assert.equal(post.views, 0, '新文章阅读量从 0 开始');
  assert.equal(typeof post.slug, 'string');
  assert.ok(post.slug.length > 0 && !/\s/.test(post.slug), 'slug 不能为空或含空格');
  assert.ok(post.summary.length > 0, '没传 summary 时后端要自动生成');
  assert.ok(post.summary.length <= 81, '自动摘要最多 80 字 + 省略号');
  assert.ok(!Number.isNaN(Date.parse(post.created_at)));

  // 只传 title/content（不传 status）时应默认存为草稿 —— 防止误发布
  const plain = makePost();
  const draftRes = await api('/api/posts', {
    method: 'POST',
    body: { title: plain.title, content: plain.content },
    token
  });
  assert.equal(draftRes.status, 201);
  ids.push(draftRes.data.id);
  assert.equal(draftRes.data.status, 'draft', '未指定状态时默认草稿');
});

// ------------------------------------------------------------
// TC-API-021 等价类：空标题 / 空正文 / 缺字段
// 空格串要算空（后端用 trim 判断），不能只测 undefined。
// ------------------------------------------------------------
test('TC-API-021 标题或正文为空返回 400，且不写入数据', async () => {
  const token = await login();
  const before = (await api('/api/posts?pageSize=50')).data.total;

  const invalid = [
    [{ title: '   ', content: '有正文' }, /标题不能为空/],
    [{ title: '合法标题', content: '   ' }, /正文不能为空/],
    [{ content: '只有正文' }, /标题不能为空/],
    [{ title: '只有标题' }, /正文不能为空/]
  ];

  for (const [body, pattern] of invalid) {
    const { status, data } = await api('/api/posts', { method: 'POST', body, token });
    assert.equal(status, 400, `应拒绝：${JSON.stringify(body)}`);
    assert.match(data.error, pattern);
  }

  const after = (await api('/api/posts?pageSize=50')).data.total;
  assert.equal(after, before, '400 之后文章总数不应该变化');
});

// ------------------------------------------------------------
// TC-API-022 唯一约束冲突
// 后端靠 SQLite 的 UNIQUE 索引兜底，捕获后翻译成 409。
// ------------------------------------------------------------
test('TC-API-022 slug 重复返回 409，且不会写入第二条', async (t) => {
  const token = await login();
  const ids = [];
  cleanup(t, token, ids);

  const slug = `qa-duplicate-${Date.now()}`;
  const before = (await api('/api/posts?pageSize=50', { token })).data.total;

  const first = await create(token, { slug });
  assert.equal(first.res.status, 201);
  ids.push(first.res.data.id);
  assert.equal(first.res.data.slug, slug);

  const second = await create(token, { slug });
  assert.equal(second.res.status, 409);
  assert.match(second.res.data.error, /slug 已存在/);

  const after = (await api('/api/posts?pageSize=50', { token })).data.total;
  assert.equal(after, before + 1, '冲突的那条不应该落库');
});

// ------------------------------------------------------------
// TC-API-023 部分更新语义（PATCH-like PUT）
// 只传 status，其它字段必须原样保留 —— 这类 bug 很隐蔽：
//   前端"发布/下架"按钮只发一个字段，后端若整行覆盖就会把正文清空。
// ------------------------------------------------------------
test('TC-API-023 只更新状态不影响其它字段', async (t) => {
  const token = await login();
  const ids = [];
  cleanup(t, token, ids);

  const { res } = await create(token, { status: 'draft', tags: 'QA,回归' });
  assert.equal(res.status, 201);
  ids.push(res.data.id);
  const before = res.data;

  const updated = await api(`/api/posts/${before.id}`, {
    method: 'PUT',
    body: { status: 'published' },
    token
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.status, 'published');
  for (const key of ['title', 'slug', 'summary', 'content', 'tags']) {
    assert.equal(updated.data[key], before[key], `${key} 不该被这次更新改动`);
  }

  // 反过来：一个可更新字段都不传，应明确拒绝而不是"静默成功"
  const empty = await api(`/api/posts/${before.id}`, { method: 'PUT', body: {}, token });
  assert.equal(empty.status, 400);
});

// ------------------------------------------------------------
// TC-API-024 权限越权：草稿不能被游客猜 id 读到
// 三层都要查：详情、公开列表、登录后的列表。
// ------------------------------------------------------------
test('TC-API-024 草稿对游客不可见、对管理员可见', async (t) => {
  const token = await login();
  const ids = [];
  cleanup(t, token, ids);

  const marker = `draft-visibility-${Date.now()}`;
  const { res } = await create(token, { title: `草稿可见性 ${marker}`, status: 'draft' });
  assert.equal(res.status, 201);
  const id = res.data.id;
  ids.push(id);

  const guestDetail = await api(`/api/posts/${id}`);
  assert.equal(guestDetail.status, 404, '游客直接猜 id 不该读到草稿');

  const guestList = await api(`/api/posts?q=${encodeURIComponent(marker)}`);
  assert.equal(guestList.data.total, 0, '公开列表里不该出现草稿');

  const adminDetail = await api(`/api/posts/${id}`, { token });
  assert.equal(adminDetail.status, 200, '作者本人当然要能预览');
  assert.equal(adminDetail.data.status, 'draft');

  const adminList = await api(`/api/posts?status=draft&q=${encodeURIComponent(marker)}`, { token });
  assert.ok(
    adminList.data.items.some((p) => p.id === id),
    '登录后的后台列表应该能筛出草稿'
  );
});

// ------------------------------------------------------------
// TC-API-025 删除后确实查不到（不是只返回一个 success）
// 新手常犯的错：只断言 DELETE 返回 200，不验证数据是否真没了。
// ------------------------------------------------------------
test('TC-API-025 删除成功后数据确实不再可查', async (t) => {
  const token = await login();
  const ids = [];
  cleanup(t, token, ids);

  const { res } = await create(token);
  assert.equal(res.status, 201);
  const id = res.data.id;
  ids.push(id);

  const del = await api(`/api/posts/${id}`, { method: 'DELETE', token });
  assert.equal(del.status, 200);
  assert.equal(del.data.success, true);

  assert.equal((await api(`/api/posts/${id}`)).status, 404, '删完详情应 404');
  assert.equal(
    (await api(`/api/posts/${id}`, { method: 'DELETE', token })).status,
    404,
    '重复删除同一 id 应 404'
  );
  const list = await api('/api/posts?pageSize=50', { token });
  assert.ok(!list.data.items.some((p) => p.id === id), '列表里也不该再有它');
});
