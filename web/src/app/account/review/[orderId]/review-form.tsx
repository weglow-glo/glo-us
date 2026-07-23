"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const MAX_PHOTOS = 5;
const MAX_PHOTO_MB = 10;
const MAX_VIDEOS = 1;
const MAX_VIDEO_MB = 50;

type Uploaded = { path: string; kind: "image" | "video"; preview: string };

/**
 * 리뷰 폼. 미디어는 서명 URL로 스토리지에 직접 업로드한 뒤 경로만 제출한다.
 * edit 모드에서는 별점·텍스트만 수정 가능 (48시간 이내, 미디어 교체 불가).
 */
export function ReviewForm({
  orderId,
  edit,
  textPoint = 3000,
  mediaPoint = 2000,
}: {
  orderId: string;
  edit?: {
    reviewId: string;
    rating: number;
    body: string;
    photos?: string[];
    videos?: string[];
  };
  textPoint?: number;
  mediaPoint?: number;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(edit?.rating ?? 5);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState(edit?.body ?? "");
  const [media, setMedia] = useState<Uploaded[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { pendingMedia: boolean; edited?: boolean }>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const lockedPhotos = edit?.photos ?? [];
  const lockedVideos = edit?.videos ?? [];
  const photoCount = lockedPhotos.length + media.filter((m) => m.kind === "image").length;
  const videoCount = lockedVideos.length + media.filter((m) => m.kind === "video").length;

  const pick = async (list: FileList | null) => {
    if (!list?.length) return;
    setError(null);
    setUploading(true);
    try {
      for (const f of Array.from(list)) {
        const isVideo = f.type.startsWith("video/");
        if (isVideo && videoCount >= MAX_VIDEOS) {
          setError(`영상은 ${MAX_VIDEOS}개까지 첨부할 수 있습니다.`);
          continue;
        }
        if (!isVideo && photoCount >= MAX_PHOTOS) {
          setError(`사진은 ${MAX_PHOTOS}장까지 첨부할 수 있습니다.`);
          continue;
        }
        const maxMb = isVideo ? MAX_VIDEO_MB : MAX_PHOTO_MB;
        if (f.size > maxMb * 1024 * 1024) {
          setError(`${isVideo ? "영상" : "사진"}은 ${maxMb}MB 이하여야 합니다.`);
          continue;
        }

        // 1) 서명 URL 발급 → 2) 스토리지 직접 업로드
        const res = await fetch("/api/reviews/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, contentType: f.type }),
        });
        const j = (await res.json().catch(() => ({}))) as {
          error?: string;
          path?: string;
          signedUrl?: string;
          kind?: "image" | "video";
        };
        if (!res.ok || !j.signedUrl || !j.path) {
          setError(j.error ?? "업로드 준비에 실패했습니다.");
          continue;
        }
        const up = await fetch(j.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": f.type },
          body: f,
        });
        if (!up.ok) {
          setError("파일 업로드에 실패했습니다. 다시 시도해주세요.");
          continue;
        }
        setMedia((prev) => [
          ...prev,
          { path: j.path!, kind: j.kind ?? "image", preview: URL.createObjectURL(f) },
        ]);
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const submit = async () => {
    setError(null);
    if (body.trim().length < 20) {
      setError("후기를 20자 이상 작성해주세요.");
      return;
    }
    setBusy(true);
    try {
      const res = edit
        ? await fetch("/api/reviews/edit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              reviewId: edit.reviewId,
              rating,
              body: body.trim(),
              photos: media.filter((m) => m.kind === "image").map((m) => m.path),
              videos: media.filter((m) => m.kind === "video").map((m) => m.path),
            }),
          })
        : await fetch("/api/reviews/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderId,
              rating,
              body: body.trim(),
              photos: media.filter((m) => m.kind === "image").map((m) => m.path),
              videos: media.filter((m) => m.kind === "video").map((m) => m.path),
            }),
          });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        pendingMedia?: boolean;
      };
      if (!res.ok) {
        setError(json.error ?? "제출에 실패했습니다. 다시 시도해주세요.");
        return;
      }
      setDone({ pendingMedia: Boolean(json.pendingMedia), edited: Boolean(edit) });
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="mt-8 rounded-xl border border-ink-line bg-bg-2 p-6 text-sm leading-relaxed text-ink-soft">
        {done.edited ? (
          done.pendingMedia ? (
            <>
              리뷰가 수정되었습니다. 추가하신 사진·영상은 검수 후 공개되며, 승인되면{" "}
              <b className="text-accent">{mediaPoint.toLocaleString("ko-KR")}P</b>가 적립됩니다.
            </>
          ) : (
            <>리뷰가 수정되었습니다.</>
          )
        ) : done.pendingMedia ? (
          <>
            리뷰가 게시되었고{" "}
            <b className="text-accent">{textPoint.toLocaleString("ko-KR")}P</b>가
            적립되었습니다. 첨부하신 사진·영상은 검수 후 공개되며, 승인되면{" "}
            <b className="text-accent">{mediaPoint.toLocaleString("ko-KR")}P</b>가 추가
            적립됩니다.
          </>
        ) : (
          <>
            리뷰가 게시되었고{" "}
            <b className="text-accent">{textPoint.toLocaleString("ko-KR")}P</b>가
            적립되었습니다. 소중한 후기 감사합니다.
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      {/* 별점 */}
      <div>
        <div className="text-sm font-semibold text-ink">만족도</div>
        <div className="mt-2 flex gap-1" role="radiogroup" aria-label="별점">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n}점`}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              onClick={() => setRating(n)}
              className={`text-3xl leading-none transition ${
                (hover || rating) >= n ? "text-accent" : "text-ink-line"
              }`}
            >
              ★
            </button>
          ))}
          <span className="ml-2 self-center text-sm text-ink-mute">{rating}점</span>
        </div>
      </div>

      {/* 본문 */}
      <div>
        <div className="flex items-baseline justify-between">
          <div className="text-sm font-semibold text-ink">후기</div>
          <div className="text-xs text-ink-faint">{body.trim().length} / 2,000자 (20자 이상)</div>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          maxLength={2000}
          placeholder="맛, 드시는 습관, 느낀 점을 자유롭게 남겨주세요."
          className="mt-2 w-full rounded-xl border border-ink-line bg-bg-1 px-4 py-3 text-sm leading-relaxed text-ink outline-none focus:border-accent"
        />
      </div>

      {/* 미디어 — 기존 첨부는 삭제·교체 불가, 남은 슬롯만큼 추가 가능 */}
      {(
        <div>
          <div className="text-sm font-semibold text-ink">
            사진·영상{" "}
            <span className="font-normal text-ink-mute">
              (선택 · 사진 {MAX_PHOTOS}장 {MAX_PHOTO_MB}MB · 영상 {MAX_VIDEOS}개 {MAX_VIDEO_MB}MB)
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-3">
            {lockedPhotos.map((u, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={u}
                src={u}
                alt={`기존 사진 ${i + 1}`}
                className="h-20 w-20 rounded-lg border border-ink-line object-cover opacity-80"
              />
            ))}
            {lockedVideos.map((u) => (
              <video
                key={u}
                src={u}
                muted
                playsInline
                className="h-20 w-20 rounded-lg border border-ink-line object-cover opacity-80"
              />
            ))}
            {media.map((m, i) => (
              <div key={m.path} className="relative">
                {m.kind === "video" ? (
                  <video
                    src={m.preview}
                    muted
                    playsInline
                    className="h-20 w-20 rounded-lg border border-ink-line object-cover"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.preview}
                    alt={`첨부 ${i + 1}`}
                    className="h-20 w-20 rounded-lg border border-ink-line object-cover"
                  />
                )}
                <button
                  type="button"
                  aria-label="첨부 삭제"
                  onClick={() => setMedia(media.filter((x) => x.path !== m.path))}
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-burg-600 text-xs text-bg-1"
                >
                  ✕
                </button>
              </div>
            ))}
            {photoCount + videoCount < MAX_PHOTOS + MAX_VIDEOS && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-ink-line text-2xl text-ink-mute transition hover:border-accent hover:text-accent disabled:opacity-50"
              >
                {uploading ? "…" : "+"}
              </button>
            )}
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">
            사진·영상은 검수 후 공개됩니다 (그 전까지 흐리게 표시). 승인 시{" "}
            {mediaPoint.toLocaleString("ko-KR")}P가 추가 적립됩니다.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,video/mp4,video/webm,video/quicktime"
            multiple
            hidden
            onChange={(e) => pick(e.target.files)}
          />
        </div>
      )}

      {error && <p className="rounded-md bg-bg-3 px-4 py-3 text-sm text-burg-400">{error}</p>}

      <button
        onClick={submit}
        disabled={busy || uploading}
        className="w-full rounded-full bg-burg-600 py-3.5 text-sm font-semibold text-bg-1 transition hover:bg-burg-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "제출 중..." : edit ? "리뷰 수정하기" : "리뷰 제출하기"}
      </button>
      <p className="text-center text-[11px] leading-relaxed text-ink-faint">
        게시된 리뷰에는 작성자 표시(예: 김 OO)와 지역이 함께 노출됩니다. 리뷰는 작성 후
        24시간 이내(검수 완료 전)에만 수정할 수 있으며, 삭제가 필요하면 채널톡으로
        문의해주세요.
      </p>
    </div>
  );
}
