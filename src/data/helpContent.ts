/** Update this help and docs/requirements.md with each feature change. */
export const HELP_MARKDOWN = `# M580_FB_Explorer 使用帮助

网页在浏览器中解析 Control Expert 交换文件。网页不会上传导入文件。网页不会连接 PLC。

## 1. 导入文件

点击「导入文件」选择 .xdb、.xst 或 .xsy 文件。也可以把文件拖到窗口中。

点击示例按钮可以载入内置示例。左上面板显示文件信息和程序段。点击程序段后，右下编辑器显示对应内容。

每次只编辑一个文档。重新导入会替换当前文档。请先导出修改后的文件。

导入成功后，网页会清空搜索词和折叠状态。左上面板提供导入、导出和解析警告入口。

网页支持单个 FBSource 的 .xdb 文件、程序段 .xst 文件和变量表 .xsy 文件。多功能块作用域暂不合并。对于无法安全处理的结构，网页会拒绝导入并显示原因。

非 ST 程序段显示只读 XML 原文。网页不把图形语言转换为 ST。

## 2. 布局与引脚视图

左右分栏默认占 34% 和 66%。右上变量列表默认占高度的 1/3。右下程序段编辑器默认占高度的 2/3。

左栏依次显示元信息、调用列表和引脚调用视图。拖动分隔条可以调整各面板尺寸。双击分隔条可以复位。聚焦分隔条后，可以按方向键微调尺寸。

网页在窄屏幕上改为垂直排列。面板内部的表格支持横向滚动。浏览器允许本地存储时，网页会记录面板尺寸。

引脚视图显示 IN、OUT 和 IN_OUT。IN_OUT 使用虚线标识。PRIVATE、PUBLIC 和 GLOBAL 不绘制为引脚。EN 和 ENO 仅作为系统引脚示意。点击引脚可以定位右上变量。

使用引脚面板的加减按钮可以缩放视图。点击引脚时，网页会清空变量搜索词并展开对应分组。

## 3. 变量管理

变量按 IN、OUT、IN_OUT、PUBLIC、PRIVATE 和 GLOBAL 分组。GLOBAL 对应 dataBlock 全局变量。

在搜索框输入变量名、类型、地址、初值或注释。搜索时自动展开匹配分组。点击分组标题可以折叠分组。

点击「新增」创建变量。点击「改」修改变量。点击「删」后确认删除。点击上下箭头调整同类变量顺序。引脚序号 PositionPin 会按顺序重新计算。

变量名必须以英文字母或下划线开头。其余字符只允许英文字母、数字和下划线。变量名不得在忽略大小写后重复。EN 和 ENO 不能新增为普通引脚。

32 位类型绑定 %MW 时必须使用偶数地址。网页不会擅自改变地址。请在变量对话框中修改错误地址。

## 4. ST 调用解析

左中列表显示函数和功能块调用。列表保留未知调用，不把未知名称视为系统函数。解析器忽略字符串和注释中的伪调用。

点击调用项后，编辑器跳转到对应行列。点击「刷新解析」重新解析代码。保存程序段也会刷新调用列表。

调用解析不等于语法编译。网页不会检查所有函数签名，也不会执行 ST 代码。

## 5. 编辑器操作

| 操作 | 入口 |
| --- | --- |
| 查找 | Ctrl+F、工具栏、右键菜单 |
| 替换 | Ctrl+H、工具栏、右键菜单 |
| 行列跳转 | Ctrl+G 或行:列输入框 |
| 格式化 | Shift+Alt+F、工具栏、右键菜单 |
| 插入 IF / FOR / WHILE | 工具栏、右键菜单 |
| 保存并解析 | Ctrl+S 或保存按钮 |
| 自动完成 | 输入时提示或 Ctrl+空格 |

自动完成包含关键字、当前变量、常用函数和语句模板。格式化器只整理已支持的 ST 结构，不替代完整的 IEC 61131-3 编译器。

编辑器保存只写入页面内存。保存不会修改磁盘上的原始文件。请点击「导出 .xdb」下载修改后的文件。

Monaco 加载失败时，网页会显示错误并切换到文本框。文本框不提供语法高亮和自动完成。

## 6. 导出规则

导出器按仓库 AGENTS.md 第 4 节生成 XML。

- STSource 只允许可执行语句。检测到 VAR 声明区时，网页拒绝导出。请把变量放入变量表。
- 输入、输出和双向参数分别写入对应容器。PositionPin 从 1 递增。
- 功能块初值写入 variableInit。全局变量初值读取 defaultValue。
- 空 topologicalAddress 和空 comment 会省略。
- 导出器展开自闭合标签。
- 32 位 %MW 变量必须绑定偶数地址。校验失败时拒绝导出。
- .xdb 写回时保留未编辑的扩展节点和属性。

从 .xst 或 .xsy 导出 .xdb 属于结构转换。GLOBAL 变量会转为 PRIVATE。网页会显示转换警告。程序段的任务上下文不会变成 PLC 任务。请检查转换结果。

导出包含警告时，网页会在「导出说明」抽屉显示警告全文。

Control Expert 导入、编译和真机通信测试均未执行。

## 7. MCP 预留接口

网页提供 window.__M580_MCP_BRIDGE__。Bridge 提供 listTools()、callTool(name, input) 和 getState()。

这是本页内的工具接口，不是独立的 MCP Server。网页不会默认连接远程服务。传输适配器只提供接入边界。

| 工具 | 用途 |
| --- | --- |
| m580_fb_get_metadata | 读取文档摘要 |
| m580_fb_list_variables | 按 category 和 search 查询变量 |
| m580_fb_upsert_variable | 按 id 修改变量，或新增变量 |
| m580_fb_delete_variable | 按 id 删除变量 |
| m580_fb_get_source | 按 sectionId 读取代码 |
| m580_fb_set_source | 写入 source 并解析调用 |
| m580_fb_insert_snippet | 在 line、column 插入 source 或 kind 模板 |
| m580_fb_analyze_calls | 重新提取调用 |

保留以下兼容工具：m580_get_state、m580_import、m580_list_variables、m580_upsert_variable、m580_delete_variable、m580_get_section、m580_set_section_source、m580_save_section、m580_format_section、m580_replace_in_section、m580_extract_calls、m580_export_xdb、m580_get_help、m580_jump。

查看 listTools() 返回的 inputSchema 获取各工具的字段和必填参数。callTool() 返回 ok、result 或 error。

示例：

\`\`\`js
await window.__M580_MCP_BRIDGE__.callTool('m580_fb_list_variables', { category: 'IN' })
\`\`\`

## 8. 部署与更新

执行 npm run build 后，把 dist/ 整体复制到静态文件服务器。支持部署到子路径。不要用 file:// 直接打开。Monaco Worker 需要通过 HTTP 或 HTTPS 加载。

构建产物包含页面、样式、脚本和 Worker。构建产物不依赖外部 CDN。构建器同步生成 HELP.md 和 README.md。

每次功能变更必须同步更新本帮助和 docs/requirements.md。每次交付必须重新运行类型检查、单元测试和构建。
`

export const README_MARKDOWN = `# M580_FB_Explorer

使用 Vue 3、Vite、TDesign 和 Monaco 浏览、编辑 Control Expert 交换文件。

## 命令

\`\`\`powershell
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run preview
\`\`\`

部署 dist/ 整体目录。使用 HTTP 或 HTTPS，不使用 file://。

运行 npm run test:e2e 可执行 Edge/Chromium 浏览器回归。

帮助真源：src/data/helpContent.ts。功能变更必须同步更新帮助和 docs/requirements.md。
`
