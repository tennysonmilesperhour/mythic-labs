// Parse every Markdown catalogue item with the same gray-matter version used
// by the Brain. A malformed frontmatter field can otherwise break a plugin
// detail page when it is loaded alongside the other items.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import matter from 'gray-matter';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '../..');
const helperSource = await readFile(join(root, 'admin/lib/frontmatter.ts'), 'utf8');
const helperJs = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const helperModule = { exports: {} };
new Function('require', 'module', 'exports', helperJs)(
  createRequire(import.meta.url), helperModule, helperModule.exports,
);
const { parseCatalogFrontmatter } = helperModule.exports;
const marketplace = JSON.parse(await readFile(join(root, '.claude-plugin/marketplace.json'), 'utf8'));
let checked = 0;
const failures = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.isFile() && entry.name.endsWith('.md')) {
      const content = await readFile(path, 'utf8');
      try {
        const parsed = matter(content);
        if (entry.name === 'SKILL.md') {
          assert.equal(typeof parsed.data.name, 'string', `${path}: missing frontmatter name`);
          assert.equal(typeof parsed.data.description, 'string', `${path}: missing frontmatter description`);
          assert.ok(parsed.data.description.length > 0, `${path}: empty frontmatter description`);
        }
      } catch (error) {
        failures.push(`${path}: invalid Markdown frontmatter: ${error.message}`);
      }
      checked++;
    }
  }
}

for (const plugin of marketplace.plugins) {
  const source = plugin.source.replace(/^\.\//, '');
  await walk(join(root, source));
}

assert.ok(checked > 0, 'expected Markdown catalogue files to be checked');
assert.deepEqual(failures, [], failures.join('\n'));
const valid = parseCatalogFrontmatter('---\nname: valid\ndescription: "A valid: description"\n---\n', 'valid.md');
assert.equal(valid.name, 'valid');
assert.equal(valid.description, 'A valid: description');
const malformed = parseCatalogFrontmatter('---\nname: broken\ndescription: A broken: description\n---\n', 'broken.md');
assert.deepEqual(malformed, {}, 'malformed metadata should fall back without throwing');
console.log(`catalogue frontmatter checks passed (${checked} files)`);
