# M580_FB_Explorer User Help

The page parses Control Expert exchange files in the browser. The page does not upload imported files. The page does not connect to a PLC.

The screenshots in this document use the built-in sample only.

## 1. Interface language

The top bar provides the language switch. You can select Simplified Chinese, English, Traditional Chinese, Japanese, and Korean.

When the browser allows local storage, the page remembers your language selection.

A language change does not clear the document, the source code, or unexported changes.

Interface labels and messages use the selected language. PLC identifiers, user file content, and XML format values do not change with the interface language.

Existing status messages and parse warnings keep the language used when they were generated. New operations use the newly selected language.

## 2. Import a file

![Workspace](images/en/workspace.png)

Click "Import file" in the top bar to select an .xdb, .xst, or .xsy file. You can also drag a file into the window.

Click the sample button in the top bar to load the built-in sample.

Import and export entries live in the top bar only. The top-left panel does not provide import or export buttons.

The top-left area shows file information, the section list, and the parse warnings entry.

After you click a section, the bottom-right editor shows the content of that section.

The page edits one document at a time. A new import replaces the current document. Export the modified file first.

After a successful import, the page clears search text and collapse state.

The page supports .xdb files with a single FBSource, .xst section files, and .xsy variable table files. Multiple function block scopes do not merge yet. The page rejects structures that it cannot process safely and shows the reason.

A non-ST section shows read-only XML text. The page does not convert diagram languages to ST.

## 3. Create a function block

![New function block](images/en/new-block.png)

Click "New function block" in the top bar to open the dialog.

Enter the function block name in the dialog. You can also enter a comment.

The name must follow the IEC identifier rules of this project.

After you confirm, the page creates an empty variable table and one empty ST section.

When the current document has unexported changes, the page asks for confirmation before it replaces the document.

The new document uses the existing variable editing, ST editing, saving, and .xdb export workflows.

## 4. Edit metadata

The function block name and comment use draft editing.

The page writes a new value into the document only after you click "Confirm".

Click "Cancel" to restore the previous value.

## 5. Layout and pin view

The left and right columns default to 34% and 66%. The top-right variable list defaults to 1/3 of the height. The bottom-right section editor defaults to 2/3 of the height.

The left column shows metadata, the call list, and the pin call view in order. Drag a splitter to resize a panel. Double-click a splitter to reset the size. Focus a splitter and use the arrow keys to adjust the size in small steps.

The page switches to a vertical layout on narrow screens. Tables inside panels scroll horizontally. When the browser allows local storage, the page records panel sizes.

The pin view shows IN, OUT, and IN_OUT pins. IN_OUT uses a dashed line. PRIVATE, PUBLIC, and GLOBAL do not draw as pins. EN and ENO appear as system pin symbols only. Click a pin to locate the variable in the top-right list.

Use the plus and minus buttons of the pin panel to zoom the view. When you click a pin, the page clears the variable search text and expands the matching group.

After you click a pin or a variable row, the editor locates the usages of that variable. The call panel shows the related variable references. A variable without references does not trigger a jump.

## 6. Manage variables

![Variable editor](images/en/variable-editor.png)

Variables group by IN, OUT, IN_OUT, PUBLIC, PRIVATE, and GLOBAL. GLOBAL corresponds to dataBlock global variables.

Enter a variable name, type, address, initial value, or comment in the search box. The search expands matching groups. Click a group header to collapse the group.

Click "Add" to create a variable. Click "Edit" to change a variable. Click "Delete" and confirm to remove a variable. Click the up and down arrows to reorder variables of the same kind. The pin number PositionPin recalculates in order.

![Type picker](images/en/type-picker.png)

Click "Pick type" to select a base type. You can also enter a custom type. Array mode provides an element type, a lower bound, and an upper bound. The result uses ARRAY[lower..upper] OF type.

The variable table shows the type and the address in separate columns. When you scroll the variable table, the current group header sticks to the top of the table.

A variable name must start with a letter or an underscore. The other characters can be letters, digits, and underscores only. Variable names must be unique, ignoring case. You cannot add EN and ENO as normal pins.

A 32-bit type must use an even address when it binds to %MW. The page does not change addresses on its own. Correct a wrong address in the variable dialog.

## 7. Parse ST calls

![Call browser](images/en/call-browser.png)

The middle-left list shows function and function block calls. The list keeps unknown calls and does not treat unknown names as system functions. The parser ignores false calls inside strings and comments.

After you click a call item, the editor jumps to the matching line and column. Click "Re-parse" to parse the code again. Saving a section also refreshes the call list.

The call panel also shows plain variable references. The reference analysis ignores comments, strings, and formal parameter names of named arguments. Click a reference to locate the code, the variable row, and the matching pin at the same time. Clicking a variable in the editor also updates the selection state.

Call parsing is not syntax compilation. The page does not check all function signatures and does not execute ST code.

## 8. Editor operations

| Action | Entry |
| --- | --- |
| Find | Ctrl+F, toolbar, context menu |
| Replace | Ctrl+H, toolbar, context menu |
| Go to line:column | Ctrl+G or the line:column box |
| Format | Shift+Alt+F, toolbar, context menu |
| Insert IF / FOR / WHILE | Toolbar, context menu |
| Function/function block call | Toolbar, context menu |
| Save and parse | Ctrl+S or the save button |
| Auto completion | While you type, or Ctrl+Space |

Auto completion includes keywords, current variables, common functions, and statement templates. The formatter arranges supported ST structures only. It does not replace a full IEC 61131-3 compiler.

Saving in the editor writes to page memory only. A save does not modify the original file on disk. Click "Export .xdb" in the top bar to download the modified file.

After you save and re-parse, the "unsaved" mark of the current section disappears. The "changed" mark in the top bar means that you have not exported yet. It does not disappear when you save a section.

The "Function/function block call" dialog has a category column and an item column. The dialog supports search, functions, function blocks, sections of the current document, and custom calls. The insert position is the editor selection or the cursor at the time you open the dialog.

An EFB must use an instance. Select an existing instance of the same type, or enter a new instance name and confirm the creation of a PRIVATE variable before you insert. Check the parameters and the call position after the insert. A section name call does not guarantee fit for every task context.

The function and variable type data comes from the JSON files under src/data/functionLibraries/. A base snapshot is not a complete official manual. Each library states its source and coverage. See the repository CONTRIBUTE.md for the maintenance method. Rebuild after you change a JSON file.

The Standard library material comes from 33002519.20 (09/2020, for Control Expert 15.0 and later). The catalog is saved separately. The call list contains verified specific functions only. The variable type descriptions come from 35006144.27. Extended types in old presets do not state verified M580 support. Unity Pro V13.1 compatibility is not verified.

When Monaco fails to load, the page shows an error and switches to a text box. The text box does not provide syntax highlighting or auto completion.

## 9. Export rules

The exporter generates XML per section 4 of the repository AGENTS.md.

- STSource allows executable statements only. When the page detects a VAR declaration area, it rejects the export. Move the variables into the variable table.
- Input, output, and in-out parameters write into their matching containers. PositionPin increments from 1.
- Function block initial values write into variableInit. Global variable initial values read from defaultValue.
- An empty topologicalAddress and an empty comment are omitted.
- The exporter expands self-closing tags.
- A 32-bit %MW variable must bind an even address. The page rejects the export when the check fails.
- A .xdb write-back keeps unedited extension nodes and attributes.

An export from .xst or .xsy to .xdb is a structure conversion. GLOBAL variables convert to PRIVATE. The page shows a conversion warning. The task context of a section does not become a PLC task. Check the conversion result.

When an export produces warnings, the page shows the full warning text in the "Export notes" drawer.

Control Expert import, compilation, and physical PLC communication tests are not executed.

## 10. Reserved MCP interface

The page provides window.__M580_MCP_BRIDGE__. The bridge provides listTools(), callTool(name, input), and getState().

This is a tool interface inside the page. It is not a standalone MCP server. The page does not connect to a remote service by default. The transport adapter provides an access boundary only.

| Tool | Purpose |
| --- | --- |
| m580_fb_get_metadata | Read the document summary |
| m580_fb_list_variables | Query variables with category and search |
| m580_fb_upsert_variable | Change a variable by id, or add a variable |
| m580_fb_delete_variable | Delete a variable by id |
| m580_fb_get_source | Read code by sectionId |
| m580_fb_set_source | Write source and parse calls |
| m580_fb_insert_snippet | Insert a source or kind template at line, column |
| m580_fb_analyze_calls | Extract calls again |

The page keeps these compatibility tools: m580_get_state, m580_import, m580_list_variables, m580_upsert_variable, m580_delete_variable, m580_get_section, m580_set_section_source, m580_save_section, m580_format_section, m580_replace_in_section, m580_extract_calls, m580_export_xdb, m580_get_help, m580_jump.

Read the inputSchema that listTools() returns to see the fields and required parameters of each tool. callTool() returns ok, result, or error.

Example:

```js
await window.__M580_MCP_BRIDGE__.callTool('m580_fb_list_variables', { category: 'IN' })
```

## 11. Deploy and update

Run npm run build, then copy the complete dist/ directory to a static file server. A sub-path deployment is supported. Do not open the page with file://. The Monaco worker must load over HTTP or HTTPS.

The build output contains the page, the styles, the scripts, and the worker. The build output does not depend on an external CDN.

The help source files are zh-CN.md, en.md, zh-TW.md, ja.md, and ko.md under requirements/localization/help/. The app loads the .md file of the selected language with Vite raw imports. The build copies the help files to dist/HELP.{locale}.md and generates the default HELP.md. The build generates README.md from a copy of README.en.md.

Every feature change requires an update of the help documents and docs/requirements.md. Every delivery requires new runs of type checking, unit tests, and the build.
