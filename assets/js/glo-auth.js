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

   channel_public_id surfaces a 'glo 카카오톡 채널 추가' checkbox
   on the consent screen (default-checked). Users who don't
   uncheck it become channel friends as part of signup, which
   is the path we'll use to broadcast the 50% launch discount.
   ------------------------------------------------------------ */
const GLO_KAKAO_CHANNEL_ID = '_VvUsX';

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
      queryParams: {
        channel_public_id: GLO_KAKAO_CHANNEL_ID,
      },
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

/* ============================================================
   EARLY-BIRD APPLICATION
   ============================================================ */

/* Check whether the current user has already applied for early-bird.
   Returns { applied: bool, appliedAt: string|null, user: object|null }. */
export async function getEarlyBirdStatus() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { applied: false, user: null };

  const { data, error } = await supabase
    .from('early_bird_applications')
    .select('id, applied_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('[glo] earlybird status check failed:', error);
    return { applied: false, user, error };
  }
  return { applied: !!data, appliedAt: data ? data.applied_at : null, user };
}

/* Insert an early-bird application for the current user.
   Returns { ok: true, data } on success
        OR { ok: false, already: true } if user already applied
        OR throws on other errors. */
export async function applyForEarlyBird() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not_authenticated');

  const meta = user.user_metadata || {};
  const row = {
    user_id: user.id,
    kakao_nickname: meta.nickname || meta.preferred_username || meta.full_name || meta.name || null,
    kakao_email: user.email || meta.email || null,
    kakao_phone: meta.phone || meta.phone_number || null,
    kakao_user_id: meta.sub || meta.provider_id || null,
    user_metadata: meta,
  };

  const { data, error } = await supabase
    .from('early_bird_applications')
    .insert(row)
    .select()
    .single();

  if (error) {
    /* 23505 = unique_violation — user already applied */
    if (error.code === '23505') return { ok: false, already: true };
    throw error;
  }
  return { ok: true, data };
}

/* ============================================================
   MODAL — centered, frosted-glass card.
   showGloModal({ icon, title, body, cta, onClose })
   ============================================================ */

let modalInjected = false;

function injectModal() {
  if (modalInjected) return;
  modalInjected = true;

  const el = document.createElement('div');
  el.id = 'glo-modal';
  el.className = 'glo-modal';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <div class="glo-modal-backdrop" data-close></div>
    <div class="glo-modal-card" role="dialog" aria-modal="true" aria-labelledby="glo-modal-title">
      <button class="glo-modal-close" type="button" aria-label="닫기" data-close>&times;</button>
      <div class="glo-modal-icon" aria-hidden="true"></div>
      <h2 class="glo-modal-title" id="glo-modal-title"></h2>
      <p class="glo-modal-body"></p>
      <a class="glo-modal-cta-primary" target="_blank" rel="noopener" style="display:none;">
        <svg class="glo-modal-cta-icon" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="#191919" d="M9 0.5C4.0294 0.5 0 3.694 0 7.625c0 2.5443 1.6731 4.7775 4.1719 6.029-.1813.6797-.661 2.474-.7563 2.864-.119.4856.1781.4794.375.349.1545-.1025 2.4575-1.668 3.453-2.346.5719.0848 1.1656.13 1.7563.13 4.9706 0 9-3.194 9-7.125S13.9706 0.5 9 0.5z"/></svg>
        <span class="glo-modal-cta-primary-label"></span>
      </a>
      <button class="glo-modal-cta" type="button" data-close>확인</button>
    </div>
  `;
  document.body.appendChild(el);

  /* Wire close handlers (backdrop, X, CTA button, Esc) */
  el.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', hideGloModal);
  });
  /* Primary CTA closes modal after a moment so the new tab opens */
  el.querySelector('.glo-modal-cta-primary').addEventListener('click', () => {
    setTimeout(hideGloModal, 200);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && el.classList.contains('is-open')) hideGloModal();
  });

  const style = document.createElement('style');
  style.id = 'glo-modal-styles';
  style.textContent = `
    .glo-modal{position:fixed;inset:0;z-index:1000;display:none;align-items:center;justify-content:center;padding:24px;font-family:'Inter','Pretendard Variable',Pretendard,sans-serif;}
    .glo-modal.is-open{display:flex;}
    .glo-modal-backdrop{position:absolute;inset:0;background:rgba(42,18,24,.5);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:gloFadeIn .35s ease forwards;}
    .glo-modal-card{position:relative;z-index:1;background:linear-gradient(180deg,rgba(255,250,250,.98) 0%,rgba(243,234,234,.96) 100%);backdrop-filter:saturate(180%) blur(20px);-webkit-backdrop-filter:saturate(180%) blur(20px);border:1px solid rgba(212,181,181,.45);border-radius:22px;padding:56px 40px 36px;max-width:440px;width:100%;text-align:center;box-shadow:0 32px 80px rgba(58,26,34,.25),0 8px 24px rgba(58,26,34,.12),inset 0 1px 0 rgba(255,255,255,.6);animation:gloCardIn .5s cubic-bezier(.34,1.18,.64,1) forwards;}
    .glo-modal-close{position:absolute;top:14px;right:14px;background:transparent;border:none;font-size:26px;line-height:1;color:rgba(42,18,24,.42);cursor:pointer;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;transition:background .15s,color .15s;font-family:inherit;}
    .glo-modal-close:hover{background:rgba(42,18,24,.08);color:rgba(42,18,24,.85);}
    .glo-modal-close:focus-visible{outline:2px solid #8a4a52;outline-offset:2px;}
    .glo-modal-icon{font-size:60px;margin-bottom:10px;line-height:1;letter-spacing:-1px;}
    .glo-modal-title{font-family:'Fraunces','Noto Serif KR',serif;font-weight:400;font-size:28px;line-height:1.35;letter-spacing:-.5px;color:#2a1218;margin:0 0 16px;}
    .glo-modal-title em{font-style:normal;color:#8a4a52;font-weight:500;}
    .glo-modal-body{font-size:14.5px;line-height:1.8;color:rgba(42,18,24,.78);margin:0 0 30px;letter-spacing:-.01em;}
    .glo-modal-body b{color:#8a4a52;font-weight:700;}
    .glo-modal-cta-primary{display:none;align-items:center;justify-content:center;gap:8px;background:#FEE500;color:rgba(0,0,0,.85);border:none;padding:15px 28px;font-family:inherit;font-size:14.5px;font-weight:700;border-radius:12px;cursor:pointer;letter-spacing:-.02em;text-decoration:none;transition:background .18s,transform .12s,box-shadow .18s;box-shadow:0 8px 24px rgba(254,229,0,.22),0 2px 6px rgba(0,0,0,.06);margin-bottom:12px;}
    .glo-modal-cta-primary[href]{display:inline-flex;}
    .glo-modal-cta-primary:hover{background:#FDDC00;transform:translateY(-1px);box-shadow:0 12px 30px rgba(254,229,0,.28),0 4px 10px rgba(0,0,0,.08);}
    .glo-modal-cta-primary:focus-visible{outline:3px solid rgba(254,229,0,.55);outline-offset:2px;}
    .glo-modal-cta-icon{width:18px;height:18px;flex-shrink:0;}
    .glo-modal-cta{background:transparent;color:rgba(42,18,24,.5);border:none;padding:6px 16px;font-family:inherit;font-size:13px;font-weight:500;border-radius:100px;cursor:pointer;letter-spacing:-.01em;transition:color .2s,background .2s;}
    .glo-modal-cta:hover{color:rgba(42,18,24,.85);background:rgba(42,18,24,.05);}
    .glo-modal-cta:focus-visible{outline:2px solid #8a4a52;outline-offset:2px;}
    /* When no primary CTA, restore .glo-modal-cta to bold default style */
    .glo-modal-card:not(:has(.glo-modal-cta-primary[href])) .glo-modal-cta{background:#3a1a22;color:#f4ebeb;padding:14px 40px;font-size:14px;font-weight:600;box-shadow:0 6px 18px rgba(58,26,34,.18);}
    .glo-modal-card:not(:has(.glo-modal-cta-primary[href])) .glo-modal-cta:hover{background:#5a2229;color:#f4ebeb;transform:translateY(-1px);box-shadow:0 8px 22px rgba(58,26,34,.22);}
    @keyframes gloFadeIn{from{opacity:0;}to{opacity:1;}}
    @keyframes gloCardIn{from{opacity:0;transform:translateY(20px) scale(.95);}to{opacity:1;transform:translateY(0) scale(1);}}
    @media (max-width:640px){
      .glo-modal-card{padding:44px 24px 28px;border-radius:18px;}
      .glo-modal-title{font-size:23px;}
      .glo-modal-icon{font-size:48px;}
      .glo-modal-body{font-size:13.5px;}
    }
  `;
  document.head.appendChild(style);
}

export function showGloModal(opts) {
  injectModal();
  const el = document.getElementById('glo-modal');
  el.querySelector('.glo-modal-icon').textContent = opts.icon || '✨';
  el.querySelector('.glo-modal-title').innerHTML = opts.title || '';
  el.querySelector('.glo-modal-body').innerHTML = opts.body || '';
  el.querySelector('.glo-modal-cta').textContent = opts.cta || '확인';

  /* Primary CTA (Kakao yellow button) — optional */
  const primary = el.querySelector('.glo-modal-cta-primary');
  const primaryLabel = el.querySelector('.glo-modal-cta-primary-label');
  if (opts.primaryHref && opts.primaryLabel) {
    primary.setAttribute('href', opts.primaryHref);
    primary.setAttribute('target', opts.primaryTarget || '_blank');
    primaryLabel.textContent = opts.primaryLabel;
  } else {
    primary.removeAttribute('href');
    primary.style.display = '';
    primaryLabel.textContent = '';
  }

  el.classList.add('is-open');
  el.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  /* Focus primary CTA if present, else the close button */
  setTimeout(() => {
    const focusTarget = (opts.primaryHref ? primary : el.querySelector('.glo-modal-cta'));
    if (focusTarget) focusTarget.focus();
  }, 60);
}

export function hideGloModal() {
  const el = document.getElementById('glo-modal');
  if (!el) return;
  el.classList.remove('is-open');
  el.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

/* ============================================================
   CLICK INTERCEPTOR — any link to /ko/login.html.
   Logged-in users get the early-bird signup modal instead of
   being redirected to the login page.
   ============================================================ */

async function handleEarlyBirdClick(e) {
  const link = e.target.closest('a[href="/ko/login.html"], a[href="https://glo-us.com/ko/login.html"]');
  if (!link) return;

  /* Stop default navigation while we decide. If user is logged out,
     we'll re-trigger navigation manually. */
  e.preventDefault();

  /* Fast local check first — getSession() reads from storage. */
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    /* Not logged in — keep the original behavior */
    window.location.href = '/ko/login.html';
    return;
  }

  /* Logged in. Show a brief loading state? For now go straight. */
  let profile;
  try {
    profile = await getProfile();
  } catch (_) { profile = null; }
  const displayName = (profile && profile.nickname) || '회원';

  /* Has the user already applied? Try the insert; the unique
     constraint will short-circuit duplicates without a separate
     SELECT round-trip. */
  try {
    const result = await applyForEarlyBird();
    if (result.already) {
      showGloModal({
        icon: '🌿',
        title: '이미 <em>얼리버드</em>로<br/>등록되어 있어요',
        body: `<b>${escapeHtml(displayName)}</b>님은 이미 얼리버드 신청이 완료되었어요.<br/><br/>아직 <b>glo 카카오톡 채널</b>을 추가하지 않으셨다면, 지금 추가하셔야 출시 시 <b>50% 할인 링크</b>를 받으실 수 있어요.`,
        primaryHref: 'http://pf.kakao.com/_VvUsX/friend',
        primaryLabel: 'glo 카카오톡 채널 추가하기',
        cta: '나중에',
      });
    } else {
      showGloModal({
        icon: '🎉',
        title: '<em>얼리버드 신청</em>이<br/>완료되었어요',
        body: `정상 판매가에서 <b>50% 할인</b>받을 수 있는 얼리버드 신청이 완료되었어요.<br/><br/>출시 시 <b>50% 할인 링크</b>는 <b>glo 카카오톡 채널</b>로 발송됩니다. 아래 버튼으로 채널을 추가해주세요. 🌿`,
        primaryHref: 'http://pf.kakao.com/_VvUsX/friend',
        primaryLabel: 'glo 카카오톡 채널 추가하기',
        cta: '나중에',
      });
    }
  } catch (err) {
    console.error('[glo] earlybird apply failed:', err);
    showGloModal({
      icon: '😢',
      title: '신청에 <em>실패</em>했어요',
      body: '잠시 후 다시 시도해주세요. 문제가 지속되면 고객센터 <b>02-467-1024</b>로 연락 주세요.',
      cta: '확인',
    });
  }
}

if (typeof document !== 'undefined') {
  /* Use capture phase so we run before any inline handlers */
  document.addEventListener('click', handleEarlyBirdClick, true);
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
