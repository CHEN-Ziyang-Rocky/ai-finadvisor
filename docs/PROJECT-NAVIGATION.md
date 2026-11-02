# Project navigation

AI Financial Advisor exposes an integrated `Project links` navigation on application, sign-in and demo pages (and registration where supported). Both links remain visible on mobile without opening a menu. Application headers and the compact demo controls stay at the top while the page scrolls. Links share the existing application toolbar (or the shop announcement bar), rather than adding a separate navigation row. Public entry pages group the links with the application identity.

- `← Portfolio`: return to https://imrocky.com/ in the current tab.
- `GitHub ↗`: open https://github.com/CHEN-Ziyang-Rocky/ai-finadvisor in a new tab, with `noopener noreferrer`.
- Demo entry: https://finance.imrocky.com/demo

The links use ordinary anchors, visible keyboard focus and a minimum 44px touch height. They do not create sessions or change authentication. This change adds no dependencies, backend routes, database migrations or infrastructure configuration.

Deploy using the existing frontend build and deployment process. Preserve environment files, backend processes and database contents. Keep the preceding frontend build for rollback; after restoring a Next.js build, restart only its frontend process. For the static React app, restore the preceding index/asset manifest while retaining its hashed static assets.
