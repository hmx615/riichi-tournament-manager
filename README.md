# 麻将赛事网站

用于管理立直麻将比赛、录入天凤与 NAGA 牌谱、计算赛事分数和展示四人统计数据。

## 当前状态

- 当前 29 场 `1st XRC` 数据作为首个正式比赛导入，而不是特殊样例。
- 新比赛与 `1st XRC` 使用相同的创建、登记选手、赛程、牌谱录入和身份校验流程。
- 牌谱用户名优先按选手别名自动匹配，并保留逐场人工修改入口。

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

## 目录

- `reference/1st-xrc-29/`：固定版网页及其回归数据，不在新代码中修改
- `scripts/import-legacy-xrc.mjs`：把 29 场基准转换为网站统一赛事结构
- `src/domain/`：赛事领域类型与校验规则
- `src/data/`：当前导入后的赛事数据
- `src/app/`：管理界面
