import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'

/** 帮助唯一真源：根目录五语 README。 */
const readmeFiles = {
  'zh-CN': 'README.md',
  en: 'README.en.md',
  'zh-TW': 'README.zh-TW.md',
  ja: 'README.ja.md',
  ko: 'README.ko.md'
}
const screenshots = ['workspace', 'new-block', 'variable-editor', 'type-picker', 'call-browser']
const repositoryDocuments = ['CONTRIBUTING.md', 'CONTRIBUTING.en.md', 'docs/requirements.md']
const hashes = new Map(screenshots.map(name => [name, new Set()]))

/** 按钮文案防回归：五语 README 必须逐字引用对应语言的界面按钮文案。 */
const buttonLabels = [
  { catalog: 'app', key: 'import' },
  { catalog: 'app', key: 'export' },
  { catalog: 'app', key: 'exportTitle' },
  { catalog: 'app', key: 'newBlock.title' },
  { catalog: 'app', key: 'tree.confirm' },
  { catalog: 'app', key: 'tree.cancel' },
  { catalog: 'app', key: 'tree.pending' },
  { catalog: 'base', key: 'callsPanel.refresh' },
  { catalog: 'base', key: 'variableDialog.pickType' }
]
const readJson = file => JSON.parse(readFileSync(file, 'utf8'))
const readLabel = (catalog, key) => key.split('.').reduce((node, part) => node[part], catalog)

// 1. 五语 README 逐字等于发布副本，引用本语言截图与全部语言导航，并与本语言 locale 按钮文案一致。
// 2. 25 张截图逐字等于发布副本，PNG 有效且五语互不相同；README 不得跨语引用其他语言截图。
for (const [language, fileName] of Object.entries(readmeFiles)) {
  const source = readFileSync(fileName)
  const text = source.toString('utf8')
  assert.deepEqual(readFileSync(`dist/${fileName}`), source, `${language}: README output differs`)
  for (const [other, otherFile] of Object.entries(readmeFiles)) {
    if (other === language) continue
    assert.ok(existsSync(otherFile), `${other}: missing README ${otherFile}`)
    assert.ok(text.includes(`](${otherFile})`) || text.includes(`](${otherFile}#`), `${language}: missing language link to ${otherFile}`)
    assert.equal(text.includes(`docs/images/${other}/`), false, `${language}: README must not reference ${other} screenshots`)
  }
  const appCatalog = readJson(`src/locales/app.${language}.json`)
  const baseCatalog = readJson(`src/locales/${language}.json`)
  for (const { catalog, key } of buttonLabels) {
    const label = readLabel(catalog === 'app' ? appCatalog : baseCatalog, key)
    assert.equal(typeof label, 'string', `${language}: missing locale label ${catalog}:${key}`)
    assert.ok(text.includes(label), `${language}: README is missing the button label "${label}" (${catalog}:${key})`)
  }
  for (const name of screenshots) {
    const relative = `docs/images/${language}/${name}.png`
    assert.ok(text.includes(`(${relative})`), `${language}: missing relative reference to ${relative}`)
    const image = readFileSync(relative)
    assert.deepEqual(readFileSync(`dist/${relative}`), image, `${language}: screenshot output differs ${name}`)
    assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${relative}: invalid PNG`)
    assert.equal(image.readUInt32BE(16), 1440, `${relative}: wrong width`)
    assert.equal(image.readUInt32BE(20), 960, `${relative}: wrong height`)
    hashes.get(name).add(createHash('sha256').update(image).digest('hex'))
  }
}
for (const [name, set] of hashes) assert.equal(set.size, 5, `${name}: screenshots are not distinct across languages`)

// 3. 旧的 help 真源与 dist 帮助副本已删除（目录可以为空，但不得再存放帮助正文）。
const legacyHelp = 'requirements/localization/help'
const legacyFiles = existsSync(legacyHelp) ? readdirSync(legacyHelp).filter(name => name.endsWith('.md')) : []
assert.deepEqual(legacyFiles, [], `the removed help source still holds ${legacyFiles.join(', ')}`)
assert.equal(existsSync('dist/HELP.md'), false, 'dist/HELP.md must not be published')
for (const language of Object.keys(readmeFiles)) {
  assert.equal(existsSync(`dist/HELP.${language}.md`), false, `dist/HELP.${language}.md must not be published`)
}

// 4. 贡献指南中英与功能需求随构建发布，且内容逐字一致。
for (const document of repositoryDocuments) {
  assert.ok(existsSync(document), `missing repository document ${document}`)
  assert.deepEqual(readFileSync(`dist/${document}`), readFileSync(document), `${document}: published copy differs`)
}

console.log('PASS: 5 README help sources, 25 distinct localized screenshots, language links, button labels, contribution guides')
