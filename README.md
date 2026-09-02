# 麻将赛事网站

用于管理立直麻将比赛、录入天凤、NAGA 与雀魂 JSON 牌谱、计算赛事分数，并按比赛或全局人物展示统计数据。

## 当前状态

- 当前 29 场 `1st XRC` 数据作为首个正式比赛导入，而不是特殊样例。
- 新比赛与 `1st XRC` 使用相同的创建、登记选手、赛程、牌谱录入和身份校验流程。
- 牌谱用户名优先按选手别名自动匹配，并保留逐场人工修改入口。
- 全局人物库通过稳定的 `personId` 关联不同比赛中的账号和昵称，人物页汇总全部比赛的顺位、攻守、NAGA 与对局历史。
- 人物头像由管理员维护；本地开发保存到 `data/avatars/`，正式环境保存到独立的 D1 `avatars` 表。

## 本地运行

```bash
npm install
npm run import:legacy
npm run dev
```

首次启用管理员模式时运行：

```bash
npm run admin:credentials -- admin
```

初始登录信息保存在 `.secrets/admin-login.txt`，管理员环境配置保存在 `.env.local`。两者均不会进入 Git。

访客无需登录即可查看比赛、赛程和统计数据；新建比赛、比赛设置、牌谱录入和对局修改仅对管理员开放。

## 云端部署

默认使用 Cloudflare Workers + D1 免费层，支持访客只读、管理员操作和持久数据。项目也保留 Docker + Caddy 备用方案。具体步骤见 [DEPLOY.md](./DEPLOY.md)。

国内可访问的正式入口：<https://riichi-tournament-manager.pages.dev>

## 目录

- `reference/1st-xrc-29/`：固定版网页及其回归数据，不在新代码中修改
- `scripts/import-legacy-xrc.mjs`：把 29 场基准转换为网站统一赛事结构
- `src/domain/`：赛事领域类型与校验规则
- `src/data/`：当前导入后的赛事数据
- `src/app/`：管理界面
- `data/people.json`：本地开发使用的全局人物库
