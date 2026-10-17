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

## 函数库与编辑器调用内容维护

### 当前基础库

原有补全项位于 `src/core/st.ts`。本轮把这些条目保存为 `src/data/functionLibraries/base.json` 快照。该快照不是完整官方基础库。通信函数不属于 Standard Block Library。

函数库加载器位于 `src/core/functionLibrary.ts`。变量类型数据位于 `src/data/functionLibraries/types.json`。调用弹窗与编辑器共享 JSON 条目。

官方库数据分开保存：

- `src/data/reference/standard-catalogue.json`：Standard Block Library 的目录。目录中的通配名称不是可插入函数。
- `src/data/functionLibraries/standard.json`：已从正文核实的常用具体函数。
- `types.json` 的 `definitions`：基本类型说明、核实状态和来源页码。`variablePresets` 保留部分未核实的旧预设。

标准库来源为 [33002519.20，09/2020](https://www.se.com/us/en/download/document/33002519K01000/)。该手册声明适用于 Control Expert 15.0 及以上。类型来源为 [35006144.27](https://www.se.com/us/en/download/document/35006144K01000/)。这些资料不构成 Unity Pro V13.1 的兼容性验证。

- `ST_KEYWORDS`：ST 关键字列表。
- `ST_FUNCTION_COMPLETIONS`：编辑器补全和调用插入项。
- `BUILTIN_FUNCTIONS`：调用解析使用的内置名称集合。
- `CONVERSION_TYPE_NAMES`：类型转换名称识别使用的基础类型集合。

当前 `ST_FUNCTION_COMPLETIONS` 包含以下内容：

- EF：`ADDMX`、`READ_VAR`、`WRITE_VAR`。
- 函数：`LEN_INT`、`LEFT_INT`、`RIGHT_INT`、`CONCAT_STR`、`INT_TO_STRING`、`INT_TO_REAL`、`REAL_TO_INT`、`STRING_TO_INT`。
- EFB：`TON`、`TOF`、`TP`、`R_TRIG`、`F_TRIG`、`SR`、`RS`、`CTU`、`CTD`、`CTUD`。

当前 `BUILTIN_FUNCTIONS` 包含以下名称：

`ABS`、`MIN`、`MAX`、`LIMIT`、`SQRT`、`EXP`、`LN`、`LOG`、`SIN`、`COS`、`TAN`、`ASIN`、`ACOS`、`ATAN`、`ROUND`、`TRUNC`、`INC`、`DEC`、`SHL`、`SHR`、`ROL`、`ROR`、`SWAP`、`LEN_INT`、`LEN_STR`、`CONCAT_STR`、`LEFT_INT`、`RIGHT_INT`、`FIND_INT`、`MID_INT`、`LENGTH_ARINT`、`SIZEOF`、`EXTRACT`、`ADR`、`ADR0`、`ADDMX`、`READ_VAR`、`WRITE_VAR`、`GET_CURRENT_TIME`、`WRTC_DT`、`IS_PAR_CON`、`TON`、`TOF`、`TP`、`R_TRIG`、`F_TRIG`、`SR`、`RS`、`CTU`、`CTD`、`CTUD`。

当前 `CONVERSION_TYPE_NAMES` 包含以下类型：

`BOOL`、`BYTE`、`SINT`、`USINT`、`INT`、`UINT`、`DINT`、`UDINT`、`LINT`、`ULINT`、`WORD`、`DWORD`、`REAL`、`LREAL`、`TIME`、`DATE`、`TOD`、`TIME_OF_DAY`、`DT`、`DATE_AND_TIME`、`STRING`、`CHAR`、`WCHAR`、`ANY`。

### 修改既有基础库

1. 修改对应 JSON 的 `entries` 条目。修改旧补全项时，同步更新 `base.json` 和 `src/core/st.ts` 的 `ST_FUNCTION_COMPLETIONS`。
2. 设置唯一的 `label`。
3. 设置正确的 `kind`：`ef`、`efb` 或 `function`。
4. 更新 `detail`，说明签名和调用约束。
5. 更新 `insertText`，保持 Monaco snippet 占位符格式。
6. 需要改变调用分类时，同时检查 `BUILTIN_FUNCTIONS`、`isBuiltinFunction` 和 `refreshCalls`。
7. 需要改变类型转换识别时，同时检查 `CONVERSION_TYPE_NAMES` 和 `extractRawCalls`。
8. 不要把普通函数名加入 `ST_KEYWORDS`。解析器排除控制关键字，但识别官方运算符函数形式，例如 `AND(a, b)`。
9. 修改后更新 `tests/st.test.ts`、`tests/help.test.ts` 和相关 E2E 测试。

### 新增外部函数库

外部函数库统一放在 `src/data/functionLibraries/`。加载器会在构建时读取该目录中的 JSON。新增文件后必须重新构建。网页不从网络下载函数库。

每个 JSON 文件至少包含以下字段：

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

- `name` 标识库名称。
- `version` 标识库版本。
- `entries` 保存函数和功能块条目。
- `group` 标识手册中的功能组。可用组见 `LIBRARY_GROUPS`。
- `source` 记录官方文档 URL。`note` 说明提取范围和限制。
- EFB 的 `parameters` 数组记录输入形参名。`outputs` 数组记录输出名。调用弹窗从这些字段生成实例调用和输出提示。
- 每个条目的 `label` 在同一库内必须唯一。
- 外部库条目不得覆盖基础库同名条目。
- `kind` 只能使用 `ef`、`efb` 或 `function`。
- `insertText` 必须使用可直接插入 ST 编辑器的文本。
- 模板只允许普通文本、`$1`、`${1}` 和 `${1:默认值}`。不得使用嵌套占位符或 choice 占位符。
- 此目录只允许函数清单和固定的 `types.json`。其他资料放在 `src/data/reference/`。
- 打包函数清单含非法条目时，模块校验会报错。合并前必须运行测试。
- EFB 补全项保留类型名。调用弹窗必须使用已声明实例，或显式创建实例后再插入调用。
- 外部 JSON 不得包含真实 PLC 地址、密钥或用户文件内容。

新增外部库后，必须完成以下修改：

1. 添加 JSON 文件。
2. 使用现有 `LIBRARY_GROUPS` 分组。需要新分组时，更新该映射。
3. 更新编辑器补全、调用弹窗和调用解析测试。
4. 更新 `docs/requirements.md`、`src/data/helpContent.ts`、`README.md` 和 `README.en.md`。
5. 运行全部检查命令。

### 修改变量类型

- 类型弹窗预设：修改 `types.json` 的 `variablePresets`。平台支持范围不同的类型必须注明限制。
- 基础类型转换识别：修改 `types.json` 的 `conversionTypes`。`src/core/st.ts` 引用该集合。
- 32 位地址约束：检查 `src/types.ts` 的 `WIDE_TYPES`。
- 数组类型解析：检查 `src/core/validation.ts` 的 `baseTypeName`、`validateTypeName` 和 `isWideType`。
- 变量编辑入口：修改 `src/components/VariableDialog.vue` 的类型选择和自定义类型输入。
- 自定义类型不应被基础类型白名单拒绝。
- 数组类型必须保留 `ARRAY[下界..上界] OF 类型` 结构。

修改类型规则后，必须补充合法类型、数组类型、非法类型和地址约束测试。

### 文档和验证

用户可见功能必须同步更新以下文件：

- `docs/requirements.md`：更新需求和边界。
- `src/data/helpContent.ts`：更新网页帮助。
- `README.md` 和 `README.en.md`：更新使用说明。
- `CONTRIBUTE.md`：仅在开发流程或维护方法变化时更新。

按以下顺序验证：

```powershell
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Control Expert 导入和编译未执行。PLC 真机通信测试未执行。

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

## Function library and editor call maintenance

### Current base library

The legacy completions are in `src/core/st.ts`. `src/data/functionLibraries/base.json` preserves those items as a snapshot, not a complete official library. Communication functions are not part of the Standard Block Library.

The loader is in `src/core/functionLibrary.ts`. Type data is in `src/data/functionLibraries/types.json`. The call dialog and editor share the JSON entries.

Official reference data is stored separately:

- `src/data/reference/standard-catalogue.json` contains the Standard Block Library contents. Wildcard names are not insertable calls.
- `src/data/functionLibraries/standard.json` contains common concrete functions verified against the manual body.
- `definitions` in `types.json` records type descriptions, verification status, and source pages. Some legacy presets remain unverified.

The standard library source is [33002519.20, September 2020](https://www.se.com/us/en/download/document/33002519K01000/), which states Control Expert 15.0 or later. The type source is [35006144.27](https://www.se.com/us/en/download/document/35006144K01000/). These references do not verify Unity Pro V13.1 compatibility.

- `ST_KEYWORDS` contains ST keywords.
- `ST_FUNCTION_COMPLETIONS` provides editor completion and insertion items.
- `BUILTIN_FUNCTIONS` provides names for call analysis.
- `CONVERSION_TYPE_NAMES` provides elementary names for conversion recognition.

The current `ST_FUNCTION_COMPLETIONS` entries are:

- EF: `ADDMX`, `READ_VAR`, `WRITE_VAR`.
- Functions: `LEN_INT`, `LEFT_INT`, `RIGHT_INT`, `CONCAT_STR`, `INT_TO_STRING`, `INT_TO_REAL`, `REAL_TO_INT`, `STRING_TO_INT`.
- EFB: `TON`, `TOF`, `TP`, `R_TRIG`, `F_TRIG`, `SR`, `RS`, `CTU`, `CTD`, `CTUD`.

The current `BUILTIN_FUNCTIONS` names are:

`ABS`, `MIN`, `MAX`, `LIMIT`, `SQRT`, `EXP`, `LN`, `LOG`, `SIN`, `COS`, `TAN`, `ASIN`, `ACOS`, `ATAN`, `ROUND`, `TRUNC`, `INC`, `DEC`, `SHL`, `SHR`, `ROL`, `ROR`, `SWAP`, `LEN_INT`, `LEN_STR`, `CONCAT_STR`, `LEFT_INT`, `RIGHT_INT`, `FIND_INT`, `MID_INT`, `LENGTH_ARINT`, `SIZEOF`, `EXTRACT`, `ADR`, `ADR0`, `ADDMX`, `READ_VAR`, `WRITE_VAR`, `GET_CURRENT_TIME`, `WRTC_DT`, `IS_PAR_CON`, `TON`, `TOF`, `TP`, `R_TRIG`, `F_TRIG`, `SR`, `RS`, `CTU`, `CTD`, `CTUD`.

The current `CONVERSION_TYPE_NAMES` are:

`BOOL`, `BYTE`, `SINT`, `USINT`, `INT`, `UINT`, `DINT`, `UDINT`, `LINT`, `ULINT`, `WORD`, `DWORD`, `REAL`, `LREAL`, `TIME`, `DATE`, `TOD`, `TIME_OF_DAY`, `DT`, `DATE_AND_TIME`, `STRING`, `CHAR`, `WCHAR`, `ANY`.

### Modify the existing base library

1. Modify the relevant JSON `entries`. For legacy items, also update `base.json` and `ST_FUNCTION_COMPLETIONS` in `src/core/st.ts`.
2. Set a unique `label`.
3. Set the correct `kind`: `ef`, `efb`, or `function`.
4. Update `detail` with the signature and call rules.
5. Update `insertText` and keep Monaco snippet placeholders.
6. If call classification changes, check `BUILTIN_FUNCTIONS`, `isBuiltinFunction`, and `refreshCalls`.
7. If conversion recognition changes, check `CONVERSION_TYPE_NAMES` and `extractRawCalls`.
8. Do not add ordinary function names to `ST_KEYWORDS`. The parser excludes control keywords but recognizes official operator call forms such as `AND(a, b)`.
9. Update `tests/st.test.ts`, `tests/help.test.ts`, and related E2E tests.

### Add an external function library

Put external libraries in `src/data/functionLibraries/`. The loader reads the JSON files at build time. Rebuild after adding files. The application does not download libraries from the network.

Each JSON file must contain at least these fields:

```json
{
  "name": "Custom library",
  "version": "1.0.0",
  "note": "Record the manual ID, edition, chapter, and verified scope",
  "entries": [
    {
      "label": "EXAMPLE",
      "kind": "ef",
      "group": "other",
      "detail": "EXAMPLE(IN : INT) : INT",
      "insertText": "EXAMPLE(${1:value})",
      "source": "Record the official document URL"
    }
  ]
}
```

- `name` identifies the library.
- `version` identifies the library version.
- `entries` stores functions and function blocks.
- `group` identifies the manual function group. See `LIBRARY_GROUPS` for supported groups.
- `source` records the official document URL. `note` records scope and limitations.
- For EFBs, `parameters` lists input pin names and `outputs` lists output names. The dialog uses these fields to build instance calls and output hints.
- Each `label` must be unique in one library.
- An external item must not replace a base-library item with the same name.
- `kind` must be `ef`, `efb`, or `function`.
- `insertText` must be valid text for the ST editor.
- Templates support plain text, `$1`, `${1}`, and `${1:default}` only. Do not use nested or choice placeholders.
- This directory accepts function manifests and the fixed `types.json` only. Store other references in `src/data/reference/`.
- Invalid bundled entries cause a module validation error. Run tests before merging.
- EFB completions retain the type name. The call dialog must use a declared instance or explicitly create an instance before inserting a call.
- External JSON must not contain real PLC addresses, secrets, or user-file content.

After adding an external library:

1. Add the JSON file.
2. Use an existing `LIBRARY_GROUPS` group. Update the mapping only when a new group is required.
3. Update editor completion, the call dialog, and call-analysis tests.
4. Update `docs/requirements.md`, `src/data/helpContent.ts`, `README.md`, and `README.en.md`.
5. Run all checks.

### Modify variable types

- Type picker presets: update `variablePresets` in `types.json`. Record platform limitations for types with different support.
- Conversion recognition: update `conversionTypes` in `types.json`. `src/core/st.ts` uses that set.
- 32-bit address rules: check `WIDE_TYPES` in `src/types.ts`.
- Array parsing: check `baseTypeName`, `validateTypeName`, and `isWideType` in `src/core/validation.ts`.
- Variable editing: update type selection and custom type input in `src/components/VariableDialog.vue`.
- Custom types must not be rejected by the elementary-type list.
- Array types must keep the `ARRAY[lower..upper] OF type` structure.

After changing type rules, add tests for valid types, arrays, invalid types, and address rules.

### Documentation and validation

Update these files for user-visible features:

- `docs/requirements.md` for requirements and boundaries.
- `src/data/helpContent.ts` for in-app help.
- `README.md` and `README.en.md` for usage instructions.
- `CONTRIBUTE.md` only when the development process or maintenance method changes.

Run these checks in order:

```powershell
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Control Expert import and compilation are not executed. Real PLC communication tests are not executed.

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
