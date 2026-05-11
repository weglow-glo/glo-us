# assets/

Image assets for glo. Currently empty — markup uses CSS-only fallbacks (gradient circles for portraits, pure-CSS bottle mock). When real assets land, drop them here using the naming convention below; existing markup will need a small swap (one `<img>` per slot — see "Swap pattern" below).

## Structure

```
assets/
├── bottle/        — GL-01 sachet renders (replaces CSS mock on index.html, product.html)
├── founders/      — MD/PhD portrait photos (replaces gradient circles on index.html, about.html, science.html)
└── ingredients/   — Optional: molecular structures, ingredient stills (science.html)
```

## bottle/

**Used by:** [index.html](../index.html) `.bottle` (small mock in hero), [product.html](../product.html) `.bottle` (large hero render).

| Filename            | Format | Dimensions       | Notes                                                |
| ------------------- | ------ | ---------------- | ---------------------------------------------------- |
| `gl01-front.png`    | PNG-24 | 800×2800 (1:3.5) | Front-facing sachet, transparent bg                  |
| `gl01-front@2x.png` | PNG-24 | 1600×5600        | Retina                                               |
| `gl01-front.webp`   | WebP   | 800×2800         | Optional, for `<picture>` source                     |
| `gl01-3d.png`       | PNG-24 | 1200×1800        | 3-quarter angle render (preferred for product hero)  |

Background must be transparent. Burgundy bottle on light page.

## founders/

**Used by:** [about.html](../about.html) `.lead-photo` (3 leads at 80×80) and `.mm-photo` (7 mini at 42×42), [index.html](../index.html) `.doc-photo` (3 doctors at 64×64), [science.html](../science.html) `.doc-photo` (3 scientists at 64×64).

Square crops, head-and-shoulders, even lighting. Convert to circles via CSS `border-radius:50%` (already applied).

| Filename             | Format | Dimensions | Notes                          |
| -------------------- | ------ | ---------- | ------------------------------ |
| `park-seoyeon.jpg`   | JPG    | 320×320    | Lead dermatologist             |
| `lee-minjun.jpg`     | JPG    | 320×320    | Aesthetic surgery lead         |
| `chen-ayana.jpg`     | JPG    | 320×320    | Science lead (PhD · RD)        |
| `kim-joonho.jpg`     | JPG    | 320×320    | + 6 more (see about.html grid) |
| `_placeholder.jpg`   | JPG    | 320×320    | Generic fallback if no portrait yet |

## ingredients/ (optional)

For science.html ingredient cards. Molecular skeletal structures (SVG preferred) or microscopy stills.

| Filename            | Format | Dimensions  | Notes                              |
| ------------------- | ------ | ----------- | ---------------------------------- |
| `glutathione.svg`   | SVG    | viewBox 200×100 | Skeletal structure, single color (`var(--ink)` or `var(--accent)`) |
| `astaxanthin.svg`   | SVG    | viewBox 320×80  | Polyene chain                      |
| `niacinamide.svg`   | SVG    | viewBox 160×100 | Pyridine ring + amide              |
| `collagen-tri.svg`  | SVG    | viewBox 240×120 | Triple-helix schematic             |

## Swap pattern (when assets arrive)

Markup currently uses CSS-only placeholders:

```html
<div class="lead-photo"></div>
```

To swap to a real image without touching CSS, replace with:

```html
<div class="lead-photo" style="background:url('assets/founders/park-seoyeon.jpg') center/cover;"></div>
```

For the bottle, the CSS mock is more elaborate (gradients, sheen, dots, label text). Switching to an image render means replacing the entire `<div class="bottle">…</div>` block with `<img src="assets/bottle/gl01-3d.png" alt="GL-01 sachet" class="bottle-img">` and adding `.bottle-img{width:160px;height:auto;}` (or appropriate sizing) to the page-specific style block.

## Image budget

Aim for under 200 KB per portrait, under 500 KB per bottle render (PNG-24 with transparency). Use WebP where supported.
