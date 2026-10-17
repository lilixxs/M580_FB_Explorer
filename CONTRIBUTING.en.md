# Contributing

[简体中文](CONTRIBUTING.md) | [User guide](README.en.md)

## Development environment

- Use Node.js 22.12 or a later supported version.
- Use npm to install dependencies.
- Windows browser tests use Microsoft Edge.
- On other platforms, first run `npx playwright install chromium`.

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
node scripts/check-localized-docs.mjs
git diff --check
git status --short
```

The document check needs the current `dist/`. `npm run test:e2e` builds the application before the tests.

Report type checks, unit tests, browser tests, builds, and document checks separately. Control Expert import, compilation, and real PLC communication tests were not executed.

## Document update rules

### Single source

In-app help loads the root READMEs directly. Do not maintain help text copies in components or other directories.

| Language | Source file | Screenshot directory |
| --- | --- | --- |
| Simplified Chinese | `README.md` | `docs/images/zh-CN/` |
| English | `README.en.md` | `docs/images/en/` |
| Traditional Chinese | `README.zh-TW.md` | `docs/images/zh-TW/` |
| Japanese | `README.ja.md` | `docs/images/ja/` |
| Korean | `README.ko.md` | `docs/images/ko/` |

`src/data/helpContent.ts` only loads the text. `vite.config.ts` copies the READMEs and contribution guides with their original names and preserves screenshot paths.

### Feature changes

1. Update the requirements and boundaries in `docs/requirements.md`.
2. Update all five READMEs. Keep the same feature scope, procedures, and limitations.
3. Update affected labels in `src/locales/*.json`. Keep every key and named placeholder.
4. Check the referenced screenshots. Regenerate all five language sets when a UI change affects them.
5. Update both contribution guides when the development process or maintenance method changes.
6. Run the checks before a commit.

Maintain contribution guides in Simplified Chinese and English only. The root `CONTRIBUTING.md` uses the filename that GitHub recognizes for contribution guidelines.

### Links and screenshots

- Put relative links to all five READMEs at the top of each README.
- Use `README.md` for Simplified Chinese. Use the filenames in the table for other languages.
- Do not use absolute GitHub URLs, `dist/` paths, or `HELP.*.md` for language links.
- On GitHub, a language link opens the corresponding README. In help, it changes the interface language and text.
- Each README must reference five images of its own language: `workspace.png`, `new-block.png`, `variable-editor.png`, `type-picker.png`, and `call-browser.png`.
- Use `docs/images/<language>/<filename>.png`. Do not use the old `images/` prefix.
- Link to `CONTRIBUTING.md` or `CONTRIBUTING.en.md`. Do not link to `CONTRIBUTE.md`.
- Use active voice. Give one action per sentence. Keep technical terms consistent. Do not report unverified results as successful.

Use the built-in sample only for screenshots. Update screenshots and build output in this order:

```powershell
npm run build
npm run docs:screenshots
npm run build
node scripts/check-localized-docs.mjs
```

The document check verifies five-language navigation and button names. It checks key button labels against the locale files. It also checks matching-language images, all 25 image copies, and the built README and contribution-guide copies.

## Code rules

- Use TypeScript and the Vue 3 Composition API.
- Keep the type check passing.
- Keep the existing square-corner interface style.
- Add tests for user-visible behavior.
- Do not translate user source, variable names, comments, or XML format values.
- Do not add real PLC addresses, secrets, or user files to fixtures.
- Do not edit generated Control Expert files as the project source of truth.
- Keep the statement that Control Expert and real PLC tests were not executed.

## Function library and editor call maintenance

### Data boundaries

Libraries are in `src/data/functionLibraries/`. The loader is `src/core/functionLibrary.ts`. The editor and call dialog share JSON entries. Rebuild after a JSON change. The application does not download libraries from the network.

`base.json` is a legacy completion snapshot, not a complete official library. Communication functions are not part of the Standard Block Library.

- `src/data/reference/standard-catalogue.json` stores the official contents. Wildcard names are not insertable calls.
- `standard.json` stores verified common concrete functions.
- `definitions` in `types.json` stores descriptions, verification status, and source pages. Some legacy `variablePresets` remain unverified.

The library source is [33002519.20, September 2020](https://www.se.com/us/en/download/document/33002519K01000/), for Control Expert 15.0 or later. The type source is [35006144.27](https://www.se.com/us/en/download/document/35006144K01000/). These references do not verify Unity Pro V13.1 compatibility.

### Modify existing entries

1. Modify the relevant JSON `entries`. For legacy completions, also update `base.json` and `ST_FUNCTION_COMPLETIONS` in `src/core/st.ts`.
2. Set a `label` that is unique within its library.
3. Set `kind` to `ef`, `efb`, or `function`.
4. Record the signature and call rules in `detail`.
5. Keep Monaco snippet placeholders in `insertText`.
6. For call classification changes, check `BUILTIN_FUNCTIONS`, `isBuiltinFunction`, and `refreshCalls`.
7. For conversion recognition changes, check `CONVERSION_TYPE_NAMES` and `extractRawCalls`.
8. Do not add ordinary function names to `ST_KEYWORDS`. The parser recognizes official operator calls such as `AND(a, b)`.
9. Update `tests/st.test.ts`, `tests/help.test.ts`, and related browser tests.

Use the source-code sets as the canonical name lists. Do not copy complete lists into this guide.

### Add an external library

Add a JSON file to `src/data/functionLibraries/`. This directory accepts function manifests and the fixed `types.json` only. Put other references in `src/data/reference/`.

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

- `name` identifies the library. `version` identifies its version. `entries` stores the entries.
- Use a group from `LIBRARY_GROUPS`. Update the mapping when a new group is necessary.
- `source` records the official URL. `note` records the source, scope, and limitations.
- EFB `parameters` lists input pin names. `outputs` lists output names.
- External entries must not replace base-library entries with the same name.
- Templates support plain text, `$1`, `${1}`, and `${1:default}` only. Do not use nested or choice placeholders.
- Invalid bundled entries cause a module validation error.
- EFB completions retain the type name. The call dialog must use a declared instance or explicitly create one before insertion.
- Do not put real PLC addresses, secrets, or user-file content in JSON.

After adding a library, update completion, call-dialog, and call-analysis tests. Update requirements and all five READMEs, then run all checks.

### Modify variable types

- For presets, update `variablePresets` in `types.json`. Record platform limitations.
- For conversion recognition, update `conversionTypes`. `src/core/st.ts` uses that set.
- For 32-bit address rules, check `WIDE_TYPES` in `src/types.ts`.
- For arrays, check `baseTypeName`, `validateTypeName`, and `isWideType` in `src/core/validation.ts`.
- For type selection, update `src/components/VariableDialog.vue`.
- Do not reject custom types with an elementary-type allowlist.
- Preserve the `ARRAY[lower..upper] OF type` structure.

Add tests for valid types, arrays, invalid types, and address constraints after a change.

## Git rules

- Do not commit `node_modules/`, `dist/`, test results, caches, keys, or local AI-tool files.
- Use a clear commit message such as `docs: unify localized README and help`.
- Keep one topic per commit.

## Report an issue

Include these items:

1. Node.js and browser versions.
2. Reproduction steps.
3. Expected result.
4. Actual result.
5. Console errors or failed test names.
6. A minimal example file without sensitive information.
