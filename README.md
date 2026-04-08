# Zane Davis — Portfolio Website

Personal portfolio site for Zane Davis — MPA candidate at UNC-Chapel Hill focused on public sector technology consulting and AI governance.

**Live site:** [zanedavis.com](https://zanedavis.com) *(or wherever this is deployed)*

---

## Tech Stack

Zero-dependency, vanilla HTML + CSS. No build tools, no JavaScript frameworks, no npm. Pages open directly in a browser.

- **HTML5** — semantic markup with full accessibility support (skip links, ARIA labels, landmark roles)
- **CSS** — custom design system with CSS custom properties; no utility frameworks
- **Fonts** — Inter + Source Serif 4 via Google Fonts

---

## Project Structure

```
/
├── index.html          # Homepage
├── work.html           # Work index
├── cv.html             # Full CV
├── contact.html        # Contact
├── work/
│   └── *.html          # Individual project pages
├── css/
│   ├── tokens.css      # Design tokens, reset, base styles
│   ├── layout.css      # Nav, page structure, footer
│   ├── components.css  # Reusable UI components
│   ├── responsive.css  # Mobile breakpoints
│   └── pages/          # Page-specific stylesheets
├── assets/
│   ├── images/         # Project images and headshot
│   └── Davis_Zane_Resume.pdf
└── favicon/
```

## CSS Architecture

The CSS is organized into a strict 5-layer cascade, loaded in this order on every page:

```
1. tokens.css      ← Variables, reset, base element styles
2. layout.css      ← Nav, page structure, section shells, footer
3. components.css  ← Reusable UI components
4. responsive.css  ← Mobile-only overrides
5. pages/[page].css← Page-specific styles (highest specificity)
```

---

## Running Locally

No build step required. Clone the repo and open `index.html` in a browser:

```bash
git clone https://github.com/zanedavis/portfolio.git
cd portfolio
open index.html
```

Or serve it with any static file server:

```bash
npx serve .
# or
python3 -m http.server 8080
```

---

## Design Principles

- **Minimalist, editorial aesthetic** — warm off-white background, typographic hierarchy, generous whitespace
- **No JavaScript** — all interactivity is CSS-only (hover states)
- **Tokens-first** — all colors, spacing, and type scales defined as CSS custom properties
- **Accessible** — skip links, ARIA landmarks, and `aria-current` on active nav links throughout

---

## License

© Zane Davis. All rights reserved.
