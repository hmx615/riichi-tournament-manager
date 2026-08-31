# 云端部署

## 推荐形态

首版使用单实例 Node 容器和持久磁盘。`/app/data` 保存比赛、牌谱缓存和备份，Caddy 自动申请并续期 HTTPS 证书。

不要部署到没有持久磁盘的纯 Serverless 平台；当前仓储仍以 JSON 文件原子写入。

## 准备服务器

服务器需要安装 Docker Engine 与 Docker Compose，并开放 TCP `80`、`443`。域名 A/AAAA 记录需要指向服务器公网地址。

## 配置

1. 复制 `deploy.env.example` 为 `.env.production`。
2. 设置 `DOMAIN`。
3. 从本机 `.env.local` 复制 `ADMIN_USERNAME`、`ADMIN_PASSWORD_HASH` 和 `AUTH_SECRET`，不要复制初始明文密码。`ADMIN_PASSWORD_HASH` 在部署文件中使用单引号包裹，避免 `$` 被 Compose 展开。
4. 保证 `.env.production` 权限为 `600`。

## 启动

```bash
docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production ps
curl -fsS https://你的域名/api/health
```

首次启动会把仓库中的现有比赛复制到空的数据卷。后续更新镜像不会覆盖持久卷中的比赛数据。

## 备份

```bash
docker compose --env-file .env.production exec app tar -C /app -czf /tmp/xrc-data.tgz data
docker compose --env-file .env.production cp app:/tmp/xrc-data.tgz ./xrc-data.tgz
```

在变更比赛或升级服务前执行备份。正式运行后应再配置云盘快照或定时异地备份。
