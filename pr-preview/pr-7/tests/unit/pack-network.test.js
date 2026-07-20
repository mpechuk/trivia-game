import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

// TURN credentials live in the git-ignored data/turn.local.json, never in
// checked-in files. Guards against a credential ever being committed again
// (data/*.local.json is git-ignored and turn.example.json holds only
// placeholders, so both are exempt).
test('checked-in data files contain no TURN credentials', async () => {
  const dir = new URL('../../data/', import.meta.url);
  const files = (await readdir(dir)).filter(
    (f) => f.endsWith('.json') && !f.endsWith('.local.json') && f !== 'turn.example.json'
  );
  assert.ok(files.length > 0, 'no data files found');
  for (const f of files) {
    const text = await readFile(new URL(f, dir), 'utf8');
    assert.ok(!text.includes('"credential"'), `${f} contains a "credential" field`);
    assert.ok(!text.includes('"username"'), `${f} contains a "username" field`);
  }
});

test('the example TURN config parses and holds only placeholders', async () => {
  const example = JSON.parse(
    await readFile(new URL('../../data/turn.example.json', import.meta.url), 'utf8')
  );
  assert.ok(Array.isArray(example.iceServers) && example.iceServers.length > 0);
  for (const s of example.iceServers) {
    assert.match(s.username, /^YOUR_/, 'example must not contain a real username');
    assert.match(s.credential, /^YOUR_/, 'example must not contain a real credential');
  }
});
