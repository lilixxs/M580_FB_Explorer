# 贡献指南

[English](#contributing)

## 开发环境

- Node.js `22.12` 或更高的受支持版本。
- npm。
- Windows 浏览器测试使用 Microsoft Edge。
- 其他平台使用 Playwright Chromium。

## 开始开发

```powershell
npm ci
npm run dev
```

源码位于 `src/`。单元测试位于 `tests/`。浏览器测试位于 `e2e/`。

## 提交前检查

按以下顺序运行命令：

```powershell
npm run typecheck
npm test
npm run build
npm run test:e2e
```

如果修改了界面，重新生成截图：

```powershell
npm run docs:screenshots
```

如果修改了功能，必须同步更新：

- `README.md`
- `README.en.md`
- `CONTRIBUTE.md`（仅当开发流程改变）
- `docs/requirements.md`
- `src/data/helpContent.ts`

## 代码规则

- 使用 TypeScript 和 Vue 3 Composition API。
- 保持 `npm run typecheck` 通过。
- 保持现有无圆角界面规范。
- 为用户可见功能添加测试。
- 不将真实 PLC 地址、密钥或用户文件加入测试夹具。
- 不直接修改生成的 Control Expert 文件作为项目真源。
- 保留“未执行 Control Expert 和真机测试”的边界说明。

## Git 规则

- 提交前检查 `git diff --check`。
- 提交前检查 `git status --short`。
- 不提交 `node_modules/`、`dist/`、测试结果、缓存、密钥或 AI 工具本地文件。
- 使用清晰的提交消息，例如 `feat: add variable search`。
- 一个提交只处理一个主题。

## 报告问题

问题报告应包含：

1. 使用的 Node.js 和浏览器版本。
2. 复现步骤。
3. 期望结果。
4. 实际结果。
5. 控制台错误或失败测试名称。
6. 不含敏感信息的最小示例文件。

<a id="contributing"></a>

# Contributing

[简体中文](CONTRIBUTE.md)

## Development environment

- Node.js `22.12` or a later supported version.
- npm.
- Microsoft Edge for browser tests on Windows.
- Playwright Chromium on other platforms.

## Start development

```powershell
npm ci
npm run dev
```

Application source is in `src/`. Unit tests are in `tests/`. Browser tests are in `e2e/`.

## Checks before a commit

Run these commands in order:

```powershell
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Regenerate screenshots after a UI change:

```powershell
npm run docs:screenshots
```

Update these files when a feature changes:

- `README.md`
- `README.en.md`
- `CONTRIBUTE.md` when the development process changes
- `docs/requirements.md`
- `src/data/helpContent.ts`

## Code rules

- Use TypeScript and the Vue 3 Composition API.
- Keep `npm run typecheck` passing.
- Keep the existing square-corner interface style.
- Add tests for user-visible behavior.
- Do not add real PLC addresses, secrets, or user files to fixtures.
- Do not edit generated Control Expert files as the project source of truth.
- Keep the boundary statement that Control Expert and real PLC tests were not executed.

## Git rules

- Run `git diff --check` before a commit.
- Run `git status --short` before a commit.
- Do not commit `node_modules/`, `dist/`, test results, caches, keys, or local AI-tool files.
- Use clear commit messages such as `feat: add variable search`.
- Keep one topic per commit.

## Report an issue

Include the following information:

1. Node.js and browser versions.
2. Reproduction steps.
3. Expected result.
4. Actual result.
5. Console errors or failed test names.
6. A minimal example file without sensitive information.
