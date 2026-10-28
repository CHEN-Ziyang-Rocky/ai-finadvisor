# 2026-10-29：线上登录误连 localhost 的修复

用户截图中的 `session-server-public-key` 请求被发往 `https://localhost:5001/api/auth/session-server-public-key`，浏览器因此连接访问者自己的电脑，无法到达本站后端。

旧代码允许构建环境的 `REACT_APP_API_BASE_URL` 覆盖默认 `/api`。上一版发布包 `main.ff55553c.js` 实际包含本地开发接口地址。此前只验证服务器计算，没有完成真实浏览器登录，因而漏检了前端部署地址错误。

## 修复

- `frontend/src/api/base.js` 统一接口前缀为 `/api`，认证、加密请求、资产目录及旧客户端共用同一个站内入口。
- 开发仍由 CRA 的开发代理转发 `/api`；生产由现有 Nginx 转发，无需把浏览器指向本机端口。
- 旧客户端同时修正 Axios 配置项 `baseUrl` 为 `baseURL`。
- `npm run build` 增加发布成品检查：验证 HTML 引用的脚本存在，并拒绝成品 JavaScript 中的 localhost / 127.0.0.1 / IPv6 回环 API 地址。不会读取或打印环境文件。

## 验证

- 前端 9 个测试套件、22 项测试通过。
- 故意使用 `REACT_APP_API_BASE_URL=https://localhost:5001/api` 构建，产物仍使用站内 `/api`；构建检查通过。
- 用实际上一版发布包回归，新增检查成功拒绝该错误包。
- 公开 HTTPS 域名完成会话握手、签名验证和加密注册。
- 独立临时测试账号通过真实 Chrome 登录，成功进入 `/overview`，随后进入模拟器并完成 500 路径、10 年、3 组合 × 3 情景的真实加密请求。页面正常显示 Baseline / Optimistic / Pessimistic 摘要与详细结果。
- 新生产脚本为 `main.aa543028.js`。只发布 Finance 静态文件；原有服务、公钥、研究 CSV、Nginx、PM2、共享数据库配置及其他网站未修改。
- 静态入口回退备份：`/home/ubuntu/finance-apiurl-release.z8n157ld/previous`；旧哈希资源保留供已打开页面使用。已打开的旧页面需刷新以加载新代码。

临时账号只用于本次路由验收；验收后删除该账号及其空白自选表，不涉及现有用户数据。
