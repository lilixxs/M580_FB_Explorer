# 贡献指南

[English](CONTRIBUTING.en.md) | [使用说明](README.md)

## 开发环境

- 使用 Node.js 22.12 或更高的受支持版本。
- 使用 npm 安装依赖。
- Windows 浏览器测试使用 Microsoft Edge。
- 其他平台先运行 `npx playwright install chromium`。

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
node scripts/check-localized-docs.mjs
git diff --check
git status --short
```

文档校验需要最新的 `dist/`。`npm run test:e2e` 会先重新构建。

分别报告类型检查、单元测试、浏览器测试、构建和文档校验的结果。Control Expert 导入、编译和 PLC 真机通信测试未执行。

## 文档更新规则

### 唯一正文来源

界面帮助直接加载根目录的 README。不要在组件或其他目录维护帮助正文副本。

| 语言 | 正文文件 | 截图目录 |
| --- | --- | --- |
| 简体中文 | `README.md` | `docs/images/zh-CN/` |
| 英文 | `README.en.md` | `docs/images/en/` |
| 繁体中文 | `README.zh-TW.md` | `docs/images/zh-TW/` |
| 日文 | `README.ja.md` | `docs/images/ja/` |
| 韩文 | `README.ko.md` | `docs/images/ko/` |

`src/data/helpContent.ts` 只负责加载正文。`vite.config.ts` 按原名复制 README 和贡献指南，并保留截图相对路径。

### 功能变更

1. 更新 `docs/requirements.md` 中的需求和边界。
2. 同步更新五语 README。保留相同的功能范围、操作步骤和限制。
3. 更新 `src/locales/*.json` 中受影响的界面文案。保留全部键和命名占位符。
4. 检查 README 引用的截图。界面变化影响截图时，重新生成五语截图。
5. 修改开发流程或维护方法时，同步更新 `CONTRIBUTING.md` 和 `CONTRIBUTING.en.md`。
6. 运行提交前检查。

贡献指南只维护简体中文和英文。根目录的 `CONTRIBUTING.md` 使用 GitHub 识别的贡献指南文件名。

### 链接与截图

- 五语 README 顶部必须提供全部五种语言的相对链接。
- 简体中文链接使用 `README.md`。其他语言使用表中的文件名。
- 不要把语言链接写成 GitHub 绝对地址、`dist/` 路径或 `HELP.*.md`。
- GitHub 点击语言链接后打开对应 README。界面帮助点击后切换界面语言和正文。
- 每篇 README 只引用本语言的五张截图：`workspace.png`、`new-block.png`、`variable-editor.png`、`type-picker.png`、`call-browser.png`。
- 图片链接使用 `docs/images/<语言>/<文件名>.png`。不要使用旧的 `images/` 前缀。
- 贡献指南链接使用 `CONTRIBUTING.md` 或 `CONTRIBUTING.en.md`。不要再引用 `CONTRIBUTE.md`。
- 文档使用主动语态。一句描述一个动作。技术术语保持一致。不要把未验证结果写成已通过。

截图只使用内置示例。按以下顺序更新截图和构建产物：

```powershell
npm run build
npm run docs:screenshots
npm run build
node scripts/check-localized-docs.mjs
```

文档校验检查五语导航和按钮名称。校验器按语言文件检查 README 中的关键按钮原文。校验器检查同语言截图、25 张截图的构建副本，以及 README 和贡献指南的构建副本。

## 代码规则

- 使用 TypeScript 和 Vue 3 Composition API。
- 保持类型检查通过。
- 保持现有直角界面规范。
- 为用户可见行为补充测试。
- 不翻译用户源码、变量名、注释或 XML 格式值。
- 不将真实 PLC 地址、密钥或用户文件加入测试夹具。
- 不直接修改生成的 Control Expert 文件作为项目真源。
- 保留未执行 Control Expert 和真机测试的说明。

## 函数库与编辑器调用内容维护

### 数据边界

函数库位于 `src/data/functionLibraries/`。加载器位于 `src/core/functionLibrary.ts`。编辑器和调用弹窗共享 JSON 条目。修改 JSON 后必须重新构建。网页不从网络下载函数库。

`base.json` 保存旧补全项快照，不代表完整官方基础库。通信函数不属于 Standard Block Library。

- `src/data/reference/standard-catalogue.json` 保存官方目录。通配名称不是可插入函数。
- `standard.json` 保存已核实的常用具体函数。
- `types.json` 的 `definitions` 保存类型说明、核实状态和来源页码。部分旧 `variablePresets` 未核实。

标准库来源为 [33002519.20，09/2020](https://www.se.com/us/en/download/document/33002519K01000/)。该手册适用于 Control Expert 15.0 及以上。类型来源为 [35006144.27](https://www.se.com/us/en/download/document/35006144K01000/)。这些资料不构成 Unity Pro V13.1 兼容性验证。

### 修改已有条目

1. 修改对应 JSON 的 `entries`。修改旧补全项时，同步更新 `base.json` 和 `src/core/st.ts` 的 `ST_FUNCTION_COMPLETIONS`。
2. 为条目设置同一库内唯一的 `label`。
3. 将 `kind` 设置为 `ef`、`efb` 或 `function`。
4. 在 `detail` 中说明签名和调用约束。
5. 在 `insertText` 中保留 Monaco snippet 占位符格式。
6. 改变调用分类时，检查 `BUILTIN_FUNCTIONS`、`isBuiltinFunction` 和 `refreshCalls`。
7. 改变类型转换识别时，检查 `CONVERSION_TYPE_NAMES` 和 `extractRawCalls`。
8. 不要把普通函数名加入 `ST_KEYWORDS`。解析器识别官方运算符函数形式，例如 `AND(a, b)`。
9. 更新 `tests/st.test.ts`、`tests/help.test.ts` 和相关浏览器测试。

以源码中的集合为名称清单真源。不要在贡献指南中复制完整清单。

### 新增外部函数库

把 JSON 文件加入 `src/data/functionLibraries/`。该目录只保存函数清单和固定的 `types.json`。其他资料放入 `src/data/reference/`。

```json
{
  "name": "自定义库",
  "version": "1.0.0",
  "note": "填写手册文档号、版本、章节和已核实范围",
  "entries": [
    {
      "label": "EXAMPLE",
      "kind": "ef",
      "group": "other",
      "detail": "EXAMPLE(IN : INT) : INT",
      "insertText": "EXAMPLE(${1:value})",
      "source": "填写官方文档 URL"
    }
  ]
}
```

- `name` 标识库。`version` 标识版本。`entries` 保存条目。
- `group` 使用 `LIBRARY_GROUPS` 中的分组。需要新增分组时，同步更新映射。
- `source` 记录官方 URL。`note` 说明来源、范围和限制。
- EFB 的 `parameters` 保存输入形参名。`outputs` 保存输出名。
- 外部条目不得覆盖基础库同名条目。
- 模板只支持普通文本、`$1`、`${1}` 和 `${1:默认值}`。不要使用嵌套或 choice 占位符。
- 非法打包条目会触发模块校验错误。
- EFB 补全保留类型名。调用弹窗必须使用已声明实例，或明确创建实例后再插入。
- 不要在 JSON 中包含真实 PLC 地址、密钥或用户文件内容。

新增库后，更新补全、调用弹窗和调用解析测试。按文档更新规则同步需求和五语 README，再运行全部检查。

### 修改变量类型

- 预设修改 `types.json` 的 `variablePresets`。说明平台支持限制。
- 转换识别修改 `conversionTypes`。`src/core/st.ts` 引用该集合。
- 32 位地址规则检查 `src/types.ts` 的 `WIDE_TYPES`。
- 数组解析检查 `src/core/validation.ts` 的 `baseTypeName`、`validateTypeName` 和 `isWideType`。
- 类型选择界面修改 `src/components/VariableDialog.vue`。
- 不要用基础类型白名单拒绝自定义类型。
- 数组必须保留 `ARRAY[下界..上界] OF 类型` 结构。

修改后补充合法类型、数组、非法类型和地址约束测试。

## Git 规则

- 不提交 `node_modules/`、`dist/`、测试结果、缓存、密钥或 AI 工具本地文件。
- 使用清晰的提交消息，例如 `docs: unify localized README and help`。
- 一个提交只处理一个主题。

## 报告问题

问题报告必须包含：

1. Node.js 和浏览器版本。
2. 复现步骤。
3. 期望结果。
4. 实际结果。
5. 控制台错误或失败测试名称。
6. 不含敏感信息的最小示例文件。
