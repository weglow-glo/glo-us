"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Renders the brand word "glo" in the logo font (Fraunces) wherever it appears
 * in body copy. CSS can't match by text, so we wrap standalone "glo" tokens in
 * a <span class="gloword">. Re-runs on client-side route changes.
 *
 * Only matches the lowercase brand token — not "glow", "weglow", "glo-us",
 * "Glutathione", etc. Skips the nav/footer logo (already styled) and form fields.
 */
export default function GloWordmark() {
  const pathname = usePathname();

  useEffect(() => {
    // brand "glo": not preceded by a letter/Hangul, not followed by a letter, not "-us"
    const PATTERN = "(?<![A-Za-z\\uac00-\\ud7a3])glo(?![A-Za-z])(?!-us)";

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = (n as Text).parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        const tag = p.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA" || tag === "INPUT")
          return NodeFilter.FILTER_REJECT;
        if (p.closest(".gloword, .logo, .foot-logo, .b-logo, .b-logo-wrap"))
          return NodeFilter.FILTER_REJECT;
        return new RegExp(PATTERN).test(n.nodeValue || "")
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });

    const targets: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) targets.push(node as Text);

    targets.forEach((tn) => {
      const text = tn.nodeValue ?? "";
      const re = new RegExp(PATTERN, "g");
      const frag = document.createDocumentFragment();
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        const span = document.createElement("span");
        span.className = "gloword";
        span.textContent = "glo";
        frag.appendChild(span);
        last = m.index + 3;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      tn.parentNode?.replaceChild(frag, tn);
    });
  }, [pathname]);

  return null;
}
