"use client";

import { useEffect } from "react";

/**
 * Swaps the static "로그인" nav link for a user menu when signed in.
 *
 * Perceived-speed: the last-known user is cached in localStorage and applied
 * instantly on load (no flicker on repeat navigations); /api/me then confirms
 * in the background. Auth is read server-side so it works with httpOnly cookies.
 */
type NavUser = { name: string; avatar: string | null };
const CACHE_KEY = "glo_nav_user";

export default function NavAuth() {
  useEffect(() => {
    let docClick: (() => void) | null = null;

    const render = (user: NavUser | null) => {
      const navR = document.querySelector<HTMLElement>(".nav-r");
      if (!navR) return;
      const hasMenu = !!navR.querySelector(".glo-usermenu");

      if (user) {
        if (hasMenu) return; // already showing — no re-render, no flicker
        injectStyles();
        const loginLink =
          navR.querySelector<HTMLElement>('a[href^="/login"]') ||
          [...navR.querySelectorAll<HTMLElement>("a")].find((a) => a.textContent?.trim() === "로그인");
        const initial = escapeHtml(user.name.slice(0, 1));
        const avatar = user.avatar
          ? `<span class="glo-um-avatar" style="background-image:url('${escapeHtml(user.avatar)}')"></span>`
          : `<span class="glo-um-avatar">${initial}</span>`;

        const menu = document.createElement("div");
        menu.className = "glo-usermenu";
        menu.innerHTML = `
          <button class="glo-um-trigger" type="button" aria-haspopup="menu" aria-expanded="false">${avatar}<span class="glo-um-name">${escapeHtml(user.name)}</span> ▾</button>
          <div class="glo-um-dd" role="menu">
            <a href="/account" role="menuitem">마이페이지</a>
            <form method="post" action="/auth/signout"><button type="submit" class="glo-um-logout" role="menuitem">로그아웃</button></form>
          </div>`;
        if (loginLink) loginLink.replaceWith(menu);
        else navR.insertBefore(menu, navR.firstChild);

        const trigger = menu.querySelector<HTMLElement>(".glo-um-trigger")!;
        const dd = menu.querySelector<HTMLElement>(".glo-um-dd")!;
        trigger.addEventListener("click", (e) => {
          e.stopPropagation();
          const open = dd.classList.toggle("open");
          trigger.setAttribute("aria-expanded", open ? "true" : "false");
        });
        docClick = () => dd.classList.remove("open");
        document.addEventListener("click", docClick);
      } else {
        // logged out — restore login link (with return path) if a menu is shown
        const menu = navR.querySelector<HTMLElement>(".glo-usermenu");
        const here = location.pathname + location.search;
        if (menu) {
          const a = document.createElement("a");
          a.href = `/login?next=${encodeURIComponent(here)}`;
          a.textContent = "로그인";
          menu.replaceWith(a);
        } else {
          const loginLink =
            navR.querySelector<HTMLElement>('a[href^="/login"]') ||
            [...navR.querySelectorAll<HTMLElement>("a")].find((a) => a.textContent?.trim() === "로그인");
          if (loginLink) loginLink.setAttribute("href", `/login?next=${encodeURIComponent(here)}`);
        }
      }
    };

    // 1) Optimistic: apply cached state instantly.
    let cached: NavUser | null = null;
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) cached = JSON.parse(raw);
    } catch {}
    render(cached);

    // 2) Confirm with the server.
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const user: NavUser | null = d.user ?? null;
        try {
          if (user) localStorage.setItem(CACHE_KEY, JSON.stringify(user));
          else localStorage.removeItem(CACHE_KEY);
        } catch {}
        // Only re-render if the state changed vs what we optimistically showed.
        const showingMenu = !!document.querySelector(".nav-r .glo-usermenu");
        if (!!user !== showingMenu) render(user);
      })
      .catch(() => {});

    return () => {
      if (docClick) document.removeEventListener("click", docClick);
    };
  }, []);

  return null;
}

let injected = false;
function injectStyles() {
  if (injected) return;
  injected = true;
  const s = document.createElement("style");
  s.textContent = `
    .glo-usermenu{position:relative;display:inline-flex;}
    .glo-um-trigger{display:inline-flex;align-items:center;gap:7px;background:transparent;border:none;font-family:inherit;font-size:13px;font-weight:500;color:var(--ink-soft,#2a121899);padding:6px 14px 6px 6px;border-radius:100px;cursor:pointer;letter-spacing:-.01em;white-space:nowrap;}
    .glo-um-trigger:hover{color:var(--ink,#2a1218);}
    .glo-um-avatar{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background-color:var(--accent,#8a4a52);background-size:cover;background-position:center;color:#fff;font-size:12px;font-weight:700;flex-shrink:0;}
    .glo-um-name{max-width:120px;overflow:hidden;text-overflow:ellipsis;}
    .glo-um-dd{position:absolute;top:calc(100% + 10px);right:0;min-width:170px;background:rgba(255,250,250,.96);backdrop-filter:saturate(180%) blur(20px);-webkit-backdrop-filter:saturate(180%) blur(20px);border:1px solid rgba(212,181,181,.42);border-radius:14px;padding:6px;box-shadow:0 16px 40px rgba(58,26,34,.12);display:flex;flex-direction:column;z-index:60;opacity:0;transform:translateY(-8px) scale(.96);transform-origin:top right;pointer-events:none;transition:opacity .18s ease,transform .18s cubic-bezier(.34,1.2,.64,1);}
    .glo-um-dd.open{opacity:1;transform:translateY(0) scale(1);pointer-events:auto;}
    .glo-um-dd a,.glo-um-dd button{display:block;width:100%;text-align:left;padding:10px 14px;font-size:13px;font-weight:500;color:var(--ink-soft,#2a121899);background:transparent;border:none;font-family:inherit;cursor:pointer;border-radius:8px;text-decoration:none;}
    .glo-um-dd form{margin:0;}
    .glo-um-dd a:hover,.glo-um-dd button:hover{background:rgba(243,234,234,.7);color:var(--ink,#2a1218);}
    .glo-um-logout{color:var(--burg-400,#5a2229);border-top:1px solid rgba(42,18,24,.08);margin-top:4px;padding-top:12px;}
  `;
  document.head.appendChild(s);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
