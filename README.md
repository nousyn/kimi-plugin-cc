# kimi-plugin-cc

一个 Claude Code 插件：让你在 Claude Code 会话里把代码审查和任务委托给本机的 [Kimi Code CLI](https://www.kimi.com/code)（`kimi`）。灵感来自 [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc)（它面向 Codex 做了同样的事）。

插件内置一个零依赖的伴随脚本（`kimi-companion.mjs`）：以非交互方式运行 `kimi`，把每次运行作为 job 落盘跟踪，事后提取最终答案。各个斜杠命令是对伴随脚本的封装，由 Claude 替你驱动。

## 环境要求

- **Kimi Code CLI** 已安装并登录（`kimi --version` 能正常运行；否则按官方文档安装后执行 `kimi login`）
- **Node.js 18.18+**（伴随脚本是纯 ESM，无任何依赖）
- Claude Code

## 安装

在 Claude Code 中执行：

```
/plugin marketplace add <本仓库路径或 git 地址>
/plugin install kimi-code@kimi-code
```

然后验证一切就绪：

```
/kimi-code:setup
```

## 命令一览

| 命令 | 作用 |
| --- | --- |
| `/kimi-code:setup` | 检查 `kimi --version` 和 `kimi doctor`，输出就绪报告 |
| `/kimi-code:review` | 对未提交的改动做只读审查（含未跟踪的新文件） |
| `/kimi-code:adversarial-review` | 只读的质疑式审查——挑战设计本身，而不是罗列 bug |
| `/kimi-code:rescue` | 把任务交给 kimi 执行（**可写**：可能修改文件） |
| `/kimi-code:status` | 列出本仓库的 job（id、命令、状态、pid、耗时） |
| `/kimi-code:result` | 输出已完成 job 的最终答案 |
| `/kimi-code:cancel` | 向运行中的 job 发送 SIGTERM |

### 审查未提交的改动

```
/kimi-code:review
```

审查整个分支相对 `main` 分叉点的全部改动：

```
/kimi-code:review --base main
```

后台运行，稍后取结果：

```
/kimi-code:review --background
/kimi-code:status
/kimi-code:result
```

针对具体疑点做质疑式审查，而非泛泛的全面审查：

```
/kimi-code:adversarial-review --base main 重点质疑重试逻辑及其失败模式
```

### 委托一个任务

```
/kimi-code:rescue --background 查清 websocket 重连测试为什么偶发失败并修掉它
```

`rescue` 是**可写**的：kimi 以 `-p` 模式运行，普通工具调用会被自动批准，因此它可以修改你仓库里的文件。在本仓库中继续上一次 rescue 会话：

```
/kimi-code:rescue --resume 应用你上次建议的第一个修复
```

（如果不存在历史会话，会自动转为全新任务并告知你。）

### 指定模型

`--model <别名>` 对 `review`、`adversarial-review`、`rescue` 均可用：

```
/kimi-code:review --model k2
```

## 工作原理

- 前台运行（`--wait`，脚本层默认）实时透传 kimi 的 stdout/stderr，同时分别写入该 job 的 `output.jsonl` 和 `stderr.log`（stderr 里带有会话续接提示，`--resume` 靠它工作）。
- review / adversarial-review 命令在未显式给 `--wait`/`--background` 时，会先用 `git diff --shortstat` 估算审查规模并询问一次：仅 1–2 个文件的小审查推荐前台等待，其余推荐后台（前台会阻塞对话直到审查结束）。估算失败或无法询问时默认后台。
- review、adversarial-review、cancel、result、status 标记了 `disable-model-invocation`：只能由你手动敲斜杠命令触发，Claude 不会自行发起审查消耗额度（rescue 除外——它保留给主会话主动委派）。
- 后台运行（`--background`）以 `--output-format stream-json` 拉起一个 detached 的 kimi 进程（独立进程组，`cancel` 按组终止），登记 job 后立即返回 job id。
- 状态存放在 `<你的仓库>/.kimi-plugin/`（`jobs.json` + `jobs/<id>/output.jsonl`）。不想提交的话把它加进你的 `.gitignore`。
- `result` 对 stream-json 做防御式解析（逐行解析、跳过畸形行、取最后一条 assistant 文本），失败时回退为原始输出。
- `status` 会对账真实状态：pid 已不存在的 "running" job 会被标记为已完成。
- 审查目标由 kimi 自己在仓库里收集：它运行 `git status`（因此未跟踪的新文件也在审查范围内）和 `git diff`，并可继续阅读周边代码获取上下文。脚本只在完全无改动时提前退出，避免空审查白白消耗额度。
- 由于 `kimi -p` 会自动批准普通工具调用，审查的只读约束是在 **prompt 层面**强制的——审查 prompt 明确禁止修改任何文件。

另外还有一个 `kimi-rescue` 子代理供主会话委派：它把任务转发给伴随脚本的 `rescue` 命令，等待或轮询结果后汇报回来。

## 与 codex-plugin-cc 的差异

- **没有 `transfer` 命令**——Kimi Code 没有能导入 Claude Code 会话记录的会话导入器。
- **没有每次运行的 effort 选项**——kimi 的思考强度只能在 `config.toml` 的 `[thinking].effort` 全局配置（k3 系列支持 `low`/`high`/`max`），没有单次运行的 CLI flag，因此插件只暴露 `--model`。
- **只读审查靠 prompt 约束**——`kimi -p` 以 auto 权限运行且没有独立的沙箱开关，因此由审查 prompt 禁止编辑，而非依赖 CLI 层面的沙箱。
- **结构化审查输出同样靠 prompt 约束**——codex 使用 `--output-schema`；kimi 没有对应参数，所以审查 prompt 要求回复末尾附带一个符合 `schemas/review-output.schema.json` 的 ```json 代码块，`result` 解析成功时按结构渲染（失败则回退为原始回答）。
- **更简单的运行时**——没有 app-server 或长连接协议；每个命令都是一次性结束的 `kimi -p` 进程。

## 开发

```
npm test
```

运行参数解析、job 存储、stream-json 结果提取等的单元测试（node:test，零依赖）。

发布新版本时同步所有 manifest 的版本号（`plugin.json`、`marketplace.json` 的 `metadata.version` 和 `plugins[kimi-code].version`）：

```
node scripts/bump-version.mjs 0.2.0     # 写入
node scripts/bump-version.mjs --check   # 校验三处一致（可挂 CI）
```
