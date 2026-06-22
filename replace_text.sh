#!/bin/bash

FILE="web/src/app/(marketing)/science/page.tsx"

# [30]
sed -i 's/가능한 한 trial-grade form으로\. 분자 구조 명시\. Source · standardization · mechanism 표기\. <em>모든 mg을 라벨에 인쇄 — proprietary blend 없음\.<\/em>/가능한 한 임상 시험 등급 원료로. 분자 구조 명시. 원료 출처·표준화·작용 경로 표기. <em>모든 함량을 라벨에 인쇄 — 성분 혼합비 완전 공개.<\/em>/g' "$FILE"

# [31]
sed -i 's/Cu²⁺ chelation으로 tyrosinase 억제; eumelanin → pheomelanin 전환; 세포 내 ROS quench; 산화된 ascorbate 재생\./멜라닌이 만들어지는 것을 근원부터 차단합니다./g' "$FILE"

# [32]
sed -i 's/간과 피부 내 GSH pool을 de-novo 합성으로 끌어올립니다\. 생리적 농도에서 cysteine 공급은 systemic GSH 생산의 유일한 속도결정인자입니다\./Glutathione을 한 번 먹는 게 아니라, 계속 만들어지게 하는 성분입니다. 체내에서 Glutathione 합성의 원료로 작용하여 효과가 오래 이어지게 합니다./g' "$FILE"

# [33]
sed -i 's/식물성 melatonin은 피부 조직에서 작용하는 소분자 항산화제로, circadian melanin 조절을 보조하고 melanocyte 활성화 상류에서 UV-stress를 quench합니다\./자외선을 피부 속에서 흡수하는 이너 선케어 성분입니다. 색소가 없는 화이트토마토 특유의 성분이 새 멜라닌 생성 자체를 예방합니다./g' "$FILE"

# [34]
sed -i 's/PAR-2 매개 melanosome 전달 억제; MMP-1 하향 조정; SIRT1 \/ PARP1 DNA repair를 위한 NAD⁺ 공급\./이미 만들어진 멜라닌이 피부 표면으로 퍼지는 것을 막습니다. Glutathione이 생성을 차단한다면, Niacinamide는 이동 경로를 차단합니다./g' "$FILE"

# [35]
sed -i 's/120 mg\/day 12주 RCT (vs\. placebo)에서 ↓ TEWL, ↑ SC water content\./피부 표면부터 진피 깊은 곳까지 수분을 층층이 채웁니다. 발효 공법으로 만든 HA로 건조함과 피부결을 동시에 잡습니다./g' "$FILE"

# [36]
sed -i 's/각질층 lamellar lipid lamellae 회복; 임상 검증된 농축형 용량에서 ↓ TEWL\. Ceramide 고갈은 30대부터 시작됩니다\./나이가 들면서 줄어드는 피부 장벽 성분을 직접 공급합니다. 소량이지만 고농축 형태라 피부에 실제로 전달되는 양은 충분합니다./g' "$FILE"

# [37]
sed -i 's/8–12주 경구 dosing에서 ↑ Dermal collagen density, ↑ Cutometer R2 elasticity\. Pro-Hyp dipeptide가 fibroblast collagen 합성을 활성화하고 MMP 활성을 억제합니다\./진피 속 세포를 직접 자극해 collagen이 새로 만들어지게 합니다. 300Da 초저분자라 장벽을 통과하는 속도가 일반 collagen 분말과 차원이 다릅니다./g' "$FILE"

# [38]
sed -i 's/Collagen peptide 단독으로는 다 담아내지 못하는 dermal firmness · density를 structure 경로에서 보완\. N°07과 함께 배합하여 12주 시점의 가시적 Cutometer elasticity 변화를 지원합니다\./glo가 직접 개발하고 특허 등록한 탄력 전용 복합물입니다. Collagen만으로 잡기 어려운 피부 밀도와 단단함을 함께 케어합니다./g' "$FILE"

# [39]
sed -i 's/↓ UV 유도 MMP-1; ↑ elastin; 임상 검증 daily dose에서 visco-elastic parameter 개선\. 진피 fibroblast 내 ↓ 8-OHdG\./비타민C보다 약 6,000배 강력한 항산화력으로 광노화를 막습니다. 천연 미세조류에서 추출한 성분이 피부 세포 안팎을 동시에 보호합니다./g' "$FILE"

# [40]
sed -i 's/Proprietary blend 없음\. 모든 mg을 라벨에 인쇄\. Published trial이 사용한 용량, 일반 OTC가 담는 양, 그리고 glo의 위치\./glo GL-01의 모든 성분은 임상에서 효과가 검증된 용량 그대로 입니다. 줄이지 않았습니다./g' "$FILE"

# [41]
sed -i 's/glo는 10년 이상의 경력을 가진 8명의 specialist — 한국 MDs 5인 (서울에서 활동 중인 board-certified dermatology + plastic surgery)과 US dermatologist 1인, 그리고 PhDs 2인 (skin reverse-aging research, Seoul + US) — 이 함께 만들었습니다\. 4년에 걸친 처방 작업, dose calibration, 그리고 published longevity literature를 기준으로 한 biomarker 검토\./glo는 10년 이상 경력의 전문가 8인 — 서울 활동 피부과·성형외과 전문의 5인, 미국 피부과 전문의 1인, 의학박사 2인 — 이 함께 만들었습니다. 4년에 걸친 처방 작업, 용량 설계, 발표된 노화 임상 문헌을 기준으로 한 생체 지표 검토를 통해 완성했습니다./g' "$FILE"

# [42]
sed -i 's/<em>4가지<\/em> mechanism\. <em>9개의<\/em> active\./<em>4가지<\/em> 작용 경로. <em>9가지<\/em> 성분./g' "$FILE"
sed -i 's/피부는 네 가지 경로로 나란히 늙습니다\. 각 active는 하나의 mechanism을 위해 선택됐고 — 일부는 두 군데에 작용하며 — 임상 근거의 lower bound에 dose합니다\. Structure 축은 300 Da cod-skin collagen peptide와 glo 특허 Tightening-PB Complex® (KR 10-2911449)의 페어링\./피부는 네 가지 경로로 나란히 노화가 진행됩니다. 각 성분은 하나의 작용 경로를 위해 선택됐고 — 일부는 두 경로에 동시에 작용하며 — 임상 근거의 하한선 용량으로 설계됐습니다. 구조 경로는 300Da Marine Collagen Peptide와 glo 특허 Tightening-PB Complex® (KR 10-2911449)의 조합./g' "$FILE"

# [43]
sed -i 's/<em>Trial<\/em>에 맞춰 calibrate\./<em>임상 용량<\/em>에 맞춰 설계./g' "$FILE"
sed -i 's/모든 mg을 라벨에 인쇄\. Proprietary blend 없음\. 10× dose mismatch를 숨기는 "as studied in" 미세글자 없음\. 문헌에 범위가 있으면 evidence-supported lower bound로 dose합니다\./모든 함량을 라벨에 인쇄. 성분 혼합비 완전 공개. 10배 용량 불일치를 숨기는 "임상 연구 기반" 식의 면피 표기 없음. 문헌에 범위가 있으면 근거가 뒷받침하는 하한선 용량으로 설계합니다./g' "$FILE"

# [44]
sed -i 's/<em>specialist\.<\/em><br\/>MDs 6인 + PhDs 2인\./<em>전문의 6인·의학박사 2인\.<\/em>/g' "$FILE"
sed -i 's/서울에서 활동 중인 한국 dermatologist + plastic surgeon 5인과 US dermatologist 1인, 그리고 skin reverse-aging PhD 2인 (Seoul + US) — 각각 10년+ 경력\. 한국의 수술급 임상 디서플린과 US-published 연구 근거가 만나는 지점\./서울 활동 피부과·성형외과 전문의 5인, 미국 피부과 전문의 1인, 피부 역노화 전문 의학박사 2인 (서울·미국) — 각각 10년 이상의 경력. 한국의 수술급 임상 경험과 미국 발표 연구 근거가 만나는 지점./g' "$FILE"

echo "All replacements completed"
