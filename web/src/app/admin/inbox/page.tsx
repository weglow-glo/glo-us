import { fetchInbox } from "./actions";
import InboxClient from "./inbox-client";

export const dynamic = "force-dynamic";

export const metadata = { title: "glo 문의관리" };

/** 슬랙 통지의 "답변하기" 링크가 ?c=<conversationId> 로 스레드를 바로 연다. */
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  const conversations = await fetchInbox();
  return <InboxClient initialConversations={conversations} initialSelectedId={c ?? null} />;
}
