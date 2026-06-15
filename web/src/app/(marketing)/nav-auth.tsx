"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Marketing pages are static HTML (dangerouslySetInnerHTML) with a hardcoded
 * "로그인" nav link. This client component checks the Supabase session in the
 * browser and, when signed in, swaps that link for a user menu (마이페이지 +
 * 로그아웃). Re-runs on auth state changes.
 */
export default function NavAuth() {
  useEffect(() => {
    const supabase = createClient();
    let docClick: (() => void) | null = null;

    async function swap() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      const navR = document.querySelector<HTMLElement>(".nav-r");
      if (!navR) return;

      const loginLink =
        navR.querySelector<HTMLElement>('a[href="/login"]') ||
        [...navR.querySelectorAll<HTMLElement>("a")].find(
          (a) => a.textContent?.trim() === "로그인",
        );
      const existing = navR.querySelector<HTMLElement>(".glo-usermenu");

      if (!user) {
        // logged out — if a stale menu exists, restore the login link
        if (existing) {
          const a = document.createElement("a");
          a.href = "/login";
          a.textContent = "로그인";
          existing.replaceWith(a);
        }
        return;
      }

      injectStyles();
      const meta = (user.user_metadata ?? {}) as Record<string, string>;
      const name =
        meta.nickname || meta.name || meta.full_name || meta.preferred_username || "회원";

      const menu = document.createElement("div");
      menu.className = "glo-usermenu";
      menu.innerHTML = `
        <button class="glo-um-trigger" type="button" aria-haspopup="menu" aria-expanded="false">${escapeHtml(name)} ▾</button>
        <div class="glo-um-dd" role="menu">
          <a href="/account" role="menuitem">마이페이지</a>
          <button type="button" class="glo-um-logout" role="menuitem">로그아웃</button>
        </div>`;

      if (loginLink) loginLink.replaceWith(menu);
      else if (existing) existing.replaceWith(menu);
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
      menu.querySelector<HTMLElement>(".glo-um-logout")!.addEventListener("click", async () => {
        await supabase.auth.signOut();
        window.location.reload();
      });
    }

    swap();
    const { data: sub } = supabase.auth.onAuthStateChange(() => swap());
    return () => {
      sub.subscription.unsubscribe();
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
    .glo-um-trigger{background:transparent;border:none;font-family:inherit;font-size:13px;font-weight:500;color:var(--ink-soft,#2a121899);padding:10px 18px;border-radius:100px;cursor:pointer;letter-spacing:-.01em;white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis;}
    .glo-um-trigger:hover{color:var(--ink,#2a1218);}
    .glo-um-dd{position:absolute;top:calc(100% + 10px);right:0;min-width:170px;background:rgba(255,250,250,.96);backdrop-filter:saturate(180%) blur(20px);-webkit-backdrop-filter:saturate(180%) blur(20px);border:1px solid rgba(212,181,181,.42);border-radius:14px;padding:6px;box-shadow:0 16px 40px rgba(58,26,34,.12);display:none;flex-direction:column;z-index:60;}
    .glo-um-dd.open{display:flex;}
    .glo-um-dd a,.glo-um-dd button{display:block;width:100%;text-align:left;padding:10px 14px;font-size:13px;font-weight:500;color:var(--ink-soft,#2a121899);background:transparent;border:none;font-family:inherit;cursor:pointer;border-radius:8px;text-decoration:none;}
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
