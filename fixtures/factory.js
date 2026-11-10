// ============================================================
// factory.js —— 测试数据工厂
// ------------------------------------------------------------
// 为什么不能在用例里写死 { title: '测试文章' }？
//   第一次跑创建了它，第二次跑就撞上「slug 已存在」返回 409 ——
//   用例变成「只能跑一次」，CI 上第二次必定红。
//   这叫「用例之间互相污染」，是自动化测试最常见的翻车原因。
//
// 工厂的职责：每次都造一份**全新的、合法的**数据。
//   随机后缀保证不撞车，overrides 让用例只改自己关心的那个字段。
// ============================================================

let seq = 0;

/** 造一篇合法文章。想测某个字段就传 overrides 覆盖它，例如 makePost({ title: '   ' }) */
export function makePost(overrides = {}) {
  seq += 1;
  const stamp = `${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    title: `QA自动化文章 ${stamp}`,
    content: '这是由测试工厂生成的正文，用来验证接口行为。'.repeat(3),
    tags: '自动化测试,QA',
    status: 'published',
    ...overrides
  };
}

/** 造一个合法但只有 1 像素的 PNG，避免把大文件塞进测试仓库 */
export const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

/** 造一个超过上传限制的 Buffer（默认 6MB） */
export function makeTooLargeImage(mb = 6) {
  return Buffer.concat([PNG_1PX, Buffer.alloc(mb * 1024 * 1024)]);
}
