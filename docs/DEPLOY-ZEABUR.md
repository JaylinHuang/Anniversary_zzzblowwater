# Zeabur 公网部署

与 Railway 同类：Docker + 持久卷。本站 SQLite / 上传目录在容器内路径为 **`/app/data`**，必须挂 Volume。

## 1. 准备

- 仓库：https://github.com/JaylinHuang/Anniversary_zzzblowwater
- 打开：https://zeabur.com （可用 GitHub 登录）

## 2. 网页部署步骤

1. Dashboard → **New Project**（可建在 Hong Kong / 其他较近区域，按控制台可选集群选）
2. **Deploy New Service** → **GitHub** → 授权并选择 `Anniversary_zzzblowwater`
3. 确认以根目录 **`Dockerfile`** 构建（仓库已有 `Dockerfile`；若误判成纯 Node，在服务设置里改为 Dockerfile / 指定 Dockerfile）
4. 打开服务 → **Variables（环境变量）**，至少设置：

| 变量 | 说明 |
|------|------|
| `SITE_PASSPHRASE` | 群口令（上线勿用默认示例） |
| `LLM_*` | 可选，Agent 需要 |

5. 打开 **Volumes** → **Mount Volumes**：
   - Volume ID：随便，如 `app-data`
   - **Mount Directory：`/app/data`**
6. 打开 **Networking / Domains** → 生成域名（或绑定自己的域名）
7. 触发一次 **Redeploy**（挂卷后建议重启，确保写到卷上）
8. 打开 `https://你的域名` → `/gate` 进站；**第一个建档用户为 admin**

> 注意：Zeabur 文档写明，**挂载 Volume 后该目录会被清空**。请先挂卷再导入群聊/运营数据，不要指望镜像里预置的 `data`。

## 3. 验收

- [ ] HTTPS 能打开口令页
- [ ] 注册后刷新仍保持登录
- [ ] 重启/重新部署后用户数据还在（证明卷生效）
- [ ] （可选）归档导入一条样本消息，再部署一次仍在

## 4. 群聊更新

管理员在归档页导入 JSON。进程开着时，每天北京时间 04:00 跟进新批次：重炼相关分身并重建向量。

## 5. 和 Railway 的差异（对本站）

| 项 | 说明 |
|----|------|
| 代码 | 同一套 `Dockerfile`，无需再改 |
| 卷路径 | 同样是 `/app/data` |
| 网络 | 国内访问通常比 Railway 更友好 |
| 挂卷副作用 | 无零停机滚动；挂载会清空该目录一次 |
