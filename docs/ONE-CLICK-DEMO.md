# 一键演示（2026-11-02）

状态：已于 2026-11-03 部署并完成公网接口验收。本轮按用户授权发布，保留原有未提交工作；未执行数据库 reset，未修改 Nginx、端口或真实用户数据。

## 会话与权限

前端 `/demo` 只展示说明；点击 Try Demo 才 POST 创建上下文。浏览器生成 256 位幂等键，服务器产生独立 256 位不透明凭证。凭证仅保存在该标签页的 sessionStorage，不写 URL、日志或正常账号存储；服务端不接受客户端角色升级。正常账号凭证保留；Exit 会撤销服务器凭证，再清除演示存储并回入口。Reset 先显示行内确认，再仅恢复当前上下文；刷新恢复有效状态。关闭标签页不主动发出退出请求，未撤销状态按 TTL 回收。

每次受保护请求同时验证凭证、闲置期限和绝对期限；清理滞后不延长访问权。仅命中当前凭证的状态，公开样本之外不读取正常用户数据。写请求要求 JSON；有 Origin 时必须精确匹配前端来源。演示使用 Authorization，不依赖普通账号 Cookie，不把演示身份赋予普通用户或管理员权限。生产必须通过 HTTPS；不要将凭证存入可共享链接。

状态为有上限的进程内存，重启后全部演示失效，不写 MySQL。适用于当前单实例作品集；必须让演示请求稳定进入同一后端进程。启用前检查实际 PM2/容器副本数；若多进程或多副本，先保持 `DEMO_ENABLED=false`，另行审查共享存储或进程路由方案。此限制不是已经完成的多实例能力。

## 配置

| 变量 | 示例/默认 | 用途 |
| --- | --- | --- |
| DEMO_ENABLED | true | false 时拒绝新旧演示请求，保留正常业务 |
| DEMO_IDLE_SECONDS | 3600 | 闲置期限 |
| DEMO_MAX_SECONDS | 86400 | 绝对保留上限 |
| DEMO_MAX_SESSIONS | 200 | 活跃上下文上限 |
| DEMO_CREATE_PER_HOUR | 20 | 每个连接来源每小时新建上限；重复幂等请求复用原会话 |
| DEMO_REQUESTS_PER_MINUTE | 180 | 每个演示会话每分钟请求上限 |

创建限流采用连接的 remote address，**不信任客户端 X-Forwarded-For**。反向代理后可能共用一个限流桶，应按实际访客量调整上限；未改动 Nginx 的信任链或访问日志。计数表也有 10,000 个来源上限，防止无限增长。以上限制是单进程限制，重启会清空计数。

## 部署与回退

1. 保存当前可回退的应用构建和本次源码清单；不要用 `git reset --hard` 清理现有工作。
2. 在独立发布目录安装锁定依赖、运行本页检查，保留服务器现有秘密配置；不要把本地 `.env`、密钥、数据库或上传目录打包进去。
3. 先部署后端与公开样本，核对单进程、来源、TTL/上限和 API 转发；再部署前端。没有新增数据库迁移，不运行 schema sync、db:init、seed:admin 或全库 seed。
4. 经批准后用已有应用管理器重启对应服务。没有授权时停在本地构建结果，不能直接重启线上 PM2/systemd、改 Nginx 或 Compose。
5. 在线复测两个隔离会话：核心操作、跨会话 ID、正常账号/管理员拒绝、刷新、确认重置、退出旧凭证 401。检查正常账号还能登录/读写自己的数据，检查手机布局。TTL 可在独立验收环境缩短，不在生产制造大量会话。
6. 三个应用线上验收通过后，最后发布 homepage 的 Try Demo 链接，并去掉待部署说明。只有此时简历才可将新地址作为无需注册的 Live Demo。
7. 回退先恢复旧前端和主页，再恢复旧后端/样本及原配置。也可 `DEMO_ENABLED=false` 暂停入口。无需回滚数据库或删除真实数据；服务重启会终止现有演示。

## 验证边界

自动化测试覆盖服务器身份与归属、到期/退出、限流、重置和正常业务回归，不仅检查渲染。截图位于 `docs/demo-screenshots/`，全部来自本地样本会话。未验证线上域名部署、真实用户数据回归、真实 Stripe 端到端支付、多实例与高负载行为。浏览器隔离检查使用独立标签页的 sessionStorage 上下文及 HTTP 独立凭证；不声称做过两个独立浏览器 profile 的完整自动化。

## Finance 的复用与改动

原认证：JWT + 服务端会话 + IndexedDB ECDH 传输加密。演示 API `/api/demo` 在原鉴权和加密中间件之前挂载，使用独立 opaque bearer，并且仅实现一组明确路由。原 JWT、加密密钥和正常用户资料不变；demo 凭证访问正常 API 返回 401。演示 Profile 复用 validateProfile，组合与情景结果存在自己的会话，不接受 user/session ID 选择其他用户。

预计算样本由 `backend/demo/generate-example.py` 调用已有模型、allocation_report 和 cached_simulate 离线生成，不导入会自动读环境文件的 app.py，不下载行情、不调用收费 AI。样例为虚构的 30 岁家庭问卷、真实模型分数、七只示例股票的组合、500 条路径/10 年/固定随机种子的三情景结果。`example.json` 和 `monthly-prices.json` 均为公开样本，包含日期和来源，不含凭证。

发现原 CSV 在 2026-10 有日期、七只示例股票完整数据只到 2026-09；正常模型因此没有连续可用窗口。本次仅为 demo 冻结截至 **2026-09-30** 的完整共同历史，不插补缺失价格、不改正常源文件、不声称是最新行情。示例 universe 限这七只股票。

重新计算调用现有本地引擎，Python 新 blueprint 使用冻结样本：`/demo/predict_risk`、`/demo/allocate`、`/demo/simulator`。集成进原 Flask app；只通过 Node 身份/资源门限访问，Python 继续绑定回环接口，不能单独暴露公网。前端复用 `/user`、`/profile`、现有组合与 Monte Carlo 图表，首次明示预计算；新运行实际计算并保存，刷新可恢复。修复恢复 policy 时混入模型诊断字段的问题。无需邮箱、姓名、真实账户信息；研究展示，不构成投资建议。

资源：`DEMO_COMPUTE_CONCURRENCY=2`（本 Node 进程总并发），`DEMO_COMPUTE_PER_MINUTE=6`（每会话），每会话同一时间一次计算；最多 7 只股票、500 路径、20 年、两个组合。验证在代理前及 Python 中执行；超限返回 429 或 400，失败保留上一个成功结果。没有每次刷新重新计算。`PYTHON_SERVICE_URL` 沿用原变量，生产默认 http://localhost:5002；本地独立预览显式设 5122。

清理：`backend/demo/store.js` 每 `DEMO_CLEANUP_SECONDS=60` 秒回收；HTTP 服务运行时自动执行，无需新增调度器。与 Commercial store 的生命周期约定一致，但两仓库代码独立，互不形成文件路径依赖。

不读正常账号环境/数据库的独立预览：

```sh
# 项目根目录（使用原 requirements-core 依赖及模型文件）
.venv/bin/python backend/demo/generate-example.py
DEMO_PYTHON_PORT=5122 .venv/bin/python backend/python-service/demo_research.py
# 另一终端
PORT=5121 FRONTEND_ORIGIN=http://localhost:5120 PYTHON_SERVICE_URL=http://127.0.0.1:5122 node backend/demo/router.js
```

前端生产构建为静态文件；用同源本地服务在 5120 服务 frontend/build，并把 `/api/demo` 代理到 5121。正常开发仍可按原 README 用 CRA 和原 Express/Flask；不要让 demo 的 Python 端口覆盖正常环境变量。生产使用原 Flask 入口，包含新增 blueprint，不另开 Python 公网端口。

检查：`npm test --prefix backend` 33 项，`CI=true npm test --prefix frontend -- --watchAll=false --runInBand --silent` 28 项，Python 核心和新增 demo 引擎测试共 81 项全部通过；前端构建和生产 API 地址验证通过。浏览器完成 age 30→40→模型分数→重新优化→新 5 年情景计算→刷新恢复；第二会话仍是 age 30。付费扩展和真实用户资料的线上测试未执行。

## 本轮线上发布结果（2026-11-03）

已部署到原有域名的 `/demo`，公网会话、隔离、越权拒绝与核心接口通过；正常登录入口保留。Shopping `/register` 与 Finance `/signup` 提供明显 Register 按钮。Commercial 保留原本默认关闭的公开注册策略。上线后的浏览器工具连接超时，未声称完成本轮线上视觉或注册新账号的全流程；已有本地桌面/手机截图保留。

Finance JavaScript CI 在定向修复 follow-redirects 后通过；本轮只将该间接依赖固定到 1.16.2，没有升级框架。后台 34 项、前端 28 项测试通过，公开 Python CI 81 项（其中需要未公开模型的 1 项跳过）；服务器模型验证另外 3 项通过。
