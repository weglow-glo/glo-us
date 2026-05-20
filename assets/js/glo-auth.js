/* ============================================================
   glo — shared authentication module.

   Single source of truth for everything Kakao-login + Supabase
   session related across all KR pages. Each page just imports
   what it needs:

     import { getProfile, signInWithKakao, signOut } from '/assets/js/glo-auth.js';

   The module also auto-runs nav-swap on every page that loads
   it: if the visitor has a Supabase session, the 'login' link in
   the nav becomes a user-name dropdown with mypage + logout.

   Publishable key — designed for client-side exposure. Row-Level
   Security on Supabase tables protects actual data.
   ============================================================ */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://fxsxljkozxlyqxwtudpc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_vEZyOwm3d3p__J6X-u9kwQ_P3GbWOtj';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/* ------------------------------------------------------------
   getProfile() — normalize the Kakao + Supabase auth payload
   into a flat object the UI can use directly.
   ------------------------------------------------------------ */
export async function getProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const meta = user.user_metadata || {};
  const addr = (meta.shipping_addresses && meta.shipping_addresses[0])
            || meta.shipping_address
            || null;

  return {
    id: user.id,
    createdAt: user.created_at,
    email: user.email || meta.email || null,
    nickname: meta.nickname || meta.preferred_username || meta.full_name || meta.name || null,
    name: meta.name || meta.full_name || null,
    phone: meta.phone || meta.phone_number || user.phone || null,
    avatar: meta.avatar_url || meta.picture || null,
    address: addr ? {
      label: addr.name || addr.address_name || null,
      receiver: addr.receiver_name || addr.receiver || null,
      base: addr.base_address || addr.baseAddress || addr.address || null,
      detail: addr.detail_address || addr.detailAddress || null,
      zone: addr.zone_number || addr.zoneNumber || addr.zip_code || null,
      phone: addr.receiver_phone_number1 || addr.receiver_phone_number || addr.phone || null,
    } : null,
    /* raw metadata kept for debugging / future fields */
    _raw: meta,
  };
}

/* ------------------------------------------------------------
   signInWithKakao(redirectTo) — kick off the OAuth flow.

   Supabase's gotrue backend auto-includes these default Kakao
   scopes: account_email, profile_image, profile_nickname.
   We only add the additional approved scopes on top.

   Name + shipping_address are not collected at signup — the
   user will provide them at checkout instead.
   ------------------------------------------------------------ */
export async function signInWithKakao(redirectTo) {
  const target = redirectTo
              || (typeof window !== 'undefined'
                    ? window.location.origin + '/ko/account.html'
                    : 'https://glo-us.com/ko/account.html');

  return supabase.auth.signInWithOAuth({
    provider: 'kakao',
    options: {
      redirectTo: target,
      scopes: 'phone_number',
    },
  });
}

/* ------------------------------------------------------------
   signOut() — clear local session + Supabase remote session.
   ------------------------------------------------------------ */
export async function signOut() {
  return supabase.auth.signOut();
}

/* ------------------------------------------------------------
   onAuthChange(cb) — pass-through to Supabase auth listener.
   ------------------------------------------------------------ */
export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback({ event, session, user: session ? session.user : null });
  });
}

/* ------------------------------------------------------------
   Nav swap — turn the login link into a user dropdown if there
   is an active session.  Idempotent: safe to call repeatedly.
   ------------------------------------------------------------ */
let stylesInjected = false;

function injectDropdownStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.id = 'glo-auth-styles';
  style.textContent = `
    .user-menu{position:relative;display:inline-flex;}
    .user-trigger{background:transparent;border:none;font-family:inherit;font-size:13px;font-weight:500;color:var(--ink-soft,#2a121899);padding:10px 18px;border-radius:100px;cursor:pointer;transition:color .2s;letter-spacing:-.01em;white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis;}
    .user-trigger:hover{color:var(--ink,#2a1218);}
    .user-trigger:focus-visible{outline:2px solid var(--accent,#8a4a52);outline-offset:2px;}
    .user-dropdown{position:absolute;top:calc(100% + 10px);right:0;min-width:180px;background:rgba(255,250,250,.96);backdrop-filter:saturate(180%) blur(20px);-webkit-backdrop-filter:saturate(180%) blur(20px);border:1px solid rgba(212,181,181,.42);border-radius:14px;padding:6px;box-shadow:0 16px 40px rgba(58,26,34,.12),0 4px 12px rgba(58,26,34,.06);display:none;flex-direction:column;z-index:60;}
    .user-dropdown.is-open{display:flex;}
    .user-dropdown a,.user-dropdown button{display:block;width:100%;text-align:left;padding:10px 14px;font-size:13px;font-weight:500;color:var(--ink-soft,#2a121899);background:transparent;border:none;font-family:inherit;cursor:pointer;border-radius:8px;transition:background .15s,color .15s;letter-spacing:-.01em;text-decoration:none;}
    .user-dropdown a:hover,.user-dropdown button:hover{background:rgba(243,234,234,.7);color:var(--ink,#2a1218);}
    .user-dropdown .user-logout{color:var(--burg-400,#5a2229);border-top:1px solid rgba(42,18,24,.08);margin-top:4px;padding-top:12px;border-radius:0 0 8px 8px;}
  `;
  document.head.appendChild(style);
}

async function attachNav() {
  const navR = document.querySelector('.nav-r');
  if (!navR) return;

  const profile = await getProfile();

  /* Find the login link OR the static '회원 ▼' placeholder on the
     account page. Matches:
       - text exactly '로그인'
       - href ending with /login.html
       - href ending with /account.html (placeholder before swap)
       - text containing a dropdown caret (▾ / ▼ — leftover state) */
  const links = Array.from(navR.querySelectorAll('a'));
  const loginLink = links.find(a => {
    if (a.classList.contains('btn-nav')) return false;
    const txt = (a.textContent || '').trim();
    const href = a.getAttribute('href') || '';
    return txt === '로그인'
        || href.endsWith('/login.html')
        || href.endsWith('/account.html')
        || /[▾▼]/.test(txt);
  });
  const existingMenu = navR.querySelector('.user-menu');

  if (profile) {
    /* Logged in — replace login link with user dropdown */
    injectDropdownStyles();
    const displayName = profile.nickname || '회원';

    const menu = document.createElement('div');
    menu.className = 'user-menu';
    menu.innerHTML = `
      <button class="user-trigger" type="button" aria-haspopup="menu" aria-expanded="false">${escapeHtml(displayName)} ▾</button>
      <div class="user-dropdown" role="menu">
        <a href="/ko/account.html" role="menuitem">마이페이지</a>
        <a href="/ko/account.html#subscription" role="menuitem">정기구독</a>
        <button type="button" class="user-logout" role="menuitem">로그아웃</button>
      </div>
    `;

    if (loginLink) {
      loginLink.replaceWith(menu);
    } else if (existingMenu) {
      existingMenu.replaceWith(menu);
    } else {
      /* Fallback: prepend to nav-r */
      navR.insertBefore(menu, navR.firstChild);
    }

    const trigger = menu.querySelector('.user-trigger');
    const dropdown = menu.querySelector('.user-dropdown');

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = dropdown.classList.toggle('is-open');
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    document.addEventListener('click', () => {
      dropdown.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
    });

    menu.querySelector('.user-logout').addEventListener('click', async () => {
      await signOut();
      window.location.href = '/ko/';
    });
  } else if (existingMenu) {
    /* Logged out but stale menu exists — swap back to login link */
    const a = document.createElement('a');
    a.href = '/ko/login.html';
    a.textContent = '로그인';
    existingMenu.replaceWith(a);
  }
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* Run nav swap on DOMContentLoaded + re-run on every auth change */
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachNav);
  } else {
    attachNav();
  }
  onAuthChange(() => attachNav());
}

export { attachNav };
