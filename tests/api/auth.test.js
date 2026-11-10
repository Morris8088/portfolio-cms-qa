// ============================================================
// 练习位 ①：登录与鉴权（TC-API-010 ~ 014）
// ------------------------------------------------------------
// 目标：把 todo 一个个改成 test，自己写断言。
// 照着 smoke.test.js 的形状抄：const { status, data } = await api(...) → assert.xxx(...)
// 需要令牌时用 helpers/client.js 里的 await login()。
// 卡住了看 docs/05-练习任务.md，里面按编号给了提示。
// ============================================================

import { test } from 'node:test';

// 提示：正常流。断言 status / data.token 存在 / data.user.username
test.todo('TC-API-010 正确账号密码返回 200 与 token');

// 提示：安全用例。两种失败必须同状态码、同文案，否则等于告诉攻击者"账号存在"
test.todo('TC-API-011 密码错与账号不存在都返回 401，且错误文案完全一致');

// 提示：异常流。只传 username，不传 password
test.todo('TC-API-012 登录缺少必填字段返回 400');

// 提示：拿一个乱编的字符串当 Bearer token 访问 /api/auth/me
test.todo('TC-API-013 伪造令牌访问 /api/auth/me 返回 401');

// 提示：先 await login()，再把令牌传给 api('/api/auth/me', { token })
test.todo('TC-API-014 合法令牌能换回当前用户信息');
