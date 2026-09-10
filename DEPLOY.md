# Cloudflare 免费部署

正式环境使用 Cloudflare Workers + D1：OpenNext 运行 Next.js，D1 保存比赛、牌谱缓存、备份和登录限流数据。由于 `workers.dev` 在当前国内网络被阻断，对外入口使用一层 Cloudflare Pages 代理。本地开发默认继续使用 `data/` JSON 仓储。

- 正式入口：<https://riichi-tournament-manager.pages.dev>
- 牌例筛选站：<https://xuanxuan-mahjong-cases.pages.dev>
- Worker 原始入口：<https://riichi-tournament-manager.hmx-mahjong.workers.dev>
- 牌例站旧地址跳转：<https://xuanxuan-mahjong-cases-worker.hmx-mahjong.workers.dev>

## 首次部署

1. 登录 Cloudflare：

```bash
npx wrangler login
npx wrangler whoami
```

2. 创建 D1，将命令返回的 `database_id` 写入 `wrangler.jsonc`：

```bash
npx wrangler d1 create riichi-tournament-manager
```

3. 从本地已确认数据重新生成初始种子，并应用迁移：

```bash
npm run cf:seed:build
npm run cf:db:remote
```

`0002_seed.sql` 只填充空数据库，不覆盖云端已有比赛和牌谱。

4. 配置 Worker 秘密：

```bash
npx wrangler secret put ADMIN_USERNAME
npx wrangler secret put ADMIN_PASSWORD_HASH
npx wrangler secret put AUTH_SECRET
npx wrangler secret put TUTORIAL_HMX_PASSWORD_HASH
npx wrangler secret put TUTORIAL_PHQ_PASSWORD_HASH
npx wrangler secret put TUTORIAL_EZY_PASSWORD_HASH
npx wrangler secret put TUTORIAL_WDJ_PASSWORD_HASH
```

值来自本机 `.env.local`。不要把 `.env.local` 或 `.secrets/` 提交到 Git。

5. 构建并部署：

```bash
npm run cf:deploy
npm run cf:deploy:pages
npm run cf:deploy:tutorial-worker
npm run cf:deploy:tutorial-pages
curl -fsS https://riichi-tournament-manager.pages.dev/api/health
```

牌例站使用 Vite 构建静态 React SPA，由 Cloudflare Pages 直接提供页面、候选数据和麻将素材。`cloudflare-tutorial-pages-proxy/_worker.js` 只处理登录、审核状态读取和 D1 条件写入，不再运行 Next.js SSR，避免免费 Worker 的 10ms CPU 上限触发 1102。`wrangler.tutorial.jsonc` 仅部署旧 `workers.dev` 地址的轻量跳转 Worker，不连接 D1，也不承载牌例页面。

牌例站与赛事主站共享同一个 D1 数据库，但部署彼此独立。部署静态 SPA 或跳转 Worker 不会导入、清空或覆盖审核数据。

赛事域名上旧的 `/tutorials/*` 链接由 `cloudflare-pages-proxy` 自动跳转到牌例筛选站，已有书签仍可继续使用。

## 日常更新

数据已保存在 D1，重新部署不会覆盖比赛数据。牌例站日常更新只需部署 Pages；旧地址跳转逻辑变化时才部署 tutorial Worker：

```bash
npm run typecheck
npm test
npm run cf:db:remote
npm run cf:deploy
npm run cf:deploy:pages
npm run cf:deploy:tutorial-pages
```

```bash
npm run cf:deploy:tutorial-worker
```

存在新迁移时必须先执行 `cf:db:remote`。迁移均使用 `IF NOT EXISTS` 或冲突忽略策略，可重复检查而不会覆盖现有比赛数据。

## 备份

```bash
npx wrangler d1 export riichi-tournament-manager --remote --output backups/riichi-$(date +%F).sql
```

D1 免费层还提供 7 天 Time Travel。重要比赛完成或批量修改前，仍应执行一次手动导出。人物头像保存在独立的 `avatars` 表中，会随 D1 一并备份。

## 本机限制

当前电脑的 glibc 低于 Wrangler/Workerd 所需版本，因此 `wrangler dev` 和本地 D1 模拟器无法启动。Next.js 构建、OpenNext 转换和 Wrangler 上传可正常执行；`cf:deploy` 通过 `--autoconfig=false` 避免 Wrangler 重复调用需要 Workerd 的 OpenNext 包装命令。D1 运行时回归在 Cloudflare 正式部署上完成。

## Docker 备用方案

`Dockerfile`、`compose.yaml` 和 `Caddyfile` 仍保留。若未来转到付费云主机，可使用持久卷 `/app/data` 运行原有单实例方案。
