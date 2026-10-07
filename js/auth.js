// Microsoft sign-in (OAuth 2.0 authorization code + PKCE for single-page apps).
// No external library needed. Tokens are kept in localStorage on this device.
import { CONFIG } from './config.js';

const SCOPES = 'openid profile offline_access User.Read Files.ReadWrite.All';
const LS = 'acqc.auth';
const LS_PKCE = 'acqc.pkce';

const authority = () => `https://login.microsoftonline.com/${CONFIG.tenantId || 'organizations'}/oauth2/v2.0`;
const redirectUri = () => location.origin + location.pathname;

function b64url(bytes) {
  let s = '';
  bytes.forEach(b => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randomString(n = 48) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return b64url(a);
}
function decodeJwt(t) {
  try {
    const p = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(p))));
  } catch { return {}; }
}

function load() { try { return JSON.parse(localStorage.getItem(LS)) || null; } catch { return null; } }
function save(s) { localStorage.setItem(LS, JSON.stringify(s)); }

export function account() {
  const s = load();
  return s ? s.account : null;
}

export async function login() {
  const verifier = randomString(64);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const state = randomString(16);
  localStorage.setItem(LS_PKCE, JSON.stringify({ verifier, state, returnHash: location.hash || '#/' }));
  const acc = account();
  const q = new URLSearchParams({
    client_id: CONFIG.clientId,
    response_type: 'code',
    redirect_uri: redirectUri(),
    response_mode: 'query',
    scope: SCOPES,
    state,
    code_challenge: b64url(new Uint8Array(digest)),
    code_challenge_method: 'S256',
  });
  if (acc && acc.username) q.set('login_hint', acc.username);
  location.assign(`${authority()}/authorize?${q}`);
  return new Promise(() => {}); // page navigates away
}

export function logout() {
  localStorage.removeItem(LS);
  const q = new URLSearchParams({ post_logout_redirect_uri: redirectUri() });
  location.assign(`${authority()}/logout?${q}`);
}

async function tokenRequest(params) {
  const body = new URLSearchParams({ client_id: CONFIG.clientId, scope: SCOPES, ...params });
  const r = await fetch(`${authority()}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const j = await r.json();
  if (!r.ok) {
    const e = new Error(j.error_description || j.error || 'Token request failed');
    e.code = j.error;
    throw e;
  }
  const prev = load() || {};
  const idc = j.id_token ? decodeJwt(j.id_token) : null;
  const s = {
    accessToken: j.access_token,
    expiresAt: Date.now() + (j.expires_in - 120) * 1000,
    refreshToken: j.refresh_token || prev.refreshToken,
    account: idc ? { name: idc.name, username: idc.preferred_username, oid: idc.oid } : prev.account,
  };
  save(s);
  return s;
}

// Call once at startup. Completes a sign-in when we come back from Microsoft.
// Returns the hash route to continue with (or null).
export async function handleRedirect() {
  const p = new URLSearchParams(location.search);
  if (!p.has('code') && !p.has('error')) return null;
  const pk = JSON.parse(localStorage.getItem(LS_PKCE) || '{}');
  localStorage.removeItem(LS_PKCE);
  history.replaceState(null, '', location.pathname + (pk.returnHash || '#/'));
  if (p.has('error')) throw new Error(p.get('error_description') || p.get('error'));
  if (!pk.state || p.get('state') !== pk.state) throw new Error('Sign-in state mismatch, please try again.');
  await tokenRequest({
    grant_type: 'authorization_code',
    code: p.get('code'),
    redirect_uri: redirectUri(),
    code_verifier: pk.verifier,
  });
  return pk.returnHash || '#/';
}

let refreshing = null;
// Returns a valid access token, refreshing it when needed. If the session has
// fully expired this redirects to the Microsoft sign-in page.
export async function getToken({ interactive = true } = {}) {
  const s = load();
  if (s && s.accessToken && s.expiresAt > Date.now()) return s.accessToken;
  if (s && s.refreshToken) {
    try {
      refreshing = refreshing || tokenRequest({ grant_type: 'refresh_token', refresh_token: s.refreshToken });
      const n = await refreshing;
      return n.accessToken;
    } catch (e) {
      if (e instanceof TypeError) throw e; // offline – keep tokens
    } finally {
      refreshing = null;
    }
  }
  if (interactive) return login();
  throw new Error('Not signed in');
}

export function isSignedIn() {
  const s = load();
  return !!(s && (s.refreshToken || (s.accessToken && s.expiresAt > Date.now())));
}
