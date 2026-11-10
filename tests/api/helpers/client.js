// ============================================================
// client.js —— 接口测试的"遥控器"
// ------------------------------------------------------------
// 用例文件不该重复写 fetch、JSON 解析、token 拼接这些杂活。
// 把它们收进这里，用例就只剩三件事：发什么、拿回什么、该是什么。
//
// 逐行拆给你看（面试也常问"你的测试封装了什么"）：
//   1. BASE 来自环境变量，不写死地址 —— 本地、CI、预发环境都能跑同一套用例
//   2. 返回 { status, data, headers, ms }，连耗时一起带回来，方便做性能冒烟
//   3. 4xx/5xx **不抛异常**：对测试来说 401 也是一个正常结果，
//      要断言的恰恰就是"该 401 的时候是不是 401"
//   4. 响应不是 JSON 时退回原始文本，避免解析器先崩掉、看不到真正的问题
// ============================================================

export const BASE = process.env.API_BASE_URL || 'http://127.0.0.1:3301';

/**
 * 发一次 HTTP 请求。
 * @param {string} path  以 / 开头的路径，例如 '/api/posts?page=1'
 * @param {object}  opts
 * @param {string} [opts.method='GET']
 * @param {any}    [opts.body]      有值就自动加 JSON 头并序列化
 * @param {string} [opts.token]     有值就自动加 Bearer 令牌
 * @param {object} [opts.headers]   需要覆盖/追加的自定义头
 */
export async function api(path, { method = 'GET', body, token, headers = {} } = {}) {
  const finalHeaders = { ...headers };
  if (body !== undefined) finalHeaders['Content-Type'] = 'application/json';
  if (token) finalHeaders.Authorization = `Bearer ${token}`;

  const started = performance.now();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text; // 不是 JSON 就原样留着，让用例看到真实响应
  }

  return {
    status: res.status,
    data,
    headers: res.headers,
    ms: Math.round(performance.now() - started)
  };
}

/** 拿管理员令牌。用例里写 await login() 就行，不用关心登录细节。 */
export async function login(username = 'admin', password = 'admin123') {
  const { status, data } = await api('/api/auth/login', {
    method: 'POST',
    body: { username, password }
  });
  if (status !== 200) {
    throw new Error(`登录失败：HTTP ${status} ${JSON.stringify(data)}`);
  }
  return data.token;
}
