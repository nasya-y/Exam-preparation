import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyAuth } from '../auth-kind.mjs';

const pro = { loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty' };

test('Claude Pro вход без API ключ → subscription', () => {
  assert.deepEqual(classifyAuth(pro, {}), { authKind: 'subscription', apiKeyVar: null, loggedIn: true });
});

test('ANTHROPIC_API_KEY има предимство пред Claude Pro (както в Claude Code)', () => {
  const r = classifyAuth(pro, { ANTHROPIC_API_KEY: 'sk-ant-whatever' });
  assert.equal(r.authKind, 'apiKey');
  assert.equal(r.apiKeyVar, 'ANTHROPIC_API_KEY');
  assert.ok(!JSON.stringify(r).includes('sk-ant'), 'стойността на ключа не се връща');
});

test('ANTHROPIC_AUTH_TOKEN също е API вход и е преди ANTHROPIC_API_KEY', () => {
  assert.equal(classifyAuth(pro, { ANTHROPIC_AUTH_TOKEN: 'x', ANTHROPIC_API_KEY: 'y' }).apiKeyVar, 'ANTHROPIC_AUTH_TOKEN');
});

test('празен или „0“ ключ не се брои', () => {
  assert.equal(classifyAuth(pro, { ANTHROPIC_API_KEY: '   ' }).authKind, 'subscription');
  assert.equal(classifyAuth(pro, { CLAUDE_CODE_USE_BEDROCK: '0' }).authKind, 'subscription');
});

test('API ключ, запазен от Console вход → apiKey', () => {
  assert.equal(classifyAuth({ loggedIn: true, authMethod: 'oauth_token', hasApiKeySource: true }, {}).authKind, 'apiKey');
});

test('облачен доставчик → cloud', () => {
  assert.equal(classifyAuth(pro, { CLAUDE_CODE_USE_BEDROCK: '1' }).authKind, 'cloud');
  assert.equal(classifyAuth({ loggedIn: true, apiProvider: 'vertex' }, {}).authKind, 'cloud');
});

test('без вход и без ключ → none', () => {
  assert.deepEqual(classifyAuth({ loggedIn: false }, {}), { authKind: 'none', apiKeyVar: null, loggedIn: false });
  assert.equal(classifyAuth(null, {}).authKind, 'none');
});
