# Open Graph cover image

`og-cover.svg` is a placeholder used in `<meta property="og:image">` across all pages.

## Replace with a PNG/JPG for production

Facebook, Twitter, Slack, iMessage, etc. **do not reliably render SVG** OG images. Before public sharing:

1. Render `og-cover.svg` to PNG at **1200×630** (the OG standard).
2. Save as `og-cover.png` or `og-cover.jpg` in this folder.
3. Update the `og:image` and `twitter:image` meta tags in all four HTML files from `og-cover.svg` to the new filename.

## Per-page covers (optional)

For better social previews you can author distinct OG images per page:
- `og-cover.png` — landing (default)
- `og-product.png` — GL-01 product page
- `og-science.png` — Science page
- `og-about.png` — About page

Each HTML file's `og:image` tag can point to its own cover. Until then all four pages share `og-cover.svg`.
