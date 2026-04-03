# Zane Davis — Portfolio Website

> **This file is the primary knowledge source for any AI agent working on this codebase.** Read it fully before making changes.

A static, multi-page personal portfolio site for Zane Davis — MPA candidate at UNC-Chapel Hill, focused on public sector technology consulting and AI governance. It is a **zero-dependency, vanilla HTML + CSS** project. No build tools, no JavaScript frameworks, no npm. Pages open directly in a browser as local files.

---

## Sitemap

```
/ (index.html)          ← Homepage / landing
├── work.html           ← Work index (all projects listed)
│   ├── work/report-08.html   ← Engagement Brief: National Healthcare Data Exchange
│   ├── work/report-12.html   ← Engagement Brief: Municipal Open Data Portal
│   └── work/report-21.html   ← Engagement Brief: Public Sector AI Ethics
├── cv.html             ← Full CV (experience, education, publications, skills)
└── contact.html        ← Contact page (direct info + "what I'm looking for")

assets/
└── Davis_Zane_Resume.pdf     ← Downloadable resume (linked from multiple pages)
```

**Current navigation links (all pages):** Work · CV · Contact  
The nav brand ("Zane Davis") always links to `index.html`. `aria-current="page"` is set on the active page's nav link.

---

## File-by-File Reference

### Root HTML Pages

#### `index.html` — Homepage
**CSS loaded:** `tokens.css` → `layout.css` → `components.css` → `responsive.css` → `pages/home.css`

Sections (in order):
1. **Hero** (`.hero`) — Large serif `<h1>` "Zane Davis", a subtitle in small-caps uppercase, a tagline, and a 3–4 sentence bio paragraph. Max-width prose is overridden so the hero fills the page width.
2. **Selected Work** (`#impact`, `.section`) — Three `<article class="brief-row">` cards: AI Procurement Framework, Transatlantic AI Policy Research, NC Municipal Fiscal Health Dashboard. Each card has meta info (org · year), a serif `<h2>` title, a description paragraph, tag pills, and a `.brief-link` CTA.
3. **Background** (`#cv`, `.section`) — Two-column `.credentials-grid`: left is a bold statement + body paragraph; right is a `.timeline` list of four career entries plus a "Full CV" link.
4. **CTA / Contact** (`#contact`, `.cta-section`) — Two-column `.cta-grid`: left has the green status badge + serif headline; right has email, LinkedIn, resume PDF link, and location meta.
5. **Footer** — Copyright line only.

> **Known inconsistency:** The `work/report-*.html` briefs still reference "Elias Thorne — Technical Advisory" in the nav brand and use a fictional persona throughout. The actual site is for "Zane Davis." These brief files are **placeholder/template content** awaiting real case study content.

---

#### `work.html` — Work Index
**CSS loaded:** `tokens.css` → `layout.css` → `components.css` → `responsive.css` → `pages/work.css`

Sections:
1. **Page Header** (`.page-header`) — Label "Selected Work", `<h1>` "Projects & Research", and a short intro paragraph.
2. **Projects Section** (`.section`) — Contains a `.filter-section` div (CSS-only filtering — radio inputs + `:checked` sibling selectors, no JS). Currently the filter inputs exist in the CSS but the radio buttons **are not present in the HTML** — filtering is dormant. The `.briefs-list` contains 5 project entries:
   - AI Procurement Framework (Paragon Policy Fellowship, Fall 2025) — link disabled, "Publication forthcoming"
   - Transatlantic AI Policy Research (American-German Institute, Summer 2025) — links to published article
   - NC Municipal Fiscal Health Dashboard (Independent, 2025) — links to GitHub Pages
   - North Carolina County Tax Map (Independent, 2025) — links to GitHub Pages (Leaflet.js)
   - CourtBalance AI (Independent, 2025) — links to GitHub Pages demo
3. **CTA Section** (`.cta-section`) — Same two-column contact grid as homepage.
4. **Footer** — Copyright line.

---

#### `cv.html` — Full CV
**CSS loaded:** `tokens.css` → `layout.css` → `components.css` → `responsive.css` → `pages/cv.css`

Sections:
1. **Page Header** — Label "Professional Background", `<h1>` "Zane Davis", availability status badge.
2. **Experience** — `.timeline` list using the expanded variant (`.timeline-item--expanded`). Five entries: Plante Moran IT Consulting (Summer 2026), Paragon Policy Fellowship (Fall 2025), American-German Institute (Summer 2025), STEAMHEALS co-founder (2024–present), MWBSC GmbH Digital Strategy Intern (2022).
3. **Education** — Two-column `.education-grid`: MPA at UNC-Chapel Hill (Expected May 2027) and BA Economics at UNC (3.95 GPA, Phi Beta Kappa, Highest Distinction).
4. **Leadership & Service** — `.simple-list` with four entries: UNC Graduate Student Government Senator, Democracy & Dialogue Fellow, German Football League player, Eagle Scout.
5. **Publications** — `.publications-list` with six published/forthcoming articles, all from American-German Institute (2025) except one forthcoming NYC DOE report.
6. **Skills & Languages** — Tag pills for languages (English, German, French), tools (Python, R, Claude Code/Codex, Asana, NeonOne, Microsoft 365), and domain competencies.
7. **Download CTA** — Links to `assets/Davis_Zane_Resume.pdf`. Note: the `.download-link` class currently has `cursor: not-allowed; opacity: 0.6` in `cv.css` (line 147–148) — **this makes the link appear disabled/greyed out** even though the PDF is present. This is a known issue.
8. **CTA Section + Footer** — Standard contact grid and copyright.

---

#### `contact.html` — Contact
**CSS loaded:** `tokens.css` → `layout.css` → `components.css` → `responsive.css` → `pages/contact.css`

Sections:
1. **Page Header** — Label "Get In Touch", `<h1>` "Let's connect.", intro paragraph.
2. **Contact Section** — Two-column `.contact-grid` (340px fixed left, 1fr right):
   - Left: availability badge, email, LinkedIn, PDF resume, location meta, cross-links to Work and CV.
   - Right: "What I'm looking for" — three prose-style paragraphs describing target role types. Uses inline `style` attributes on `<p>` tags for spacing (minor inconsistency — see below).
3. **No form** — The page has no `<form>` element. The inquiry form defined in `contact.css` (`.inquiry-form`, `.form-group`, `.form-input`, etc.) is **fully styled but not used** in the current HTML.
4. **Footer** — Copyright line.

---

#### `work/report-08.html`, `work/report-12.html`, `work/report-21.html` — Engagement Briefs
**CSS loaded (relative paths):** `../css/tokens.css` → `../css/layout.css` → `../css/components.css` → `../css/responsive.css` → `../css/pages/brief.css`

These are deep-linked individual project pages following the same template structure:
1. **Nav** — Uses relative paths (`../index.html`, `../work.html`, etc.). **Contains "Elias Thorne" placeholder persona** — needs to be updated to "Zane Davis."
2. **Brief Page Header** (`.brief-page-header`) — Breadcrumb nav (Home → Work → Report No. XX), report number + date meta, large serif `<h1>`, client/agency sub-line.
3. **Engagement Summary** (`.section`) — Long-form narrative prose in `.narrative-body`. Tagged with `<!-- PLACEHOLDER -->` comments — this is **fictional template content**, not real case studies.
4. **Key Outcomes** (`.section`) — `.outcome-grid` with 3 stat cards (`.outcome-card`): a large numeric value, a label, and context text.
5. **Methodology** (`.section`) — Ordered `<ol class="methodology-list">` with auto-numbered steps using CSS counters. Each `.methodology-item` has a phase name and description.
6. **Frameworks & Standards Referenced** (`.section`) — Tag pills listing relevant frameworks (NIST AI RMF, EU AI Act, etc.).
7. **Related Engagements** (`.section`) — `.related-grid` (2-column) cross-linking the other two brief files.
8. **CTA + Footer** — Uses "Elias Thorne" persona contact info. Footer says "© 2024 Thorne Technology Advisory."

**These brief pages are the primary area requiring real content.** None of the work/report-*.html files contain real Zane Davis project details yet.

---

### CSS Architecture

The CSS is organized into a strict 4-layer cascade, loaded in this order on every page:

```
1. css/tokens.css       ← Variables, reset, base element styles
2. css/layout.css       ← Nav, page structure, section shell, footer, utilities
3. css/components.css   ← All reusable UI components
4. css/responsive.css   ← Media queries (mobile overrides only)
5. css/pages/[page].css ← Page-specific overrides (last, highest specificity)
```

**Golden rule:** Do not add styles to a layer above its purpose. Component-specific responsive rules go in the page stylesheet (e.g., `brief.css` has its own `@media` blocks), not in `responsive.css`.

---

### CSS File Details

#### `css/tokens.css` — Design Tokens + Reset + Base
The single source of truth for the design system. Edit this file to change colors, type scales, or spacing globally.

**Color palette:**
| Token | Hex | Usage |
|---|---|---|
| `--bg` | `#F5F2EC` | Page background (warm off-white) |
| `--text-primary` | `#1A1A17` | Headings, primary text |
| `--text-body` | `#3A3A37` | Body paragraphs |
| `--text-muted` | `#5E5E59` | Labels, meta, tags (WCAG AA 4.6:1) |
| `--text-faint` | `#6E6E69` | Footer text (WCAG AA 4.5:1) |
| `--border` | `#D6D2CA` | Section dividers, card borders |
| `--border-light` | `#E5E2DB` | Light internal borders (list rows) |
| `--nav-border` | `#C8C4BC` | Sticky nav bottom border (3px) |
| `--accent-green` | `#3D7A4E` | Status dot only (WCAG AA compliant) |

**Typography:**
- `--sans`: Inter (300/400/500/600 weights) — loaded from Google Fonts
- `--serif`: Playfair Display (400/700) — loaded from Google Fonts

**Layout tokens:**
- `--max-w: 660px` — prose container cap (used inside `.container`)
- `--px: 28px` — inner container padding
- `--page-px: 160px` — full-width section horizontal padding (desktop). Reduced to 40px at 768px, 20px at 560px.

**Motion:**
- `--transition-base: 0.18s ease`
- `--transition-fast: 0.10s ease`

Also defines: CSS reset (`* { box-sizing: border-box; margin: 0; padding: 0; }`), `body` base styles, global `a` styles, `:focus-visible` outline, `hr` rule, and `.sr-only` utility.

---

#### `css/layout.css` — Page Structure
Defines the structural skeleton used on every page:

- **`.container`** — `max-width: 660px`, centered with `--px` padding. Inside `.section` and `.cta-section`, `.container` is **overridden to `max-width: none; margin: 0; padding: 0`** so sections use `--page-px` directly.
- **`.skip-link`** — Hidden skip-to-content link for keyboard accessibility, revealed on `:focus`.
- **Spacing utilities** — `.mt-xs` (12px), `.mt-sm` (16px), `.mt-md` (20px), `.mt-lg` (28px), `.mb-0`, `.mb-sm`, `.mb-lg`, `.pt-md` (32px).
- **`.site-nav`** — `position: sticky; top: 0; z-index: 100`. Contains `.nav-inner` (height 58px, `padding: 0 var(--page-px)`). Active page link uses `aria-current="page"` → `opacity: 0.4; pointer-events: none`.
- **`.page-header`** — Used on interior pages (work, cv, contact). Padding `56px / 44px / page-px / page-px`. Contains `.page-header-label` (small-caps), `.page-header-title` (48px serif), `.page-header-intro` (capped at 520px).
- **`.section` / `.cta-section`** — Full-width sections with `border-top: 2px solid var(--border)` and `padding: 48px var(--page-px) 52px`.
- **`.section-label`** — 11px uppercase spaced label above section content.
- **`.site-footer`** — `border-top: 2px solid var(--border)`. Fixed 40px height. Contains `.footer-copy` and `.footer-notice` (small-caps, muted).

---

#### `css/components.css` — Reusable UI Components

| Component | Class(es) | Description |
|---|---|---|
| **Expertise Grid** | `.expertise-grid`, `.expertise-card`, `.expertise-num`, `.expertise-title`, `.expertise-body` | 3-col grid for expertise/focus areas. *Not currently used in any live page.* |
| **Brief Row** | `.briefs-list`, `.brief-row`, `.brief-meta`, `.brief-content`, `.brief-report-num`, `.brief-title`, `.brief-desc` | The primary list item for work entries. 2-col grid (220px meta / 1fr content). Hover state: light background + 3px left inset shadow + horizontal padding shift. |
| **Tags** | `.tags`, `.tag` | Flex-wrap pill list. Uppercase 10.5px, bordered, 1px radius. |
| **Brief Link** | `.brief-link` | Small-caps CTA link with `↗` pseudo-element suffix. |
| **Credentials Grid** | `.credentials-grid`, `.credentials-statement`, `.credentials-body` | 2-col grid (340px / 1fr) for bio/statement + timeline. Used on homepage Background section. |
| **Timeline** | `.timeline`, `.timeline-item`, `.timeline-role`, `.timeline-dates` | Simple list of experience entries. Border-separated rows. Extended variant (`.timeline-item--expanded`) defined in `cv.css`. |
| **Status Badge** | `.status-badge`, `.status-dot`, `.status-label` | Green dot + uppercase label. Used in hero/CTA sections to signal availability. |
| **CTA Grid** | `.cta-grid`, `.cta-headline`, `.cta-right`, `.cta-contact-link`, `.cta-meta` | 2-col equal-width grid for CTA sections. Left: headline. Right: contact links stacked vertically. |

---

#### `css/responsive.css` — Mobile Breakpoints
Three breakpoints with **mobile-override-only** rules (no desktop-first duplication):

| Breakpoint | Changes |
|---|---|
| `≤ 768px` | `--page-px` → 40px; `.page-header-title` → 36px |
| `≤ 560px` | `--page-px` → 20px; nav hides 3rd + 4th links; `.expertise-grid`, `.brief-row`, `.credentials-grid`, `.cta-grid` all collapse to 1-column; `.footer-notice` hidden; `.page-header-title` → 28px |
| `≤ 380px` | Reserved for hero `<h1>` scaling (handled in `home.css`) |

---

#### `css/pages/home.css` — Homepage Hero
Only contains `.hero` and its child selectors. Overrides `.container` inside `.hero` to remove max-width. Sets the large 64px serif `<h1>`, 11px uppercase subtitle, 22px serif tagline, and 14px body paragraph (capped at 420px). Responsive: 36px at 560px, 28px at 380px.

---

#### `css/pages/work.css` — Work Index Page
- **`.stat-strip`** — Horizontal flex row of stat blocks (`.stat-value`, `.stat-desc`). *Stat strip is defined but not present in the current `work.html`* — available to add.
- **Filter system** (CSS-only, no JS): Visually-hidden radio inputs (`#f-all`, `#f-infra`, `#f-gov`, `#f-ai`) + `:checked ~ .filter-section` sibling selectors to toggle `display: none` on `[data-cat]` brief rows. The radio inputs and `data-cat` attributes are **not in the current HTML** — this is an unimplemented feature ready to be wired up.
- **`.work-cta-line`** — Flex row used for the "View all projects" CTA below the brief list on the homepage.

---

#### `css/pages/brief.css` — Individual Engagement Brief Pages
Styles for the `work/report-*.html` brief template:
- **`.breadcrumb`** — Inline nav with `→` separators.
- **`.brief-page-header`** — Large header zone with `.brief-header-meta` (report number + date), 52px serif title, agency sub-line.
- **`.narrative-body`** — Prose paragraphs at 14px, line-height 1.82, max-width 600px.
- **`.outcome-grid`** — 3-col stat card grid. Cards have a 40px serif number, label, and context line.
- **`.methodology-list`** — Auto-numbered `<ol>` using CSS counters (`decimal-leading-zero`). 2-col grid per item (36px counter column + content).
- **`.related-grid`** — 2-col grid for related brief cross-links.
- Responsive: 2-col outcome grid at 768px, all single-column at 560px.

---

#### `css/pages/cv.css` — CV Page
Extends `components.css` timeline with:
- **`.timeline-item--expanded`** — Stacks role + context vertically instead of the basic side-by-side layout.
- **`.timeline-row`** — Flex row within expanded items for role + date alignment.
- **`.education-grid`** — 2-col grid. Collapses at 560px.
- **`.simple-list` / `.simple-list-item`** — Border-separated list for leadership/service entries. Right-aligned meta column.
- **`.publications-list` / `.publication-item`** — List for publications with title and venue sub-line.
- **`.download-row` / `.download-link`** — Download CTA. **Currently styled with `opacity: 0.6; cursor: not-allowed`** — making the PDF link appear disabled even though the file exists. Fix: remove those two declarations from `.download-link`.

---

#### `css/pages/contact.css` — Contact Page
- **`.contact-grid`** — 2-col layout (340px / 1fr), collapses to 1-col at 768px.
- **`.contact-block-label`**, `.contact-link`, `.contact-meta`, `.contact-note` — Left column contact info styles.
- **Inquiry form styles** (`.inquiry-form`, `.form-group`, `.form-label`, `.form-input`, `.form-select`, `.form-textarea`, `.form-submit`) — Fully styled inline-only form components with transparent backgrounds and bottom-border inputs. **No `<form>` is currently present in `contact.html`** — these styles exist for a future form implementation.

---

### Other Files

#### `assets/Davis_Zane_Resume.pdf`
The downloadable resume. Linked from `index.html`, `work.html`, `cv.html`, `contact.html`, and inside the brief CTA sections. Path is always `assets/Davis_Zane_Resume.pdf` from root pages; brief pages do not currently link it correctly (they inherit Elias Thorne persona contact).

#### `assets/README.txt`
A short note (115 bytes) in the assets folder — likely a placeholder or old artifact. Not surfaced anywhere on the site.

#### `CONTENT_STRATEGY.md`
A detailed content planning document. Not rendered on the site. Useful background for understanding editorial voice, messaging, and planned content direction.

#### `site_architecture.md`
The original site architecture specification document. Documents the planned folder structure, page relationships, and CSS layer decisions made during the initial build phase.

#### `visual_identity_system.md`
Detailed documentation of the visual identity (colors, typography, spacing rationale). Cross-references the design tokens in `tokens.css`. Useful for understanding design intent before making visual changes.

---

## Known Issues & Technical Debt

| Priority | Issue | Location | Fix |
|---|---|---|---|
| 🔴 High | Brief pages use "Elias Thorne" placeholder persona throughout (nav brand, contact info, footer) | `work/report-*.html` | Replace with Zane Davis identity; update CTA contact info |
| 🔴 High | Brief page content is fictional template content, not real case studies | `work/report-*.html` | Replace narrative, outcomes, and methodology with real project data |
| 🟡 Medium | `.download-link` appears greyed out/disabled despite PDF existing | `css/pages/cv.css` L147–148 | Remove `cursor: not-allowed; opacity: 0.6` |
| 🟡 Medium | Filter radio buttons and `data-cat` attributes not wired in HTML | `work.html`, `css/pages/work.css` | Add `<input type="radio">` elements and `data-cat` attributes to enable CSS filtering |
| 🟡 Medium | Contact page has inline `style` attributes for spacing on `<p>` tags | `contact.html` L75–77 | Replace with CSS utility classes or dedicated selectors |
| 🟡 Medium | Inquiry form fully styled in CSS but has no corresponding HTML | `contact.html`, `css/pages/contact.css` | Either add a `<form>` element or remove dormant CSS |
| 🟠 Low | Brief pages use 4-item nav (Expertise, Work, CV, Contact) while main nav has 3 items (Work, CV, Contact) — "Expertise" link is a leftover from old homepage structure | `work/report-*.html` | Remove "Expertise" nav link; standardize to 3-item nav |
| 🟠 Low | `.expertise-grid` component is fully styled but unused on any current page | `css/components.css` | Remove or document for future use |
| 🟠 Low | `.stat-strip` is fully styled but not present in `work.html` | `css/pages/work.css` | Add stat strip HTML or remove CSS |

---

## Design Principles (Do Not Violate)

1. **Minimalist, editorial aesthetic** — warm off-white background, typographic hierarchy, generous whitespace. No photography, no illustrations, no decorative color beyond the green status dot.
2. **No JavaScript** — all interactivity is CSS-only (hover states, filter system). Do not introduce JS.
3. **No external dependencies** — no npm, no build tools, no CDN fonts beyond the two Google Fonts already loaded.
4. **Tokens-first** — always use CSS custom properties from `tokens.css`. Never hardcode hex colors or pixel values that duplicate token values.
5. **Semantic HTML + Accessibility** — every page has a skip link, `aria-label` on nav, `aria-current="page"` on active link, `aria-labelledby` on sections, `role="banner"` on `<header>`, `role="contentinfo"` on `<footer>`.
6. **CSS load order matters** — the 5-layer cascade (`tokens → layout → components → responsive → page`) must be respected. Never load a page stylesheet before the shared ones.
