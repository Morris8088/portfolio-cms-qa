# portfolio-cms-qa

> [portfolio-cms](https://github.com/Morris8088/portfolio-cms) 的**配套自动化测试工程**。
> 一句话：它不写业务代码，只负责"把被测系统拉起来、按设计好的用例测一遍、出一份能给人看的报告"。

## 为什么要单独建一个仓库

原来那个项目里其实已经有 60+ 个测试，但都散在 `backend/test/`、`frontend/test/` 和脚本里。
面试官打开仓库，看到的是一堆 `.test.js`，看不出**你懂不懂测试设计**。

单独拆出来的好处：

| 求职方向 | 这个仓库能拿出来讲的东西 |
| --- | --- |
| 测试 | 用例设计方法、分层策略、缺陷清单、数据隔离、CI、可视化报告 |
| 前端 | Playwright 页面自动化、选择器与设计、hash 路由与 SPA 兜底、回归用例 |
| 后端 | 接口契约、鉴权与越权、参数边界、上传安全、`node:test` 零依赖方案 |

同一份代码，三个岗位各讲各的重点，不用准备三套作品。

## 快速开始

**前置条件**（一次性）：

1. Node ≥ 22
2. 机器上装了 Google Chrome（Windows 默认路径 `C:/Program Files/Google/Chrome/Application/chrome.exe`）
3. 被测项目 `portfolio-cms` 在本仓库的**隔壁目录**，并且：
   - `backend/`、`frontend/` 都跑过 `npm install`
   - `frontend/` 跑过 `npm run build:demo`（页面测试要用 `dist` 产物）

```bash
npm install      # 只装 @playwright/test，不下载浏览器
npm test         # 一键：接口层 + 页面层 + 生成报告
```

跑完打开 **`reports/index.html`** —— 这份报告可以直接发给面试官。

![测试报告预览](docs/report-preview.png)

也可以分层跑：

```bash
npm run test:api   # 只跑接口契约（自动起停真实后端）
npm run test:e2e   # 只跑页面 E2E（自动起停本地静态站点）
npm run report     # 只重新生成报告
```

### 想测线上站点而不是本地？

```bash
E2E_BASE_URL=https://morris8088.github.io/portfolio-cms/ npm run test:e2e
```

设了 `E2E_BASE_URL` 之后，Playwright 不会再启动本地静态服务器，直接打你给的地址。
（国内访问 GitHub Pages 偏慢，日常回归建议用默认的本地靶子；线上地址用于发版后抽查。）

## 目录结构

```
portfolio-cms-qa/
├── cases/testcases.json      用例清单——唯一数据源（文档、报告都读它）
├── docs/                     策略 / 用例设计 / 缺陷清单 / 面试讲法 / 练习任务
├── fixtures/factory.js       测试数据工厂（每次造新数据，避免用例互相污染）
├── scripts/
│   ├── sut-server.mjs        用内存库启动真实后端，跑完即焚
│   ├── static-server.mjs     本地复刻 GitHub Pages（含 SPA 兜底）
│   ├── with-sut.mjs          起服务 → 跑测试 → 一定关服务
│   ├── run-all.mjs           两层都跑完再统一出报告
│   └── make-report.mjs       汇总成 reports/index.html
├── tests/
│   ├── api/                  接口契约层（Node 内置 test runner，零依赖）
│   │   ├── helpers/client.js    fetch 封装：状态码/响应体/耗时一起返回
│   │   ├── smoke.test.js        ★ 范例①：写透的 7 条用例
│   │   └── *.test.js           练习位（test.todo，不算失败）
│   └── e2e/                  页面层（Playwright Test）
│       ├── reader.spec.js      ★ 范例②：写透的 5 条读者主流程
│       └── admin.spec.js       练习位（test.skip）
├── playwright.config.js      浏览器、报告、webServer 配置
└── .github/workflows/qa.yml  CI：自动拉被测项目、构建、跑全套、上传报告
```

## 三个设计决定（面试会被问）

**1. 测试不 import 业务代码，只走 HTTP。**
接口测试把 `portfolio-cms` 当成黑盒，通过 `API_BASE_URL` 访问；`sut-server.mjs` 用 `:memory:` 内存库 + 临时上传目录启动它，跑完自动删除。真实 `data.db` 和 `uploads/` 一个字节都不会被碰。

**2. 页面测试默认打本地靶子，不赌外网。**
第一版直接打线上 GitHub Pages，两个用例并发就 `net::ERR_TIMED_OUT` —— 失败原因是网络不是产品，这种"假红"最消耗对测试的信任。现在用 `static-server.mjs` 本地复刻 Pages（剥掉 `/portfolio-cms/` 前缀、未知路径回 `404.html`），离线、秒开、可重复。

**3. 用例清单只有一份。**
`cases/testcases.json` 是唯一数据源，`make-report.mjs` 直接读它生成表格。避免"文档一张表、代码一套用例、报告第三份"三处对不上的经典问题。

## 当前状态

| 层次 | 已自动化 | 练习位 | 本次结果 |
| --- | --- | --- | --- |
| 接口契约 | 7 | 23 | 7 通过 / 0 失败 |
| 页面 E2E | 5 | 4 | 5 通过 / 0 失败 |
| 合计 | **12** | **27** | **全绿** |

练习位不是空壳：每条都写清了要测什么、用什么方法、参考哪个范例，见 `docs/05-练习任务.md`。
`test.todo` / `test.skip` 会明确显示为"待办"，不会伪装成通过。

## 环境变量

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `SUT_ROOT` | `../portfolio-cms` | 被测项目根目录 |
| `SUT_DIST` | `../portfolio-cms/frontend/dist` | 页面测试用的构建产物 |
| `SUT_PORT` | `3301` | 后端测试端口（避开开发用的 3001） |
| `API_BASE_URL` | 自动启动的本地后端 | 接口被测地址 |
| `E2E_BASE_URL` | 本地 `4173` 静态站点 | 页面被测地址 |
| `CHROME_PATH` | 系统 Chrome 标准路径 | 换机器时指定 Chrome |
| `E2E_PORT` | `4173` | 本地静态站点端口 |

## 排错

- **`找不到构建产物 .../dist/index.html`** → 去 `portfolio-cms/frontend` 跑 `npm run build:demo`。
- **`[SUT] 启动失败`** → 确认 `SUT_ROOT` 指对了，且 `backend/node_modules` 存在。
- **`page.goto` 超时** → 多半是设了 `E2E_BASE_URL` 打外网；去掉它用本地靶子。
- **端口被占** → 换 `SUT_PORT` / `E2E_PORT`。
- **Windows 上 Chrome 不在默认路径** → 设 `CHROME_PATH`。

## 文档索引

| 文件 | 什么时候看 |
| --- | --- |
| `docs/01-测试策略与分层.md` | 想讲清楚"为什么分这两层" |
| `docs/02-用例设计方法.md` | 想讲清楚"用例是怎么想出来的" |
| `docs/03-缺陷清单.md` | 想讲清楚"测试真的抓到过 bug" |
| `docs/04-面试怎么讲.md` | 面试前一晚 |
| `docs/05-练习任务.md` | 动手补练习位时 |
