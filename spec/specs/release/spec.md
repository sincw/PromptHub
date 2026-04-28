# Release Spec

## Purpose

本规范定义 PromptHub 发布流程、发布门禁与文档同步的稳定真相源。

## Stable Requirements

### 1. Release Sync

- 发布前必须同步版本、更新日志和必要的用户/贡献者文档。
- 内部架构或行为变化完成后，相关稳定 spec 和 architecture 文档也必须同步。

### 2. Release Verification

- 发布相关改动应通过对应的 lint、测试、构建与必要的 smoke gate。
- 不应依赖聊天上下文来记住发布前需要同步哪些文档或检查项。

### 3. Stable Internal Sources

- 历史发布准备与质量门禁演进记录保存在 `spec/changes/legacy/docs-08-todo/`。

### 4. Desktop Update Channels

- 桌面端必须默认使用稳定版更新通道。
- 只有在用户显式选择加入后，应用才可以检查或下载预览版 / prerelease 发布。
- 开启预览版前，界面必须明确提示不稳定风险与备份建议，并要求用户再次确认。

### 5. Stable vs Preview Version Semantics

- 稳定版必须使用纯 semver 版本号，例如 `0.5.5`。
- 预览版 / beta / alpha 必须使用 semver prerelease 版本号，例如 `0.5.6-beta.1`。
- 面向用户的“最新稳定版”下载链接、官网版本徽标和默认安装说明必须继续指向最新 stable，而不是被 prerelease 覆盖。

### 6. Historical Backfill Prerelease Exception

- 如果某条历史发布线因为早期策略问题需要补发一个 prerelease 版本，且其 semver 顺序低于已发布 stable（例如 `0.5.5-beta.1 < 0.5.5`），则必须在文档中明确标注它是手动下载 / 测试用途。
- 这类历史补发 prerelease 不应被描述成稳定版用户的正常自动升级目标。

## Stable Scenarios

### Scenario: Contributor prepares a release-impacting change

When a change affects release artifacts or public-facing version contracts:

- they update the relevant public docs under `docs/` or `README.md`
- they sync durable internal conclusions into `spec/`

### Scenario: Contributor adds a new release rule

When a new release gate or release-sync expectation becomes stable behavior:

- it should be reflected in this stable spec and, when appropriate, in contributor-facing docs

### Scenario: Desktop user enables preview updates

When a desktop user attempts to join the preview update channel:

- the app warns that preview builds can be unstable
- the app recommends creating a backup before updating
- the app keeps the stable channel unless the user explicitly confirms the change

### Scenario: Maintainer publishes a beta release

When a maintainer prepares a beta / preview desktop release:

- the release version uses a prerelease suffix such as `-beta.N`
- stable-facing docs keep pointing to the latest stable download links
- preview / beta docs can point to the explicit prerelease tag page or tag-specific artifacts

### Scenario: Maintainer republishes a historical prerelease below stable

When a maintainer republishes a historical prerelease that sorts below an already released stable version:

- the docs must explicitly say it is a historical beta / preview build
- the docs must recommend manual download for testing instead of presenting it as the default upgrade path
