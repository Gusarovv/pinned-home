import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWebUrl, matchTabs, type PinRecord } from '../src/match.ts';

function pin(id: string, homeUrl: string, lastUrl: string, index: number): PinRecord {
  return { id, homeUrl, lastUrl, index };
}

test('isWebUrl accepts only http and https', () => {
  assert.equal(isWebUrl('https://a.com/'), true);
  assert.equal(isWebUrl('http://a.com/'), true);
  assert.equal(isWebUrl('vivaldi://settings'), false);
  assert.equal(isWebUrl(''), false);
  assert.equal(isWebUrl(undefined), false);
});

test('records with the same lastUrl are told apart by the nearest index', () => {
  const pairs = matchTabs(
    [
      { id: 11, url: 'https://github.com/', index: 1 },
      { id: 10, url: 'https://github.com/', index: 0 },
    ],
    [
      pin('b', 'https://github.com/org-b', 'https://github.com/', 1),
      pin('a', 'https://github.com/org-a', 'https://github.com/', 0),
    ],
  );
  assert.equal(pairs.get(10), 'a');
  assert.equal(pairs.get(11), 'b');
});

test('matchTabs falls back to a hostname match', () => {
  const pairs = matchTabs(
    [{ id: 10, url: 'https://mail.example.com/login', index: 0 }],
    [pin('r1', 'https://mail.example.com/inbox', 'https://mail.example.com/inbox/42', 0)],
  );
  assert.equal(pairs.get(10), 'r1');
});

test('exact matches for all tabs win over the hostname fallback', () => {
  // Tab 10 would match r2 by hostname, but r2 is an exact match for tab 11
  const pairs = matchTabs(
    [
      { id: 10, url: 'https://docs.example.com/x', index: 0 },
      { id: 11, url: 'https://docs.example.com/b', index: 1 },
    ],
    [
      pin('r2', 'https://docs.example.com/home', 'https://docs.example.com/b', 0),
      pin('r1', 'https://docs.example.com/a', 'https://docs.example.com/a', 5),
    ],
  );
  assert.equal(pairs.get(11), 'r2');
  assert.equal(pairs.get(10), 'r1');
});

test('a tab without candidates stays unbound', () => {
  const pairs = matchTabs(
    [{ id: 10, url: 'https://other.com/', index: 0 }],
    [pin('r1', 'https://a.com/', 'https://a.com/', 0)],
  );
  assert.equal(pairs.size, 0);
});
