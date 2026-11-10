// ============================================================
// with-sut.mjs —— 「起服务 → 跑测试 → 关服务」的一次性外壳
// ------------------------------------------------------------
// 用法：node scripts/with-sut.mjs <命令> [参数...]
// 例：  node scripts/with-sut.mjs node --test tests/api
//
// 为什么要有这一层？
//   接口测试是黑盒的，被测服务必须真的在监听。让人手工先开一个终端跑后端，
//   既容易忘，又会在 CI 里直接挂掉。这个脚本保证：
//     · 开始前服务已就绪（轮询健康检查，不是 sleep 碰运气）
//     · 不管测试成功还是失败，服务一定被关掉（不留僵尸进程）
//     · 把服务地址通过 API_BASE_URL 传给测试进程
//
// 面试说法：这叫「测试夹具（fixture）的生命周期管理」。
// ============================================================

import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PORT = Number(process.env.SUT_PORT) || 3301;
const BASE = process.env.API_BASE_URL || `http://127.0.0.1:${PORT}`;

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('用法: node scripts/with-sut.mjs <命令> [参数...]');
  process.exit(2);
}

// 命令写 "node" 时换成当前这个 node 的绝对路径，绕开 Windows PATH 找不到 node 的老问题
const exe = command === 'node' ? process.execPath : command;

// 测试发现（test discovery）：Node 22 的 --test 不接受目录，会把 "tests/api"
// 当成一个模块去加载。这里把目录展开成该目录下所有 *.test.js 的绝对路径。
// 用绝对路径，用例放在哪一层目录都不怕 cwd 变化。
function expandArgs(list) {
  const out = [];
  for (const a of list) {
    if (a === 'tests/api') {
      const dir = resolve(ROOT, 'tests/api');
      for (const f of readdirSync(dir).sort()) {
        if (f.endsWith('.test.js')) out.push(resolve(dir, f));
      }
    } else {
      out.push(a);
    }
  }
  return out;
}
const finalArgs = expandArgs(args);

const env = { ...process.env, API_BASE_URL: BASE, SUT_PORT: String(PORT) };
const sut = spawn(process.execPath, [resolve(ROOT, 'scripts/sut-server.mjs')], {
  env,
  stdio: ['ignore', 'pipe', 'pipe']
});

let sutLog = '';
sut.stdout.on('data', (d) => { sutLog += d.toString(); });
sut.stderr.on('data', (d) => { sutLog += d.toString(); });

/** 轮询健康检查，而不是 sleep(2) 猜它起来了没有 */
async function waitUntilReady(timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (sut.exitCode !== null) throw new Error('被测服务提前退出');
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      // 还没监听，继续等
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('被测服务启动超时');
}

function stopSut() {
  if (sut.exitCode === null) sut.kill('SIGTERM');
}

let exitCode = 1;
try {
  await waitUntilReady();
  console.log(`[with-sut] 被测服务就绪：${BASE}`);

  exitCode = await new Promise((done) => {
    // cwd 固定到工程根目录，保证 `tests/api` 这类相对路径在任何地方调用都能找到
    const child = spawn(exe, finalArgs, { env, stdio: 'inherit', cwd: ROOT });
    child.on('error', (err) => {
      console.error('[with-sut] 启动测试命令失败：', err.message);
      done(1);
    });
    child.on('exit', (code) => done(code ?? 1));
  });
} catch (err) {
  console.error('[with-sut]', err.message);
  console.error('--- 被测服务日志 ---\n' + sutLog);
  exitCode = 1;
} finally {
  stopSut();
}

process.exit(exitCode);
