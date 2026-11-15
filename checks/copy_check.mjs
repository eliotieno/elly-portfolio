// Fail if the built pages contain an em dash or a word from the human-writing banned list.
//   node checks/copy_check.mjs      (run after `npm run build`)
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BANNED = [
  'delve', 'tapestry', 'testament', 'boasts', 'vibrant', 'intricate', 'interplay', 'pivotal', 'crucial', 'vital',
  'meticulous', 'meticulously', 'underscore', 'underscores', 'garner', 'bolster', 'foster', 'fostering', 'showcase',
  'showcasing', 'leverage', 'enduring', 'landscape', 'realm', 'journey', 'embark', 'elevate', 'seamless', 'seamlessly',
  'robust', 'holistic', 'synergy', 'groundbreaking', 'renowned', 'nestled', 'profound', 'resonate', 'empower',
  'unleash', 'unlock', 'harness', 'game-changer', 'transformative', 'cutting-edge', 'state-of-the-art', 'moreover',
  'furthermore', 'additionally', 'notably', 'stands as', 'serves as', 'not just', 'not only',
];

const pages = readdirSync('dist', { recursive: true }).filter((f) => f.endsWith('.html'));
if (!pages.length) {
  console.error('SKIPPED, not passed: no html in dist/, run `npm run build` first');
  process.exit(1);
}

let problems = 0;
for (const page of pages) {
  const html = readFileSync(join('dist', page), 'utf8');
  // Visible text only: drop scripts, styles and tags.
  const text = html.replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ');
  const hits = [];
  if (html.includes('—')) hits.push('em dash');
  for (const word of BANNED) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(text)) hits.push(word);
  }
  if (hits.length) {
    problems += hits.length;
    console.error(`${page}: ${hits.join(', ')}`);
  }
}
console.log(`${pages.length} pages checked, ${problems} problems`);
process.exit(problems ? 1 : 0);
