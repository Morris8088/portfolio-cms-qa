// ============================================================
// static-server.mjs —— 本地复刻 GitHub Pages，给页面测试当靶子
// ------------------------------------------------------------
// 为什么不默认打线上站点？
//   1. 国内访问 GitHub Pages 时快时慢，两个用例并发就可能 net::ERR_TIMED_OUT，
//      失败原因是网络而不是产品 —— 这种"假红"最消耗信任
//   2. 测试必须能离线跑、能在 CI 里重复跑，不能赌外网
//   3. 但线上回归仍有价值：设 E2E_BASE_URL 就能切回去
//
// 这个服务器只做三件事：
//   · 把 /portfolio-cms/ 前缀剥掉，去 dist 里找对应文件
//     （demo 构建的资源路径带这个前缀，因为 Pages 挂在子路径下）
//   · 找不到就回 404.html —— 这正是 GitHub Pages 的 SPA 兜底行为
//   · 防目录穿越，别让 ../ 读到 dist 外面的文件
//
// 前置条件：被测项目先跑过 npm run build:demo（产物在 frontend/dist）。
// ============================================================

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, normalize } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = resolve(process.env.SUT_DIST || resolve(ROOT, '..', 'portfolio-cms/frontend/dist'));
const PREFIX = '/portfolio-cms/';
const PORT = Number(process.env.E2E_PORT) || 4173;

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('[static] 找不到构建产物：' + join(DIST, 'index.html'));
  console.error('[static] 请先在 portfolio-cms/frontend 执行 npm run build:demo');
  console.error('[static] 或用 SUT_DIST 指定别的 dist 目录');
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json'
};

const ext = (p) => p.slice(p.lastIndexOf('.'));

const server = createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('bad request');
    return;
  }

  if (pathname.startsWith(PREFIX)) pathname = '/' + pathname.slice(PREFIX.length);
  if (pathname === '/' || pathname === '') pathname = '/index.html';

  // normalize + 前缀校验，挡住 ../../ 这类路径穿越
  const target = normalize(join(DIST, pathname));
  if (!target.startsWith(DIST)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  if (existsSync(target) && statSync(target).isFile()) {
    res.writeHead(200, { 'Content-Type': TYPES[ext(target)] || 'application/octet-stream' });
    res.end(readFileSync(target));
    return;
  }

  // SPA 兜底：和 GitHub Pages 一样把未知路径交给 404.html 重定向回 hash 路由
  const fallback = join(DIST, '404.html');
  if (existsSync(fallback)) {
    res.writeHead(200, { 'Content-Type': TYPES['.html'] });
    res.end(readFileSync(fallback));
  } else {
    res.writeHead(404).end('not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[static] 本地被测站点：http://127.0.0.1:${PORT}${PREFIX}`);
  console.log(`[static] 产物目录：${DIST}`);
});
