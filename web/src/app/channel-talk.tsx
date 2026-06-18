"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import * as ChannelService from "@channel.io/channel-web-sdk-loader";

// Set NEXT_PUBLIC_CHANNEL_PLUGIN_KEY in .env.local / Vercel.
// 채널톡 → 설정 → 보안 및 개발 → 플러그인 키.
const PLUGIN_KEY = process.env.NEXT_PUBLIC_CHANNEL_PLUGIN_KEY;

/**
 * Channel Talk customer-chat widget. Booted site-wide except the internal
 * /admin dashboard. No-ops until the plugin key is configured.
 */
export default function ChannelTalk() {
  const pathname = usePathname();
  const onAdmin = pathname?.startsWith("/admin") ?? false;

  useEffect(() => {
    if (!PLUGIN_KEY || onAdmin) return;
    ChannelService.loadScript();
    ChannelService.boot({ pluginKey: PLUGIN_KEY, language: "ko" });
    return () => ChannelService.shutdown();
  }, [onAdmin]);

  return null;
}
