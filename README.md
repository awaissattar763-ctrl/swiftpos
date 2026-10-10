# SwiftPOS — Concept Demo

A retail / departmental-store point-of-sale concept demo built with Next.js,
TypeScript and Tailwind CSS. Statically exported for GitHub Pages.

**This is a concept demo, not a production system:**

- All data is fictional seed data for a made-up store ("SwiftMart General Store").
- Data is stored only in the browser's `localStorage` — there is no backend.
- Checkout is **simulated**. Cash / Card / Digital tender types move no real money.
- Demo logins are one-click buttons; there is no real authentication.

## Develop

```bash
npm install
npm run dev
```

## Build (static export)

```bash
npm run build   # outputs to ./out/
```

The `gh-pages` branch serves `./out/` (plus `.nojekyll`) at
https://awaissattar763-ctrl.github.io/swiftpos/.
