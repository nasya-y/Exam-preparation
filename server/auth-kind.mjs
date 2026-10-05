/* =====================================================================
   Кой начин за вход ще използва Claude Code — само етикет, без данни.

   Ред на предимство според документацията на Claude Code
   (https://code.claude.com/docs/en/authentication#authentication-precedence):
   облачен доставчик → ANTHROPIC_AUTH_TOKEN → ANTHROPIC_API_KEY → apiKeyHelper
   → CLAUDE_CODE_OAUTH_TOKEN → … → вход с Claude абонамент (/login).
   В неинтерактивен режим (какъвто ползва Agent SDK) API ключът се използва
   ВИНАГИ, когато е зададен — дори ако има вход с Claude Pro.

   Функцията връща само вида на входа и ИМЕТО на променливата — никога стойности.
   ===================================================================== */
const CLOUD_VARS = ['CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'CLAUDE_CODE_USE_ANTHROPIC_AWS'];
const isSet = (v) => typeof v === 'string' && v.trim() !== '' && v.trim() !== '0' && v.trim().toLowerCase() !== 'false';

/**
 * @param {{loggedIn?: boolean, authMethod?: string, apiProvider?: string, hasApiKeySource?: boolean}} cli — от `claude auth status`
 * @param {Record<string,string|undefined>} env — средата, с която се стартира Claude Code
 * @returns {{authKind: 'subscription'|'apiKey'|'cloud'|'none', apiKeyVar: string|null, loggedIn: boolean}}
 */
export function classifyAuth(cli, env) {
  const c = cli || {};
  if (CLOUD_VARS.some((k) => isSet(env[k])) || (c.apiProvider && c.apiProvider !== 'firstParty')) {
    return { authKind: 'cloud', apiKeyVar: null, loggedIn: true };
  }
  if (isSet(env.ANTHROPIC_AUTH_TOKEN)) return { authKind: 'apiKey', apiKeyVar: 'ANTHROPIC_AUTH_TOKEN', loggedIn: true };
  if (isSet(env.ANTHROPIC_API_KEY)) return { authKind: 'apiKey', apiKeyVar: 'ANTHROPIC_API_KEY', loggedIn: true };
  const m = String(c.authMethod || '').toLowerCase();
  if (c.loggedIn && (c.hasApiKeySource || /api.?key/.test(m))) return { authKind: 'apiKey', apiKeyVar: null, loggedIn: true };
  if (c.loggedIn) return { authKind: 'subscription', apiKeyVar: null, loggedIn: true };
  return { authKind: 'none', apiKeyVar: null, loggedIn: false };
}
