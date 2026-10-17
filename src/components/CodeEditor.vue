<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type * as Monaco from 'monaco-editor'
import { Button as TButton, Input as TInput } from 'tdesign-vue-next'
import {
  formatActiveSection,
  saveActiveSection,
  setActiveSource,
  setStatus
} from '../actions'
import {
  buildSnippet,
  formatSt,
  replaceAllSource,
  searchSource,
  ST_COMPLETION_SNIPPETS,
  ST_FUNCTION_COMPLETIONS,
  ST_KEYWORDS
} from '../core/st'
import type { SnippetKind } from '../core/st'
import { state } from '../store'
import type { ProgramSection } from '../types'

const props = defineProps<{ section: ProgramSection }>()

const isSt = computed(() => props.section.language === 'ST')
const isReadOnly = computed(() => !isSt.value)

const hostElement = ref<HTMLDivElement | null>(null)
const toolbarElement = ref<HTMLDivElement | null>(null)
const findInputRef = ref<unknown>(null)
const gotoInputRef = ref<unknown>(null)
const fallbackArea = ref<HTMLTextAreaElement | null>(null)
const loading = ref(true)
const fallback = ref(false)
const fallbackReason = ref('')

const editorRef = shallowRef<Monaco.editor.IStandaloneCodeEditor | null>(null)

/** Disposables owned by this component instance; every one is released in onBeforeUnmount. */
let completionDisposable: Monaco.IDisposable | null = null
let formattingDisposable: Monaco.IDisposable | null = null
let actionDisposables: Monaco.IDisposable[] = []
let decorations: Monaco.editor.IEditorDecorationsCollection | null = null
let matches: Monaco.editor.FindMatch[] = []
let syncing = false
/** Set before the async load resolves so a late import never touches a destroyed instance. */
let unmounted = false
let loadGeneration = 0

const findQuery = ref('')
const replaceQuery = ref('')
const gotoInput = ref('')
const matchCase = ref(false)
const wholeWord = ref(false)
const useRegex = ref(false)
const matchIndex = ref(-1)
const matchTotal = ref(0)
const matchError = ref('')
const cursorText = ref('行 1 : 列 1')

const WORD_SEPARATORS = '~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?'

const matchInfo = computed(() => {
  if (matchError.value) return matchError.value
  if (matchTotal.value === 0) return findQuery.value ? '0/0' : '—'
  return `${matchIndex.value + 1}/${matchTotal.value}`
})

const dirty = computed(() => state.dirty && state.activeSectionId === props.section.id)
const canSave = computed(() => !loading.value && (isSt.value || Object.keys(state.dirtySections).length > 0))

function registerLanguage(monaco: typeof Monaco): void {
  const known = monaco.languages.getLanguages().some((language) => language.id === 'st')
  if (!known) {
    monaco.languages.register({ id: 'st', extensions: ['.st'] })
    monaco.languages.setLanguageConfiguration('st', {
      comments: { blockComment: ['(*', '*)'] },
      brackets: [
        ['(', ')'],
        ['[', ']']
      ],
      autoClosingPairs: [
        { open: '(', close: ')' },
        { open: '[', close: ']' },
        { open: "'", close: "'" },
        { open: '"', close: '"' },
        { open: '(*', close: '*)' }
      ],
      surroundingPairs: [
        { open: '(', close: ')' },
        { open: '[', close: ']' },
        { open: "'", close: "'" },
        { open: '"', close: '"' }
      ]
    })
    monaco.languages.setMonarchTokensProvider('st', {
      ignoreCase: true,
      keywords: ST_KEYWORDS,
      brackets: [
        { open: '(', close: ')', token: 'delimiter.parenthesis' },
        { open: '[', close: ']', token: 'delimiter.square' }
      ],
      tokenizer: {
        root: [
          { include: '@whitespace' },
          // Comments and string literals come first so their body can never be tokenized as code.
          [/\(\*/, 'comment', '@comment'],
          [/'/, 'string', '@string_single'],
          [/"/, 'string', '@string_double'],
          // Typed, based and time literals must be matched before the identifier rule; otherwise
          // `t#100ms` starts a token as identifier `t` and the rest is an error token.
          [/(?:TIME_OF_DAY|DATE_AND_TIME|TIME|TOD|DATE|DT|T|D)#[0-9A-Za-z_:\-]*/, 'number'],
          [/\d+#[0-9A-Fa-f_]+/, 'number'],
          [
            /(?:BOOL|BYTE|SINT|USINT|INT|UINT|DINT|UDINT|LINT|ULINT|WORD|DWORD|REAL|LREAL|CHAR|WCHAR|STRING)#[A-Za-z0-9_.\-+#]*/,
            'number'
          ],
          [/%[A-Za-z]{1,3}\d+(?:\.\d+)*/, 'variable.predefined'],
          [/\d[\d_]*(?:\.[\d_]+)?(?:[eE][+\-]?\d+)?/, 'number'],
          [
            /[a-zA-Z_][a-zA-Z0-9_]*/,
            {
              cases: {
                '@keywords': 'keyword',
                '@default': 'identifier'
              }
            }
          ],
          [/:=|=>|<>|<=|>=|\*\*|\.\.|[:=<>+\-*/&]/, 'operator'],
          [/[;,.()[\]{}]/, 'delimiter']
        ],
        comment: [
          [/\*\)/, 'comment', '@pop'],
          [/\(\*/, 'comment', '@push'],
          [/[^(*]+/, 'comment'],
          [/[(*]/, 'comment']
        ],
        string_single: [
          [/\$./, 'string.escape'],
          [/''/, 'string.escape'],
          [/[^'$]+/, 'string'],
          [/'/, 'string', '@pop']
        ],
        string_double: [
          [/\$./, 'string.escape'],
          [/""/, 'string.escape'],
          [/[^"$]+/, 'string'],
          [/"/, 'string', '@pop']
        ],
        whitespace: [[/[ \t\r\n]+/, 'white']]
      }
    })
  }

  // Page surface #FAF9F5, content area #FFFFFF, accent #D97757, borders #CFCAC0 / #E5E2D8.
  monaco.editor.defineTheme('m580-claude-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '8a857c', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'b4553a', fontStyle: 'bold' },
      { token: 'number', foreground: '4a6b8a' },
      { token: 'string', foreground: '4f7a5b' },
      { token: 'string.escape', foreground: 'a8762f' },
      { token: 'operator', foreground: '6b6862' },
      { token: 'delimiter', foreground: '6b6862' },
      { token: 'variable.predefined', foreground: 'a8762f' },
      { token: 'identifier', foreground: '1f1e1d' }
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#1f1e1d',
      'editorLineNumber.foreground': '#b4afa6',
      'editorLineNumber.activeForeground': '#6b6862',
      'editorCursor.foreground': '#d97757',
      'editor.selectionBackground': '#ebd6c9',
      'editor.inactiveSelectionBackground': '#f1e6de',
      'editor.lineHighlightBackground': '#faf9f5',
      'editorIndentGuide.background1': '#e5e2d8',
      'editorIndentGuide.activeBackground1': '#cfcac0',
      'editorWidget.background': '#faf9f5',
      'editorWidget.border': '#e5e2d8',
      'editorSuggestWidget.background': '#faf9f5',
      'editorSuggestWidget.border': '#e5e2d8',
      'editorSuggestWidget.selectedBackground': '#f3ded4',
      'editorSuggestWidget.highlightForeground': '#c6613f',
      'editorGutter.background': '#ffffff',
      'editorHoverWidget.background': '#faf9f5',
      focusBorder: '#d97757',
      'scrollbarSlider.background': '#cfcac077',
      'scrollbarSlider.hoverBackground': '#cfcac0cc',
      'scrollbarSlider.activeBackground': '#d97757aa'
    }
  })
}

function registerCompletions(monaco: typeof Monaco): void {
  completionDisposable?.dispose()
  completionDisposable = monaco.languages.registerCompletionItemProvider('st', {
    triggerCharacters: ['.'],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
      const variableItems = (state.doc?.variables ?? []).map((variable) => ({
        label: variable.name,
        kind: monaco.languages.CompletionItemKind.Variable,
        detail: variable.typeName,
        documentation: variable.comment || undefined,
        insertText: variable.name,
        sortText: `1_${variable.name}`,
        range
      }))
      const functionItems = ST_FUNCTION_COMPLETIONS.map((item) => ({
        label: item.label,
        kind:
          item.kind === 'efb'
            ? monaco.languages.CompletionItemKind.Class
            : monaco.languages.CompletionItemKind.Function,
        detail: item.detail,
        insertText: item.insertText,
        insertTextRules: item.insertText.includes('$')
          ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
          : undefined,
        sortText: `2_${item.label}`,
        range
      }))
      const keywordItems = ST_KEYWORDS.map((keyword) => ({
        label: keyword,
        kind: monaco.languages.CompletionItemKind.Keyword,
        insertText: keyword,
        sortText: `3_${keyword}`,
        range
      }))
      const snippetItems = ST_COMPLETION_SNIPPETS.map((snippet) => ({
        label: snippet.label,
        kind: monaco.languages.CompletionItemKind.Snippet,
        detail: snippet.detail,
        insertText: snippet.insertText,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        sortText: `4_${snippet.label}`,
        range
      }))
      return { suggestions: [...variableItems, ...functionItems, ...keywordItems, ...snippetItems] }
    }
  })
}

function registerFormatting(monaco: typeof Monaco): void {
  formattingDisposable?.dispose()
  formattingDisposable = monaco.languages.registerDocumentFormattingEditProvider('st', {
    displayName: 'M580 ST 保守格式化',
    provideDocumentFormattingEdits(model) {
      const current = model.getValue()
      const formatted = formatSt(current)
      if (formatted === current) return []
      return [{ range: model.getFullModelRange(), text: formatted }]
    }
  })
}

function addEditorActions(monaco: typeof Monaco, editor: Monaco.editor.IStandaloneCodeEditor): void {
  const descriptors: Monaco.editor.IActionDescriptor[] = [
    {
      id: 'm580.find',
      label: 'M580：查找与替换',
      contextMenuGroupId: 'm580',
      contextMenuOrder: 1,
      run: () => focusField(findInputRef.value, 'find')
    },
    {
      id: 'm580.goto',
      label: 'M580：跳转到行:列',
      contextMenuGroupId: 'm580',
      contextMenuOrder: 2,
      run: () => focusField(gotoInputRef.value, 'goto')
    },
    {
      id: 'm580.format',
      label: 'M580：格式化 ST 源码',
      contextMenuGroupId: 'm580',
      contextMenuOrder: 3,
      precondition: '!editorReadonly',
      run: () => onFormat()
    },
    {
      id: 'm580.insert.if',
      label: 'M580：插入 IF 模板',
      contextMenuGroupId: 'm580',
      contextMenuOrder: 4,
      precondition: '!editorReadonly',
      run: () => insertSnippet('IF')
    },
    {
      id: 'm580.insert.for',
      label: 'M580：插入 FOR 模板',
      contextMenuGroupId: 'm580',
      contextMenuOrder: 5,
      precondition: '!editorReadonly',
      run: () => insertSnippet('FOR')
    },
    {
      id: 'm580.insert.while',
      label: 'M580：插入 WHILE 模板',
      contextMenuGroupId: 'm580',
      contextMenuOrder: 6,
      precondition: '!editorReadonly',
      run: () => insertSnippet('WHILE')
    },
    {
      id: 'm580.save',
      label: 'M580：保存并重新解析',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      contextMenuGroupId: 'm580',
      contextMenuOrder: 7,
      run: () => onSave()
    }
  ]
  for (const descriptor of descriptors) {
    // addAction returns a disposable that Monaco does not own; release it on unmount.
    actionDisposables.push(editor.addAction(descriptor))
  }
}

function createEditor(monaco: typeof Monaco): void {
  const host = hostElement.value
  if (!host || unmounted) return
  const editor = monaco.editor.create(host, {
    value: props.section.language === 'ST' ? props.section.stSource : props.section.xmlSource,
    language: isSt.value ? 'st' : 'xml',
    theme: 'm580-claude-light',
    readOnly: isReadOnly.value,
    automaticLayout: true,
    fontSize: 13,
    lineHeight: 20,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    renderWhitespace: 'selection',
    tabSize: 4,
    insertSpaces: true,
    wordWrap: 'off',
    smoothScrolling: true,
    contextmenu: true,
    folding: true,
    lineNumbersMinChars: 4,
    padding: { top: 6, bottom: 6 }
  })
  editorRef.value = editor
  decorations = editor.createDecorationsCollection([])

  editor.onDidChangeModelContent(() => {
    if (syncing) return
    setActiveSource(editor.getValue())
    matchTotal.value = 0
    matchIndex.value = -1
    clearMatchDecorations()
  })
  editor.onDidChangeCursorPosition((event) => {
    cursorText.value = `行 ${event.position.lineNumber} : 列 ${event.position.column}`
  })
  addEditorActions(monaco, editor)
  registerCompletions(monaco)
  registerFormatting(monaco)
}

async function loadMonaco(): Promise<typeof Monaco> {
  // The worker class must exist before the first editor is created, so it is imported and
  // registered before the editor API module is evaluated.
  const workerModule = await import('monaco-editor/esm/vs/editor/editor.worker?worker')
  const EditorWorker = workerModule.default
  ;(self as unknown as { MonacoEnvironment?: unknown }).MonacoEnvironment = {
    getWorker: () => new EditorWorker()
  }
  const [monaco] = await Promise.all([
    import('monaco-editor/esm/vs/editor/editor.api'),
    // Side effect only. The API entry alone registers no editor contributions: without this
    // module the context menu, the suggest widget, the find widget and
    // `editor.action.formatDocument` are all absent.
    // @ts-expect-error monaco-editor ships editor.api.d.ts but no declaration for this internal entry.
    import('monaco-editor/esm/vs/editor/editor.all'),
    import('monaco-editor/esm/vs/basic-languages/xml/xml.contribution')
  ])
  return monaco as unknown as typeof Monaco
}

onMounted(async () => {
  const generation = ++loadGeneration
  try {
    const monaco = await loadMonaco()
    if (unmounted || generation !== loadGeneration) return
    registerLanguage(monaco)
    await nextTick()
    if (unmounted || generation !== loadGeneration) return
    createEditor(monaco)
    if (state.jump && state.jump.sectionId === props.section.id) {
      revealLine(state.jump.line, state.jump.column)
    }
  } catch (error) {
    if (unmounted) return
    fallback.value = true
    fallbackReason.value = (error as Error).message || String(error)
  } finally {
    if (!unmounted) loading.value = false
  }
})

onBeforeUnmount(() => {
  unmounted = true
  loadGeneration += 1
  for (const disposable of actionDisposables) disposable.dispose()
  actionDisposables = []
  formattingDisposable?.dispose()
  formattingDisposable = null
  completionDisposable?.dispose()
  completionDisposable = null
  decorations?.clear()
  decorations = null
  matches = []
  const editor = editorRef.value
  editorRef.value = null
  // StandaloneEditor owns the model it created and disposes it here as well.
  editor?.dispose()
})

watch(
  () => [props.section.stSource, props.section.xmlSource, props.section.language] as const,
  () => {
    const editor = editorRef.value
    if (!editor) return
    const nextValue = props.section.language === 'ST' ? props.section.stSource : props.section.xmlSource
    if (editor.getValue() === nextValue) return
    const position = editor.getPosition()
    syncing = true
    editor.setValue(nextValue)
    if (position) editor.setPosition(position)
    syncing = false
    runFind(false)
  }
)

watch(
  () => state.jump?.nonce,
  () => {
    const jump = state.jump
    if (!jump || jump.sectionId !== props.section.id) return
    revealLine(jump.line, jump.column)
  }
)

function revealLine(line: number, column: number): void {
  const editor = editorRef.value
  if (!editor) {
    if (fallback.value) selectFallbackRange(line, column)
    return
  }
  const model = editor.getModel()
  if (!model) return
  const targetLine = Math.min(Math.max(1, line), model.getLineCount())
  const targetColumn = Math.min(Math.max(1, column), model.getLineMaxColumn(targetLine))
  editor.setPosition({ lineNumber: targetLine, column: targetColumn })
  editor.revealPositionInCenter({ lineNumber: targetLine, column: targetColumn })
  editor.focus()
}

function focusField(target: unknown, field: 'find' | 'goto'): void {
  const instance = target as { focus?: () => void } | null
  if (instance && typeof instance.focus === 'function') {
    instance.focus()
    return
  }
  const root = toolbarElement.value
  if (!root) return
  const holder = root.querySelector<HTMLElement>(`[data-field="${field}"]`)
  if (!holder) return
  const input = holder instanceof HTMLInputElement ? holder : holder.querySelector('input')
  input?.focus()
  input?.select()
}

function clearMatchDecorations(): void {
  decorations?.clear()
}

function focusMatch(): void {
  const editor = editorRef.value
  if (!editor || matches.length === 0) return
  const index = Math.min(Math.max(0, matchIndex.value), matches.length - 1)
  const range = matches[index].range
  editor.setSelection(range)
  editor.revealRangeInCenter(range)
  decorations?.set(
    matches.map((match, position) => ({
      range: match.range,
      options: {
        className: position === index ? 'm580-match m580-match-current' : 'm580-match',
        isWholeLine: false
      }
    }))
  )
}

function runFind(reset: boolean): void {
  matchError.value = ''
  const editor = editorRef.value
  if (!editor) {
    if (fallback.value) runFallbackFind()
    return
  }
  const model = editor.getModel()
  if (!model) return
  const query = findQuery.value
  if (!query) {
    matches = []
    matchTotal.value = 0
    matchIndex.value = -1
    clearMatchDecorations()
    return
  }
  try {
    matches = model.findMatches(
      query,
      false,
      useRegex.value,
      matchCase.value,
      wholeWord.value ? WORD_SEPARATORS : null,
      false,
      3000
    )
  } catch (error) {
    matches = []
    matchTotal.value = 0
    matchIndex.value = -1
    matchError.value = (error as Error).message
    clearMatchDecorations()
    return
  }
  matchTotal.value = matches.length
  if (matches.length === 0) {
    matchIndex.value = -1
    clearMatchDecorations()
    return
  }
  if (reset || matchIndex.value < 0 || matchIndex.value >= matches.length) matchIndex.value = 0
  focusMatch()
}

function stepMatch(delta: number): void {
  if (matchTotal.value === 0) return
  matchIndex.value = (matchIndex.value + delta + matchTotal.value) % matchTotal.value
  focusMatch()
}

function replaceCurrent(): void {
  if (isReadOnly.value) return
  const editor = editorRef.value
  if (!editor) {
    const match = fallbackMatches.value[matchIndex.value]
    if (!match) {
      runFallbackFind()
      return
    }
    const source = props.section.stSource
    setActiveSource(`${source.slice(0, match.start)}${replaceQuery.value}${source.slice(match.end)}`)
    runFallbackFind()
    return
  }
  if (matches.length === 0) {
    runFind(true)
    return
  }
  const index = Math.min(Math.max(0, matchIndex.value), matches.length - 1)
  editor.executeEdits('m580-replace', [{ range: matches[index].range, text: replaceQuery.value }])
  editor.pushUndoStop()
  runFind(false)
}

function replaceAll(): void {
  if (isReadOnly.value) return
  const editor = editorRef.value
  if (editor) {
    const model = editor.getModel()
    if (!model || !findQuery.value) return
    const result = replaceAllSource(model.getValue(), findQuery.value, replaceQuery.value, {
      caseSensitive: matchCase.value,
      wholeWord: wholeWord.value,
      useRegex: useRegex.value
    })
    if (result.error) {
      matchError.value = result.error
      return
    }
    if (result.count === 0) return
    editor.pushUndoStop()
    editor.executeEdits('m580-replace-all', [
      { range: model.getFullModelRange(), text: result.text }
    ])
    editor.pushUndoStop()
    runFind(true)
    return
  }
  const result = replaceAllSource(props.section.stSource, findQuery.value, replaceQuery.value, {
    caseSensitive: matchCase.value,
    wholeWord: wholeWord.value,
    useRegex: useRegex.value
  })
  if (result.error) {
    matchError.value = result.error
    return
  }
  if (result.count > 0) setActiveSource(result.text)
  runFallbackFind()
}

function jumpToPosition(): void {
  const match = /^\s*(\d+)\s*(?::\s*(\d+))?\s*$/.exec(gotoInput.value)
  if (!match) {
    matchError.value = '行列格式：12 或 12:5'
    return
  }
  matchError.value = ''
  const line = Number.parseInt(match[1], 10)
  const column = match[2] ? Number.parseInt(match[2], 10) : 1
  revealLine(line, column)
}

function onFormat(): void {
  if (isReadOnly.value) {
    setStatus('仅 ST 程序段支持格式化', 'warning')
    return
  }
  const editor = editorRef.value
  const action = editor?.getAction('editor.action.formatDocument') ?? null
  if (!editor || !action) {
    formatActiveSection()
    runFind(false)
    return
  }
  // The registered DocumentFormattingEditProvider turns this into a text edit on the model,
  // so the undo stack and the cursor survive the reformat.
  void action
    .run()
    .then(() => {
      setStatus('已格式化 ST 源码，保存后写回交换文件', 'info')
      runFind(false)
    })
    .catch(() => {
      formatActiveSection()
      runFind(false)
    })
}

function modelEol(model: Monaco.editor.ITextModel): string {
  return typeof model.getEOL === 'function' ? model.getEOL() : '\n'
}

/** Map an offset measured on LF text onto the same text once CRLF was substituted. */
function caretOffsetFor(bodyOffset: number, lfText: string, eol: string): number {
  const breaks = lfText.slice(0, Math.max(0, bodyOffset)).split('\n').length - 1
  return bodyOffset + breaks * (eol.length - 1)
}

function insertSnippet(kind: SnippetKind): void {
  if (isReadOnly.value) return
  const editor = editorRef.value
  if (!editor) {
    insertFallbackSnippet(kind)
    return
  }
  const model = editor.getModel()
  const selection = editor.getSelection()
  if (!model || !selection) return
  const lineContent = model.getLineContent(selection.startLineNumber)
  const indentMatch = /^\s*/.exec(lineContent)
  const indentText = indentMatch ? indentMatch[0] : ''
  const snippet = buildSnippet(kind, indentText)
  const eol = modelEol(model)
  const source = model.getValue()
  const endOffset = model.getOffsetAt(selection.getEndPosition())
  const nextChar = source[endOffset]
  const needsBreak = endOffset < source.length && nextChar !== '\n' && nextChar !== '\r'
  const body = snippet.text.split('\n').join(eol)
  const text = needsBreak ? `${body}${eol}` : body
  const startOffset = model.getOffsetAt(selection.getStartPosition())
  editor.executeEdits('m580-insert', [{ range: selection, text, forceMoveMarkers: true }])
  const caret = model.getPositionAt(startOffset + caretOffsetFor(snippet.cursorOffset, snippet.text, eol))
  editor.setPosition(caret)
  editor.focus()
}

function onSave(): void {
  if (!isSt.value && Object.keys(state.dirtySections).length === 0) return
  saveActiveSection()
}

/* ---------- fallback textarea path ---------- */

const fallbackMatches = ref<Array<{ start: number; end: number; line: number; column: number }>>([])
let fallbackMatchIndex = 0

function runFallbackFind(): void {
  matchError.value = ''
  if (!findQuery.value) {
    fallbackMatches.value = []
    matchTotal.value = 0
    matchIndex.value = -1
    return
  }
  const result = searchSource(props.section.stSource, findQuery.value, {
    caseSensitive: matchCase.value,
    wholeWord: wholeWord.value,
    useRegex: useRegex.value
  })
  if (result.error) {
    matchError.value = result.error
    return
  }
  fallbackMatches.value = result.matches
  matchTotal.value = result.matches.length
  if (result.matches.length === 0) {
    matchIndex.value = -1
    return
  }
  if (fallbackMatchIndex >= result.matches.length) fallbackMatchIndex = 0
  matchIndex.value = fallbackMatchIndex
  selectFallbackMatch()
}

function selectFallbackMatch(): void {
  const area = fallbackArea.value
  const match = fallbackMatches.value[matchIndex.value]
  if (!area || !match) return
  area.focus()
  area.setSelectionRange(match.start, match.end)
  const lineHeight = 20
  area.scrollTop = Math.max(0, (match.line - 3) * lineHeight)
}

/** Offset of a 1-based line/column pair; CRLF counts as a single break. */
function offsetOfPosition(text: string, line: number, column: number): number {
  let offset = 0
  let currentLine = 1
  while (currentLine < line) {
    const index = text.indexOf('\n', offset)
    if (index < 0) return text.length
    offset = index + 1
    currentLine += 1
  }
  return Math.min(text.length, offset + Math.max(0, column - 1))
}

function selectFallbackRange(line: number, column: number): void {
  const area = fallbackArea.value
  if (!area) return
  const source = props.section.stSource
  const offset = offsetOfPosition(source, line, column)
  area.focus()
  area.setSelectionRange(offset, offset)
  area.scrollTop = Math.max(0, (line - 3) * 20)
}

function insertFallbackSnippet(kind: SnippetKind): void {
  const area = fallbackArea.value
  const source = props.section.stSource
  const start = area ? area.selectionStart : source.length
  const end = area ? area.selectionEnd : source.length
  const lineStart = source.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  const indent = /^\s*/.exec(source.slice(lineStart, start))?.[0] ?? ''
  const snippet = buildSnippet(kind, indent)
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const nextChar = source[end]
  const needsBreak = end < source.length && nextChar !== '\n' && nextChar !== '\r'
  const body = snippet.text.split('\n').join(eol)
  const text = needsBreak ? `${body}${eol}` : body
  const next = `${source.slice(0, start)}${text}${source.slice(end)}`
  setActiveSource(next)
  nextTick(() => {
    const caret = start + caretOffsetFor(snippet.cursorOffset, snippet.text, eol)
    fallbackArea.value?.setSelectionRange(caret, caret)
    fallbackArea.value?.focus()
  })
}

function onFallbackInput(event: Event): void {
  setActiveSource((event.target as HTMLTextAreaElement).value)
}

function stepFallbackMatch(delta: number): void {
  if (fallbackMatches.value.length === 0) return
  fallbackMatchIndex = (matchIndex.value + delta + fallbackMatches.value.length) % fallbackMatches.value.length
  matchIndex.value = fallbackMatchIndex
  selectFallbackMatch()
}

function step(delta: number): void {
  if (fallback.value) stepFallbackMatch(delta)
  else stepMatch(delta)
}

// Keep both paths in sync when a toggle changes.
watch([findQuery, matchCase, wholeWord, useRegex], () => {
  if (loading.value) return
  runFind(true)
})

defineExpose({ revealLine })
</script>
<template>
  <section class="editor-panel">
    <header class="editor-head">
      <span class="badge" :class="{ 'badge--st': isSt }">{{ isSt ? 'ST' : 'XML' }}</span>
      <span class="name">{{ props.section.name }}</span>
      <span v-if="dirty" class="dirty">● 未保存</span>
      <span class="spacer" style="flex: 1 1 auto"></span>
      <span class="count">{{ cursorText }}</span>
      <TButton
        size="small"
        theme="primary"
        :disabled="!canSave"
        @click="onSave"
      >
        保存并重新解析
      </TButton>
    </header>

    <div ref="toolbarElement" class="editor-toolbar">
      <TInput
        ref="findInputRef"
        v-model="findQuery"
        data-field="find"
        size="small"
        placeholder="查找"
        style="width: 140px"
        @enter="runFind(true)"
      />
      <button class="mini-btn" title="上一个" @click="step(-1)">↑</button>
      <button class="mini-btn" title="下一个" @click="step(1)">↓</button>
      <span class="match-info">{{ matchInfo }}</span>
      <label class="count" title="区分大小写"><input v-model="matchCase" type="checkbox" />Aa</label>
      <label class="count" title="全字匹配"><input v-model="wholeWord" type="checkbox" />W</label>
      <label class="count" title="正则表达式"><input v-model="useRegex" type="checkbox" />.*</label>
      <span class="sep"></span>
      <TInput
        v-model="replaceQuery"
        size="small"
        placeholder="替换为"
        :disabled="isReadOnly"
        style="width: 140px"
      />
      <button class="mini-btn" :disabled="isReadOnly" @click="replaceCurrent">替换</button>
      <button class="mini-btn" :disabled="isReadOnly" @click="replaceAll">全部替换</button>
      <span class="sep"></span>
      <TInput
        ref="gotoInputRef"
        v-model="gotoInput"
        data-field="goto"
        size="small"
        placeholder="行:列"
        style="width: 84px"
        @enter="jumpToPosition"
      />
      <button class="mini-btn" @click="jumpToPosition">跳转</button>
      <span class="sep"></span>
      <button class="mini-btn" :disabled="isReadOnly" @click="onFormat">格式化</button>
      <button class="mini-btn" :disabled="isReadOnly" title="插入 IF 语句块" @click="insertSnippet('IF')">IF</button>
      <button class="mini-btn" :disabled="isReadOnly" title="插入 FOR 循环" @click="insertSnippet('FOR')">FOR</button>
      <button class="mini-btn" :disabled="isReadOnly" title="插入 WHILE 循环" @click="insertSnippet('WHILE')">WHILE</button>
    </div>

    <div v-if="loading" class="editor-note">正在加载编辑器…</div>
    <div v-else-if="fallback" class="editor-note">
      Monaco 编辑器加载失败，已降级为原生文本框：无语法高亮、无自动补全。查找、替换、跳转、格式化和模板插入仍然可用。原因：{{ fallbackReason }}
    </div>
    <div v-else-if="isReadOnly" class="editor-note">非 ST 程序段以只读 XML 原文打开；替换、格式化与插入已禁用。</div>

    <div v-show="!fallback" ref="hostElement" class="editor-host"></div>
    <textarea
      v-if="fallback"
      ref="fallbackArea"
      class="editor-fallback mono"
      :value="isSt ? props.section.stSource : props.section.xmlSource"
      :readonly="isReadOnly"
      spellcheck="false"
      @input="onFallbackInput"
      @keydown.ctrl.s.prevent="onSave"
    ></textarea>
  </section>
</template>
<style scoped>
/* Content area stays white; the page surface is #FAF9F5 from styles.css. */
.editor-host {
  background: #ffffff;
}

.editor-fallback {
  background: #ffffff;
}
</style>
