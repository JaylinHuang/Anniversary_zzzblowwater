## 1. 数据模型与配置

- [x] 1.1 增加名册元数据、Agent（QQ 主键）、用户 Drift、单聊 session/消息表结构
- [x] 1.2 归档消息支持 qq_number 字段；计票仅统计有效文本
- [x] 1.3 配置读取：BASELINE_SIZE / SOFT_CAP / SAMPLE_SIZE（默认 25/40/120，不写死业务常数）

## 2. 名册水位线

- [x] 2.1 实现首次建册：Top N + 冻结 threshold* + 永久保留
- [x] 2.2 实现增量扫描准入：count > threshold* 且未触软顶则新建（无手动授予）
- [x] 2.3 并列按 QQ 升序；昵称变更不双开 Agent

## 3. 人设与单聊

- [x] 3.1 Base 人设抽样生成（语料来自群归档，文案含群名「zzz吹水群」）
- [x] 3.2 每用户 Drift 更新；回复时 Base + Drift + 本会话上下文
- [x] 3.3 单聊 API：按 user 隔离；禁止写入 chat_messages

## 4. 前端与迁移

- [x] 4.1 重做 /agents 列表与 /agents/[id] 单聊页（移除多选同台）
- [x] 4.2 版主「首次建册 / 扫描准入 / 重炼 Base」；无手动授予入口
- [x] 4.3 更新 env 示例与站内群名相关文案；构建校验通过
