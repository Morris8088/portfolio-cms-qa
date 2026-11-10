// ============================================================
// 练习位 ④：文件上传（TC-API-040 ~ 045）——安全测试专场
// ------------------------------------------------------------
// 上传是最容易出安全漏洞的接口，面试问「你测过哪些安全场景」就答这组。
// 提示：用 Node 内置的 FormData + Blob，不需要装 supertest / form-data。
//   const form = new FormData();
//   form.append('file', new Blob([PNG_1PX]), 'a.png');
//   const res = await fetch(`${BASE}/api/uploads`, { method:'POST', headers:{Authorization:`Bearer ${token}`}, body: form });
//   —— 注意这里不要用 helpers/client.js 的 api()，它会把 body JSON 序列化，
//      FormData 必须原样交给 fetch。
// ============================================================

import { test } from 'node:test';

// 提示：不带 token 直接上传
test.todo('TC-API-040 未登录上传返回 401');

// 提示：上传 1 像素 PNG，断言 201、url 形如 /uploads/<uuid>.png，再 GET 这个 url 能拿到 image/png
test.todo('TC-API-041 合法 PNG 上传成功且返回的地址可访问');

// 提示：分别试 evil.exe、payload.sh、改了扩展名但内容不是图片的文件
test.todo('TC-API-042 拒绝不支持的扩展名与伪装文件');

// 提示：造一个 6MB 的 Buffer，断言 413
test.todo('TC-API-043 超过 5MB 返回 413');

// 提示：同名文件传两次，两次 url 不同（不会互相覆盖）
test.todo('TC-API-044 同名文件不会互相覆盖');

// 提示：FormData 里什么都不放，断言 400
test.todo('TC-API-045 空请求返回 400 且错误文案明确');
