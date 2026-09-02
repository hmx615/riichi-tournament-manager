# Cloudflare 免费部署

正式环境使用 Cloudflare Workers + D1：OpenNext 运行 Next.js，D1 保存比赛、牌谱缓存、备份和登录限流数据。由于 `workers.dev` 在当前国内网络被阻断，对外入口使用一层 Cloudflare Pages 代理。本地开发默认继续使用 `data/` JSON 仓储。

- 正式入口：<https://riichi-tournament-manager.pages.dev>
- Worker 原始入口：<https://riichi-tournament-manager.hmx-mahjong.workers.dev>

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

4. 配置三个 Worker 秘密：

```bash
npx wrangler secret put ADMIN_USERNAME
npx wrangler secret put ADMIN_PASSWORD_HASH
npx wrangler secret put AUTH_SECRET
```

值来自本机 `.env.local`。不要把 `.env.local` 或 `.secrets/` 提交到 Git。

5. 构建并部署：

```bash
npm run cf:deploy
npm run cf:deploy:pages
curl -fsS https://riichi-tournament-manager.pages.dev/api/health
```

## 日常更新

数据已保存在 D1，重新部署 Worker 不会覆盖比赛数据：

```bash
npm run typecheck
npm test
npm run cf:db:remote
npm run cf:deploy
npm run cf:deploy:pages
```

存在新迁移时必须先执行 `cf:db:remote`。迁移均使用 `IF NOT EXISTS` 或冲突忽略策略，可重复检查而不会覆盖现有比赛数据。

## 备份

```bash
npx wrangler d1 export riichi-tournament-manager --remote --output backups/riichi-$(date +%F).sql
```

D1 免费层还提供 7 天 Time Travel。重要比赛完成或批量修改前，仍应执行一次手动导出。

## 本机限制

当前电脑的 glibc 低于 Wrangler/Workerd 所需版本，因此 `wrangler dev` 和本地 D1 模拟器无法启动。Next.js 构建、OpenNext 转换和 Wrangler 上传可正常执行；`cf:deploy` 通过 `--autoconfig=false` 避免 Wrangler 重复调用需要 Workerd 的 OpenNext 包装命令。D1 运行时回归在 Cloudflare 正式部署上完成。

## Docker 备用方案

`Dockerfile`、`compose.yaml` 和 `Caddyfile` 仍保留。若未来转到付费云主机，可使用持久卷 `/app/data` 运行原有单实例方案。
