// Unit tests for the CSS/compose/validate utilities.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitRules, dedupeCss, mergeRootTokens, validateCss, referencedTokens, definedTokens } from '../utils/css.js';
import { validateFacet } from '../utils/validate.js';

test('splitRules handles @keyframes with nested braces', () => {
  const css = '.a{color:red}@keyframes k{0%{opacity:0}100%{opacity:1}}.b{color:blue}';
  const rules = splitRules(css);
  assert.equal(rules.length, 3);
  assert.ok(rules[1].text.startsWith('@keyframes k'));
});

test('splitRules strips comments', () => {
  const rules = splitRules('/* hi */ .a{color:red}');
  assert.equal(rules.length, 1);
  assert.ok(!rules[0].text.includes('hi'));
});

test('dedupeCss removes formatting-insensitive duplicates', () => {
  const r = dedupeCss(['.a { color: red; }', '.a{color:red}']);
  assert.equal(r.rulesOut, 1);
  assert.equal(r.duplicatesRemoved, 1);
});

test('mergeRootTokens collapses multiple :root, last wins', () => {
  const r = mergeRootTokens(':root{--a:1;--b:2}\n.x{color:red}\n:root{--b:9;--c:3}');
  const rootCount = (r.css.match(/:root\{/g) || []).length;
  assert.equal(rootCount, 1);
  assert.ok(r.css.includes('--b:9'));
  assert.ok(r.css.includes('--c:3'));
  assert.ok(r.css.includes('.x{color:red}'));
});

test('validateCss detects unbalanced braces', () => {
  assert.equal(validateCss('.a{color:red}').valid, true);
  assert.equal(validateCss('.a{color:red').valid, false);
  assert.equal(validateCss('.a{color:red}}').valid, false);
});

test('validateCss ignores braces inside string literals', () => {
  // A literal { or } in a content:"" value is not a block delimiter.
  assert.equal(validateCss('.a::before{content:"{"}').valid, true);
  assert.equal(validateCss('.a::before{content:"}"}').valid, true);
  assert.equal(validateCss('.a::before{content:"{}"}\n.b{color:var(--ink)}').valid, true);
  // escaped quote inside the string must not prematurely close it
  assert.equal(validateCss('.a::before{content:"\\"{"}').valid, true);
  // a genuinely unbalanced brace OUTSIDE a string is still caught
  assert.equal(validateCss('.a::before{content:"{"').valid, false);
});

test('splitRules ignores braces inside string literals', () => {
  const rules = splitRules('.a::before{content:"{"}\n.b{color:var(--ink)}');
  assert.equal(rules.length, 2, 'a brace inside content:"" must not split the rule');
  assert.ok(rules[0].text.includes('content:"{"'));
  assert.ok(rules[1].text.includes('--ink'));
  // close-brace form used to mis-split into garbage rules
  const closed = splitRules('.a::after{content:"}"}\n.b{color:red}');
  assert.equal(closed.length, 2);
});

test('referencedTokens / definedTokens', () => {
  const css = '.a{--local:1;color:var(--ink);background:var(--local)}';
  assert.ok(referencedTokens(css).has('--ink'));
  assert.ok(referencedTokens(css).has('--local'));
  assert.ok(definedTokens(css).has('--local'));
  assert.ok(!definedTokens(css).has('--ink'));
});

test('validateFacet enforces kebab-case id', () => {
  const bad = validateFacet({ id: 'Bad_Id', name: 'x', gallery: 'charts', html: '<i></i>' });
  assert.ok(bad.errors.some((e) => e.includes('kebab-case')));
  const good = validateFacet({ id: 'charts-good-id', name: 'x', gallery: 'charts', html: '<i></i>', description: 'long enough desc' });
  assert.equal(good.checks.id, true);
});
