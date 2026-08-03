# Railway 公网部署

本站使用本地 SQLite（`data/app.db`）与上传目录，**必须**挂持久卷，否则重启后数据会丢。

## 1. 准备

- GitHub 仓库：https://github.com/JaylinHuang/Anniversary_zzzblowwater
- Railway 账号（可用 GitHub 登录）：https://railway.app

## 2. 网页部署（推荐）

1. 打开 [Railway Dashboard](https://railway.app/dashboard) → **New Project** → **Deploy from GitHub repo**
2. 选择 `Anniversary_zzzblowwater`，确认使用根目录 `Dockerfile`
3. 打开该 **Service** → **Variables**，至少设置：

| 变量 | 说明 |
|------|------|
| `SITE_PASSPHRASE` | 群口令（勿用示例默认值上线） |
| `LLM_API_BASE` / `LLM_API_KEY` / `LLM_MODEL` | 可选，Agent 单聊需要 |
| `ONEBOT_ACCESS_TOKEN` / `ONEBOT_GROUP_ID` | 可选，机器人同步 |

4. **Settings → Volumes** → Add Volume，**Mount Path 填：`/app/data`**（不要填 `/data`）
5. **Settings → Networking** → **Generate Domain**，得到 `https://xxx.up.railway.app`
6. 等 Deploy 成功后打开域名 → `/gate` 用口令进站 → 第一个建档用户为 admin

## 3. CLI 部署（可选）

```bash
npm i -g @railway/cli
railway login
railway init          # 关联或新建项目
railway up
railway volume add --mount /app/data   # 若 CLI 版本支持；否则用网页添加
railway domain
railway variables set SITE_PASSPHRASE="你的群口令"
```

## 4. 验收清单

- [ ] 公网 HTTPS 能打开口令页
- [ ] 注册一位用户，刷新后仍登录
- [ ] 管理后台可改口令 / 看模块开关
- [ ] （可选）`npm run db:sample-import` 的等价操作：在归档页导入样本，重启服务后数据还在

## 5. 注意

- **不要**把本机 `app.db` 指望通过 Git 同步；需要迁移数据时，用 Railway 的 volume 备份/下载，或本地导出后上传。
- 海外节点访问国内可能偏慢；能接受即可。若以后要更快，再迁国内 VPS。
- OneBot Webhook 地址形如：`https://你的域名/api/webhooks/onebot`
