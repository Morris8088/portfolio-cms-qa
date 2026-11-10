// ============================================================
// sut-server.mjs —— 启动"被测系统"（SUT = System Under Test）
// ------------------------------------------------------------
// 这是测试工程里最重要的一块基建，也是面试常问的点：
//   Q：你的测试会不会把开发数据库搞脏？
//   A：不会。测试工程不 import 业务代码，只通过 HTTP 调它；
//      每次启动用 :memory: 内存库和临时上传目录，跑完即焚。
//
// 四个必须注意的顺序/隔离细节：
//   1. 环境变量要在 import app.js **之前**设好 —— db.js 在模块加载时就读 DB_FILE
//   2. DB_FILE=:memory: → 不碰 portfolio-cms/backend/data.db
//   3. UPLOAD_DIR 指到临时目录 → 上传测试不会往真实 uploads/ 塞垃圾
//   4. 端口由 SUT_PORT 指定（默认 3301），别占掉开发用的 3001
//
// 单独运行：npm run sut
// 一般不手动跑，交给 with-sut.mjs 自动起停。
// ============================================================

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const HERE = resolve(import.meta.dirname);
const ROOT = resolve(HERE, '..');

// 被测项目在隔壁目录；换机器时用 SUT_ROOT 覆盖，测试工程本身不写死业务代码路径
const SUT_ROOT = process.env.SUT_ROOT || resolve(ROOT, '..', 'portfolio-cms');
const PORT = Number(process.env.SUT_PORT) || 3301;

const tmpUploads = mkdtempSync(join(tmpdir(), 'portfolio-qa-uploads-'));

// ↓↓↓ 必须在动态 import 之前 ↓↓↓
process.env.DB_FILE = ':memory:';
process.env.JWT_SECRET = 'qa-only-secret-never-use-in-prod';
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASS = 'admin123';
process.env.UPLOAD_DIR = tmpUploads;
process.env.NODE_ENV = 'test';
process.env.SEED = '1';

const asUrl = (p) => pathToFileURL(join(SUT_ROOT, p)).href;

let server;
try {
  const { default: app } = await import(asUrl('backend/src/app.js'));
  const { seed } = await import(asUrl('backend/src/seed.js'));

  seed(); // 灌入演示数据，让"列表有文章"这类断言有东西可查

  server = app.listen(PORT, '127.0.0.1', () => {
    console.log(`SUT_READY http://127.0.0.1:${PORT}`);
  });
} catch (err) {
  console.error('[SUT] 启动失败：', err.message);
  console.error('[SUT] 当前 SUT_ROOT =', SUT_ROOT);
  console.error('[SUT] 若目录不同，请设环境变量 SUT_ROOT 指向 portfolio-cms 根目录');
  rmSync(tmpUploads, { recursive: true, force: true });
  process.exit(1);
}

function shutdown() {
  if (server) server.close();
  rmSync(tmpUploads, { recursive: true, force: true });
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
