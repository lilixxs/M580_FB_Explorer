# M580_FB_Explorer

浏览器端的 Schneider M580 Control Expert 交换文件查看与编辑工具。

[English](README.en.md)

## 功能

- 导入 `.xdb`、`.xst` 和 `.xsy` 文件。
- 解析功能块元信息、变量和程序段。
- 按 `IN`、`OUT`、`IN_OUT`、`PUBLIC`、`PRIVATE` 和 `GLOBAL` 管理变量。
- 搜索、折叠、新增、修改、删除和调整变量顺序。
- 使用 Monaco Editor 编辑 ST 程序段。
- 提供 ST 搜索、替换、格式化、跳转、模板插入和自动完成。
- 提取函数、功能块实例和未知调用。
- 显示功能块引脚调用视图。
- 导出 `.xdb` 文件。
- 提供帮助抽屉和本地 MCP Bridge 接口桩。
- 提供基础类型、自定义类型和数组类型快速选择。
- 分列显示变量类型与地址，并固定当前变量分类标题。
- 提供两栏函数/功能块调用弹窗，并从 JSON 加载函数库和类型数据。
- 联动定位代码、变量引用、变量列表和功能块引脚。

保存并重新解析会清除当前程序段的「未保存」标记。顶栏「有修改」会保留到导出文件。

函数库位于 `src/data/functionLibraries/`。新增库和修改已有内容的方法见 [贡献指南](CONTRIBUTE.md#函数库与编辑器调用内容维护)。基础快照不代表完整官方手册。

## 界面

### 工作区

工作区将功能块信息、调用列表、引脚图、变量列表和 ST 编辑器放在同一页面。

![工作区](docs/images/workspace.png)

左侧显示文件信息、程序段调用和引脚视图。右侧显示变量表和程序段编辑器。分隔条支持拖动、双击复位和键盘调整。

### 变量编辑

变量编辑器提供名称、类型、地址、默认值、初值和注释字段。

![变量编辑](docs/images/variable-editor.png)

网页在保存前检查变量名、重复变量、分类和地址约束。网页不会覆盖用户原始文件。

点击「选择类型」可以选择基础类型、自定义类型和数组。

![类型选择](docs/images/type-picker.png)

### 插入调用

编辑器工具栏和右键菜单提供「函数/功能块调用」。弹窗支持函数库分组、搜索和实例选择。

![调用浏览器](docs/images/call-browser.png)

### 帮助与 MCP

帮助抽屉说明文件格式、编辑器操作、导出规则和 MCP Bridge 工具。

![帮助抽屉](docs/images/help.png)

MCP Bridge 只提供当前网页的本地调用接口。项目不默认连接远程服务。

## 快速开始

要求 Node.js `22.12` 或更高的受支持版本。

```powershell
npm ci
npm run dev
```

通过终端显示的 HTTP 地址打开网页。不要使用 `file://`。

## 检查和构建

```powershell
npm run typecheck
npm test
npm run build
npm run test:e2e
```

构建产物写入 `dist/`。部署时复制整个 `dist/` 目录。构建产物不依赖外部 CDN，并支持部署到子路径。

浏览器测试在 Windows 上默认使用 Microsoft Edge。其他平台可以先运行：

```powershell
npx playwright install chromium
```

## GitHub Pages

仓库中的 GitHub Actions 会在每次推送后执行类型检查、单元测试和生产构建。

所有检查通过后，工作流会把 `dist/` 发布到 GitHub Pages。

页面地址：<https://lilixxs.github.io/M580_FB_Explorer/>

## 截图

截图由内置演示功能块生成，不包含用户文件。

重新生成截图：

```powershell
npm run build
npm run docs:screenshots
```

## 数据和安全边界

- 网页在浏览器内解析文件。
- 网页不会上传导入文件。
- 网页不会连接 PLC。
- `.xdb` 示例快照位于 `fixtures/ModbusTCP_Client.xdb`。
- `dist/`、测试结果、编辑器配置、密钥、本地环境文件和 AI 工具本地文件不会提交。

## 已知边界

- Control Expert 导入和编译未执行。
- PLC 真机通信测试未执行。
- XML 结构校验不等于 Control Expert 导入通过。
- 从 `.xst` 或 `.xsy` 导出 `.xdb` 时，`GLOBAL` 变量会转为 `.xdb` 私有变量，并显示转换警告。

## 文档

- [贡献指南](CONTRIBUTE.md)
- [功能需求](docs/requirements.md)
- [内置帮助内容](src/data/helpContent.ts)

## 许可

当前仓库未声明开源许可证。除非仓库所有者另行授权，请不要将代码用于生产分发。
