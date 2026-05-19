"""
검증 스크립트 — 생성된 PDF에서 텍스트 추출 후
이메일 패턴, @ 문자, 개인정보 패턴을 전수 검사.
"""
import re
from pypdf import PdfReader

PDF = r"D:\위글로우\Glo\kakao-review.pdf"
r = PdfReader(PDF)

print(f"검증 대상: {PDF}")
print(f"총 페이지: {len(r.pages)}\n")

# 모든 페이지 텍스트 합치기
all_text = ""
for i, page in enumerate(r.pages, 1):
    t = page.extract_text() or ""
    all_text += f"\n=== PAGE {i} ===\n{t}\n"

# === 검사 1: 이메일 주소 패턴 (@ 포함) ===
print("[검사 1] 이메일 주소 (@ 문자 포함)")
email_re = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}")
emails = email_re.findall(all_text)
if emails:
    print(f"  ❌ FAIL — {len(emails)}건 검출: {emails}")
else:
    print("  ✅ PASS — 이메일 패턴 없음")

print()

# === 검사 2: @ 문자 (이메일이 아닌 경우 포함) ===
print("[검사 2] @ 단일 문자")
at_count = all_text.count("@")
if at_count > 0:
    # @ 주변 문맥 보기
    print(f"  ❌ FAIL — {at_count}개의 @ 발견")
    for m in re.finditer(r"@", all_text):
        start = max(0, m.start() - 20)
        end = min(len(all_text), m.end() + 30)
        ctx = all_text[start:end].replace("\n", " ")
        print(f"    ...{ctx}...")
else:
    print("  ✅ PASS — @ 문자 없음")

print()

# === 검사 3: 휴대전화 패턴 (010-XXXX-XXXX) ===
print("[검사 3] 010 휴대전화 패턴")
phone_re = re.compile(r"01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}")
phones = phone_re.findall(all_text)
if phones:
    print(f"  ❌ FAIL — {len(phones)}건 검출: {phones}")
else:
    print("  ✅ PASS — 휴대전화 패턴 없음")

print()

# === 검사 4: 가능한 더미 한국 이름 (김OO 등) ===
print("[검사 4] 일반 한국 이름 패턴 (3자)")
name_re = re.compile(r"[김이박최정강조윤장임한오서신권황안송류전홍고문양손배][가-힣]{2}")
# 제외할 합법 이름 (사업자정보)
allowed = {"강신욱", "이준호"}
names = [n for n in name_re.findall(all_text) if n not in allowed]
if names:
    print(f"  ⚠ WARN — 사업자정보 외 이름 패턴: {set(names)}")
else:
    print("  ✅ PASS — 사업자정보(강신욱·이준호) 외 인명 없음")

print()

# === 검사 5: 위글로우 사업자정보 노출 확인 (있어야 정상) ===
print("[검사 5] 사업자정보 (법정 의무 표시 — 있어야 정상)")
checks = ["위글로우", "강신욱", "517-86-00666", "02-467-1024", "이준호"]
for c in checks:
    found = c in all_text
    print(f"  {'✅' if found else '❌'} '{c}': {'있음' if found else '없음'}")
