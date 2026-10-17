import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'

const languages = ['zh-CN', 'en', 'zh-TW', 'ja', 'ko']
const images = ['workspace', 'variable-editor', 'type-picker', 'call-browser', 'new-block']
const hashes = new Map(images.map(name => [name, new Set()]))
for (const language of languages) {
  const source = readFileSync(`requirements/localization/help/${language}.md`)
  assert.deepEqual(readFileSync(`dist/HELP.${language}.md`), source, `${language}: help output differs`)
  for (const name of images) {
    const relative = `images/${language}/${name}.png`
    assert.ok(source.toString('utf8').includes(relative), `${language}: missing reference ${name}`)
    const image = readFileSync(`docs/${relative}`)
    assert.deepEqual(readFileSync(`dist/${relative}`), image, `${language}: screenshot output differs ${name}`)
    assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${relative}: invalid PNG`)
    assert.equal(image.readUInt32BE(16), 1440, `${relative}: wrong width`)
    assert.equal(image.readUInt32BE(20), 960, `${relative}: wrong height`)
    hashes.get(name).add(createHash('sha256').update(image).digest('hex'))
  }
}
for (const [name, set] of hashes) assert.equal(set.size, 5, `${name}: screenshots are not distinct across languages`)
assert.deepEqual(readFileSync('dist/HELP.md'), readFileSync('requirements/localization/help/zh-CN.md'))
assert.deepEqual(readFileSync('dist/README.md'), readFileSync('README.en.md'))
console.log('PASS: 5 localized help files, 25 distinct localized screenshots, default HELP.md and README.md')
