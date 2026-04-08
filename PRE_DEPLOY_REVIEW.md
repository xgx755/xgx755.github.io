# Pre-Deploy Code Review & Checklist
**Site:** Zane Davis Portfolio
**Date:** April 7, 2026
**Reviewer:** Claude (Cowork)
**Scope:** Full static site — index.html, work.html, cv.html, contact.html + all CSS

---

## Code Review

### Security — ✅ Clean
This is a static HTML/CSS site with no server-side code, no forms, and no JavaScript. The attack surface is minimal.
- All external links correctly use `rel="noopener"` ✓
- No credentials, API keys, or secrets anywhere in the codebase ✓
- No inline event handlers or dynamic content injection ✓

**One note:** Your personal email address (`zaneadavis19@gmail.com`) appears in plain text in three separate HTML files. This is intentional and appropriate for a contact portfolio, but it does mean email scrapers will find it.

---

### Correctness — ⚠️ One Critical Bug

**🔴 CRITICAL — Mobile nav hides the Contact page link**
`responsive.css`, line 54–55:
```css
.nav-links li:nth-child(3),
.nav-links li:nth-child(4) { display: none; }
```
Your nav currently has exactly 3 items: Work, CV, Contact. This rule hides `li:nth-child(3)` — which is **Contact** — on any screen ≤ 560px wide. The Contact page becomes completely unreachable via navigation on mobile, which is a serious problem for a job-seeking portfolio where mobile visitors (recruiters checking your link on their phone) need to reach you.

The rule looks like a leftover from when there was a 4th nav item. The fix is either to remove this rule entirely (all 3 nav items fit fine at small sizes) or implement a proper mobile menu. Removing the rule is the quick fix.

---

### Performance — ⚠️ Minor Issues

**🟡 Images missing `width` and `height` attributes**
None of the `<img>` tags in any HTML file include explicit `width` and `height` attributes. Without them, the browser can't reserve space before images load, causing layout shift (CLS). This affects your Lighthouse/Core Web Vitals score.

**🟡 No `loading="lazy"` on below-fold images**
Project images in `.brief-gallery` and the contact page headshot load eagerly. These are well below the fold and would benefit from `loading="lazy"` to reduce initial page load time.

**🟡 No `<link rel="icon">`**
None of the four HTML files declare a favicon. This causes every page load to fire a 404 request to `/favicon.ico` and results in a generic/blank browser tab icon. For a professional portfolio, this is noticeable.

---

### Maintainability — ⚠️ Some Dead Code & Loose Ends

**🟡 `css/pages/brief.css` exists but is never loaded**
This file is in the CSS directory but is not referenced by any HTML page. If it's for a future brief detail page, that's fine — but it should be noted. If the brief page concept was dropped, the file can be deleted.

**🟡 Internal planning documents are tracked in git despite being in `.gitignore`**
Your `.gitignore` lists these three files:
```
CONTENT_STRATEGY.md
site_architecture.md
visual_identity_system.md
```
But all three files are present in the repo directory and are being tracked by git (they were committed before the `.gitignore` rule was added). If you push to a public GitHub Pages repo, these internal planning and strategy documents will be publicly readable. You need to explicitly untrack them with `git rm --cached` before deploying.

**🟡 Unused images in assets/images/**
The following images are in your assets folder but referenced nowhere in any HTML file:
- `county1.png`, `county2.png`
- `courtbalance1.png`, `courtbalance2.png`
- `eaglescout1.JPG`
- `football1.jpeg`
- `headshot.jpeg` (different from `headshot_copy.jpeg` which IS used)
- `oldwell1.JPG`
- `presenting.jpeg`
- `working1.jpg`, `working2.jpg`

These add unnecessary weight to your repo and deployments. Remove them if they're not planned for use, or add the projects they belong to.

**✅ Mixed-case file extensions — resolved (no action needed)**
Three image files use `.JPG` (uppercase): `headshot2.JPG`, `eaglescout1.JPG`, `oldwell1.JPG`. The HTML reference in `contact.html` uses `headshot2.JPG` matching the actual filename exactly, so this will work correctly on GitHub Pages. The other two (eaglescout, oldwell) are unused. No change needed.

**🟡 `headshot_copy.jpeg` as the hero image**
`index.html` uses `assets/images/headshot_copy.jpeg` as the primary hero image. The filename is visible in browser dev tools and page source — "copy" signals a file management artifact rather than an intentional production asset. Rename it to something clean like `headshot_primary.jpeg`.

---

### Accessibility — ✅ Strong Overall, One Minor Note

The site is notably well-built for accessibility:
- Skip-to-content link on every page ✓
- Proper ARIA landmark roles (banner, contentinfo) ✓
- `aria-current="page"` on active nav links ✓
- `aria-label` on image galleries and navigation ✓
- `aria-hidden="true"` on decorative elements ✓
- Visible `:focus-visible` keyboard focus styles ✓
- `@media (hover: hover)` guard on hover-only interactions ✓
- WCAG color contrast documented in token comments ✓

**🔵 Minor — `.skip-link:focus { outline: none }`**
The skip link removes its outline on focus. The slide-in animation provides a visual indicator, but strictly per WCAG 2.4.7 this is a violation. Consider using `outline-style: none` only when the link is visible, or leaving a subtle outline.

---

### Content / SEO — ⚠️ Missing Social Meta Tags

**🟡 No Open Graph or Twitter Card meta tags**
When someone shares your portfolio link on LinkedIn (the most likely sharing scenario for a job-seeking portfolio), the preview will show a generic/blank card. You should add at minimum:
```html
<meta property="og:title" content="Zane Davis — Public Sector Technology & AI Policy" />
<meta property="og:description" content="MPA candidate at UNC-Chapel Hill..." />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://[your-domain.com]" />
<meta property="og:image" content="https://[your-domain.com]/assets/images/headshot_primary.jpeg" />
```

---

## Summary of Issues

| Priority | Issue | File(s) | Fix |
|----------|-------|---------|-----|
| 🔴 Critical | Mobile nav hides Contact link | `responsive.css:54` | Remove the `li:nth-child(3)` rule |
| 🟡 Important | Internal planning docs publicly tracked in git | repo root | Run `git rm --cached` on 3 files |
| 🟡 Important | Mixed-case image extensions (.JPG) | `assets/images/` | Rename to `.jpg` |
| 🟡 Important | Missing favicon | All HTML files | Add `<link rel="icon">` |
| 🟡 Important | Missing Open Graph meta tags | All HTML files | Add `og:*` meta tags |
| 🟡 Moderate | `headshot_copy.jpeg` filename | `index.html` | Rename file |
| 🟡 Moderate | No `loading="lazy"` on below-fold images | All HTML files | Add `loading="lazy"` attribute |
| 🟡 Moderate | Images missing `width`/`height` attributes | All HTML files | Add dimensions |
| 🟡 Moderate | Unused images in assets | `assets/images/` | Remove or use them |
| 🔵 Minor | `brief.css` never loaded | `css/pages/brief.css` | Delete or use |
| 🔵 Minor | Skip link removes outline on focus | `layout.css:27` | Reconsider |

---

## Deploy Checklist

**Date:** April 7, 2026 | **Deployer:** Zane Davis
**Target:** GitHub Pages (or static host)

### 🔴 Must-Fix Before Deploy

- [x] **Fix mobile nav** ✅ — Removed `li:nth-child(3)` from the `display: none` rule in `responsive.css:54`. Contact link is now visible on mobile.
- [x] **Internal planning docs** ✅ — Already untracked by git. `CONTENT_STRATEGY.md`, `site_architecture.md`, and `visual_identity_system.md` are ignored correctly; no action needed.
- [x] **`.JPG` file case** ✅ — HTML reference in `contact.html` already uses `headshot2.JPG` matching the actual filename; will work correctly on GitHub Pages. No action needed.

### 🟡 Should-Fix Before Deploy

- [x] **Add a favicon** ✅ — Full favicon set wired up on all 4 pages (`favicon/favicon.ico`, `favicon-32x32.png`, `favicon-16x16.png`, `apple-touch-icon.png`, `site.webmanifest`). Webmanifest updated with name "Zane Davis" and site brand colors.
- [x] **Add Open Graph meta tags** ✅ — `og:type`, `og:title`, `og:description`, `og:image` added to all 4 pages. **Note:** `og:image` uses a relative path for now — once the site is live, update to an absolute URL (e.g. `https://yourdomain.com/assets/images/headshot_primary.jpeg`) for proper LinkedIn/social previews.
- [x] **Rename `headshot_copy.jpeg`** ✅ — Renamed to `headshot_primary.jpeg`. `index.html` updated.
- [x] **Add `loading="lazy"`** ✅ — Added to all 12 `.brief-img` images across `index.html` and `work.html`, and to the contact page headshot. Hero image left eager (above the fold).
- [ ] **Verify all external links are live** — Check manually before deploying:
  - `https://americangerman.institute/2025/08/prospects-for-u-s-german-collaboration-in-ai/`
  - `https://americangerman.institute/2025/07/the-state-of-ai-in-germany/`
  - `https://americangerman.institute/2025/07/agi-profiles-dorothee-bar/`
  - `https://americangerman.institute/2025/06/chancellor-merz-and-germanys-new-determination/`
  - `https://americangerman.institute/2025/06/merz-bridges-g7-disputes-eyes-nato/`
  - `https://xgx755.github.io/Municipal-Fiscal-Health-Dashboard/`
  - `https://xgx755.github.io/North-Carolina-Tax-Map/`
  - `https://www.linkedin.com/in/zaneda/`
  - PDF downloads: `Davis_Zane_Resume.pdf` and `NYCPS_AI-EdTech-Project-Brief_Fall-2025.pdf`
- [x] **Remove unused images** ✅ — Deleted 11 images: `county1.png`, `county2.png`, `courtbalance1.png`, `courtbalance2.png`, `eaglescout1.JPG`, `football1.jpeg`, `headshot.jpeg`, `headshot_copy.jpeg`, `oldwell1.JPG`, `presenting.jpeg`, `working1.jpg`, `working2.jpg`. Assets folder now contains only images actively used on the site.

### Pre-Launch Verification

- [ ] **Test on mobile (375px)** — Load each page and verify: nav shows all 3 links, hero layout looks good, project rows stack correctly, CTA contact info is visible.
- [ ] **Test on tablet (768px)** — Verify credentials grid stacks, CV grid stacks, contact grid stacks.
- [ ] **Test keyboard navigation** — Tab through each page and confirm every interactive element is reachable and has a visible focus indicator.
- [ ] **Check browser tab** — Verify each page title is correct and favicon appears (once added).
- [ ] **Test PDF downloads** — Click both PDF links and confirm they open/download correctly.
- [ ] **Test the GitHub Pages / live URL** — After deploying, load the live URL (not local) to confirm fonts, images, and CSS all load correctly (no mixed-content or path errors).

### Post-Deploy

- [ ] Share URL on LinkedIn to verify the Open Graph preview card looks correct (once OG tags are added).
- [ ] Add the live URL to your LinkedIn profile, resume header, and email signature.
- [ ] Confirm the `xgx755.github.io` dashboard links open without errors from the live site.

---

### Rollback
Since this is a static site on GitHub Pages, rollback = `git revert` or force-push the previous commit. There are no databases or migrations to worry about.
