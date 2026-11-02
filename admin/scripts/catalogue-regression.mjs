// Parse every Markdown catalogue item with the same gray-matter version used
// by the Brain. A malformed frontmatter field can otherwise break a plugin
// detail page when it is loaded alongside the other items.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import matter from 'gray-matter';

const root = resolve(import.meta.dirname, '../..');
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
console.log(`catalogue frontmatter checks passed (${checked} files)`);
