// ============================================================
// TC-API-010 ~ 014：登录与鉴权
// ------------------------------------------------------------
// 这一组是「安全测试」的入门：不只看"能不能登录"，
// 更看"失败时有没有泄漏信息"、"令牌能不能被伪造"。
//
// 一个容易踩的坑：后端有登录限流（同一 IP 60 秒内错 5 次返回 429）。
// 所以本文件只制造 2 次失败，成功登录会把计数清零 —— 用例设计也要
// 考虑被测系统的状态，不能光顾着自己发请求。
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, login } from './helpers/client.js';

const CREDENTIALS = { username: 'admin', password: 'admin123' };

// ------------------------------------------------------------
// TC-API-010 正常流：正确凭据换回令牌
// 令牌是三段式 header.payload.signature，断言三段而不是只断言"非空"，
// 这样万一后端哪天返回了一个占位字符串，测试能立刻发现。
// ------------------------------------------------------------
test('TC-API-010 正确账号密码返回 200、token 与用户信息', async () => {
  const { status, data } = await api('/api/auth/login', {
    method: 'POST',
    body: CREDENTIALS
  });

  assert.equal(status, 200);
  assert.equal(typeof data.token, 'string');
  assert.equal(data.token.split('.').length, 3, '令牌应是三段式 JWT 结构');
  assert.equal(data.user.username, 'admin');
  assert.equal(typeof data.user.displayName, 'string');
  // 密码哈希绝不能出现在响应里 —— 这类断言防的是"顺手 SELECT *"的回归
  assert.ok(!('password' in data.user), '用户信息里不能带 password 字段');
});

// ------------------------------------------------------------
// TC-API-011 安全：账号枚举防护
// 设计方法：等价类里的"两种失败输入"，期望同一个输出。
// 如果「账号不存在」和「密码错误」返回不同文案，攻击者就能用
// 字典批量探测出哪些账号是真实存在的，这叫账号枚举漏洞。
// ------------------------------------------------------------
test('TC-API-011 密码错与账号不存在返回相同状态码和相同文案', async () => {
  const wrongPassword = await api('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'definitely-wrong' }
  });
  const unknownUser = await api('/api/auth/login', {
    method: 'POST',
    body: { username: 'ghost-account-not-exist', password: 'whatever' }
  });

  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownUser.status, 401);
  assert.equal(
    wrongPassword.data.error,
    unknownUser.data.error,
    '两种失败文案必须一致，否则等于告诉攻击者账号是否存在'
  );
});

// ------------------------------------------------------------
// TC-API-012 异常流：必填字段校验
// 分别只给一半字段、一个都不给，三种都要 400 且提示一致。
// ------------------------------------------------------------
test('TC-API-012 登录缺少必填字段返回 400', async () => {
  const bodies = [{ username: 'admin' }, { password: 'admin123' }, {}];

  for (const body of bodies) {
    const { status, data } = await api('/api/auth/login', { method: 'POST', body });
    assert.equal(status, 400, `缺字段应被拦下：${JSON.stringify(body)}`);
    assert.match(data.error, /请输入用户名和密码/);
  }
});

// ------------------------------------------------------------
// TC-API-013 安全：伪造令牌
// 注意 client.js 的约定：4xx 不抛异常，401 就是要断言的正常结果。
// ------------------------------------------------------------
test('TC-API-013 伪造令牌访问 /api/auth/me 返回 401', async () => {
  for (const token of ['abc.def.ghi', 'totally-not-a-token', '']) {
    const { status, data } = await api('/api/auth/me', { token });
    assert.equal(status, 401, `伪造令牌 ${JSON.stringify(token)} 不该被放行`);
    assert.equal(typeof data.error, 'string');
  }
});

// ------------------------------------------------------------
// TC-API-014 正常流：合法令牌能换回当前用户
// 走一遍完整链路：登录 → 拿 token → 带 token 查 /me。
// ------------------------------------------------------------
test('TC-API-014 合法令牌能换回当前用户信息', async () => {
  const token = await login();

  const { status, data } = await api('/api/auth/me', { token });
  assert.equal(status, 200);
  assert.equal(data.username, 'admin');
  assert.equal(typeof data.displayName, 'string');
  assert.ok(!('password' in data), '/me 也不该把密码哈希带出来');
});
