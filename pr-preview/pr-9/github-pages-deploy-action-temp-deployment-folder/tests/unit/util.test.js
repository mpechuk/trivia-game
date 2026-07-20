import test from 'node:test';
import assert from 'node:assert/strict';
import { clamp, createEmitter, deepMerge, formatSeconds, sampleN, shuffle } from '../../js/util.js';

test('clamp bounds values', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-5, 0, 10), 0);
  assert.equal(clamp(15, 0, 10), 10);
});

test('shuffle keeps the same elements', () => {
  const src = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = shuffle(src.slice());
  assert.deepEqual([...out].sort((a, b) => a - b), src);
});

test('sampleN returns n distinct elements from the array', () => {
  const src = ['a', 'b', 'c', 'd'];
  const out = sampleN(src, 3);
  assert.equal(out.length, 3);
  assert.equal(new Set(out).size, 3);
  out.forEach((x) => assert.ok(src.includes(x)));
  // n larger than array length caps at array length
  assert.equal(sampleN(src, 10).length, 4);
});

test('deepMerge: src wins, nested objects merge, arrays replace wholesale', () => {
  const base = { a: 1, nested: { x: 1, y: 2 }, arr: [1, 2, 3], keep: 'yes' };
  const src = { a: 2, nested: { y: 9, z: 3 }, arr: [7] };
  const out = deepMerge(base, src);
  assert.equal(out.a, 2);
  assert.equal(out.keep, 'yes');
  assert.deepEqual(out.nested, { x: 1, y: 9, z: 3 });
  assert.deepEqual(out.arr, [7]);
  // originals untouched
  assert.equal(base.a, 1);
  assert.deepEqual(base.nested, { x: 1, y: 2 });
});

test('deepMerge: null overrides, undefined keeps base', () => {
  assert.equal(deepMerge({ a: 1 }, { a: null }).a, null);
  assert.equal(deepMerge(5, undefined), 5);
  assert.equal(deepMerge({ a: 1 }, 'str'), 'str');
});

test('createEmitter delivers events and unsubscribes', () => {
  const em = createEmitter();
  const seen = [];
  const off = em.on('x', (d) => seen.push(d));
  em.emit('x', 1);
  off();
  em.emit('x', 2);
  assert.deepEqual(seen, [1]);
});

test('createEmitter isolates listener errors', () => {
  const em = createEmitter();
  const seen = [];
  em.on('x', () => { throw new Error('boom'); });
  em.on('x', (d) => seen.push(d));
  em.emit('x', 'ok'); // must not throw
  assert.deepEqual(seen, ['ok']);
});

test('formatSeconds renders countdown text', () => {
  assert.equal(formatSeconds(null), '∞');
  assert.equal(formatSeconds(30), '30');
  assert.equal(formatSeconds(90), '1:30');
  assert.equal(formatSeconds(0), '0');
});
