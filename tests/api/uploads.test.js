// ============================================================
// TC-API-040 ~ 045：文件上传（安全测试专场）
// ------------------------------------------------------------
// 上传是最容易出安全漏洞的接口。这组覆盖：
//   鉴权 → 正常流 → 扩展名白名单 → 大小上限 → 重名 → 空请求
//
// 关键细节：FormData 必须原样交给 fetch，不能走 client.js 的 api()
// （它会 JSON.stringify，把 body 变成 "{}"）。所以这里用 upload() 辅助函数。
// 上传目录由 SUT 指向临时目录，跑完即焚，不会往真实 uploads/ 塞垃圾。
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, login, upload, raw } from './helpers/client.js';
import { PNG_1PX, makeTooLargeImage } from '../../fixtures/factory.js';

/** 组装一个 multipart 表单；字段名可改，用来测"字段名写错" */
function form(filename, bytes = PNG_1PX, field = 'file') {
  const fd = new FormData();
  fd.append(field, new Blob([bytes]), filename);
  return fd;
}

// ------------------------------------------------------------
// TC-API-040 权限越权：没登录连 multer 都不该走到
// ------------------------------------------------------------
test('TC-API-040 未登录上传返回 401', async () => {
  const { status, data } = await upload(form('a.png'));
  assert.equal(status, 401);
  assert.equal(typeof data.error, 'string');
});

// ------------------------------------------------------------
// TC-API-041 正常流：上传成功 + 返回的 URL 真的能取回文件
// 「返回 201」和「图片能用」是两件事，必须都验。
// ------------------------------------------------------------
test('TC-API-041 合法 PNG 返回 201，且地址可访问、字节一致', async () => {
  const token = await login();
  const { status, data } = await upload(form('封面 图.png'), token);

  assert.equal(status, 201);
  assert.match(data.url, /^\/uploads\/[0-9a-f-]{36}\.png$/i, '文件名应是随机 UUID');
  assert.equal(data.name, '封面 图.png', '中文文件名不能被解析成乱码');
  assert.equal(data.size, PNG_1PX.length);
  assert.equal(data.type, 'image/png', '类型以扩展名反查，不信客户端 mimetype');

  const img = await raw(data.url);
  assert.equal(img.status, 200);
  assert.match(img.headers.get('content-type') || '', /image\/png/);
  assert.ok(img.bytes.equals(PNG_1PX), '下载到的字节必须和上传时一致');
  assert.match(img.headers.get('cache-control') || '', /immutable/);
});

// ------------------------------------------------------------
// TC-API-042 扩展名白名单
// 危险后缀一律在该文件写入磁盘之前被 fileFilter 拦下。
//
// 另外这里有一个「已发现但未修复」的真实风险，见文件末尾的探针：
// 现在后端只查扩展名、不嗅探文件内容。把一段脚本改名成 .png 也能传上去。
// 故意不把它写成 assert.equal(status, 201) —— 那是缺陷，不是产品契约，
// 把缺陷固化成"期望值"等于以后修好了测试反而变红。只记录，见 docs/03。
// ------------------------------------------------------------
test('TC-API-042 拒绝不支持的扩展名与无扩展名文件', async () => {
  const token = await login();
  const dangerous = [
    ['evil.exe', Buffer.from('MZ')],
    ['payload.sh', Buffer.from('#!/bin/sh\nrm -rf /')],
    ['shell.php', Buffer.from('<?php system($_GET["c"]); ?>')],
    ['noextension', Buffer.from('anything')]
  ];

  for (const [name, bytes] of dangerous) {
    const { status, data } = await upload(form(name, bytes), token);
    assert.equal(status, 400, `${name} 应被拒绝`);
    assert.match(data.error, /不支持的图片格式/);
  }

  // 已知风险探针（BUG-005）：只观察、不断言为"正确行为"
  const disguised = await upload(
    form('looks-like-image.png', Buffer.from('<script>alert(1)</script>')),
    token
  );
  console.log(
    `      [已知风险 BUG-005] 伪装成 .png 的脚本上传返回 HTTP ${disguised.status}；` +
      '当前只校验扩展名，未校验文件内容，详见 docs/03-缺陷清单.md'
  );
});

// ------------------------------------------------------------
// TC-API-043 边界值：刚好越过 5MB 上限
// 6MB 的 Buffer 由工厂在内存里生成，仓库里不存大文件。
// ------------------------------------------------------------
test('TC-API-043 超过 5MB 返回 413 而不是 500', async () => {
  const token = await login();
  const { status, data } = await upload(form('big.png', makeTooLargeImage(6)), token);

  assert.equal(status, 413);
  assert.match(data.error, /不能超过/);
});

// ------------------------------------------------------------
// TC-API-044 重名不覆盖：随机文件名
// ------------------------------------------------------------
test('TC-API-044 同名文件传两次不会互相覆盖', async () => {
  const token = await login();
  const a = await upload(form('same.png'), token);
  const b = await upload(form('same.png'), token);

  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  assert.notEqual(a.data.url, b.data.url, '两次应生成不同的 UUID 文件名');
  assert.equal((await raw(a.data.url)).status, 200, '第一个文件不能被第二个覆盖');
  assert.equal((await raw(b.data.url)).status, 200);
});

// ------------------------------------------------------------
// TC-API-045 空请求 / 字段名写错：给出明确的 400
// ------------------------------------------------------------
test('TC-API-045 空请求返回 400 且错误文案明确', async () => {
  const token = await login();

  const empty = await upload(new FormData(), token);
  assert.equal(empty.status, 400);
  assert.match(empty.data.error, /没有收到文件/);

  const wrongField = await upload(form('a.png', PNG_1PX, 'picture'), token);
  assert.equal(wrongField.status, 400, '字段名不是 file 也应被拒绝');
});
