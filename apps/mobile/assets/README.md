# Asset placeholders

Replace these with real assets before shipping:

- `icon.png` — 1024×1024
- `adaptive-icon.png` — 1024×1024 (Android adaptive foreground)
- `splash.png` — 1284×2778 or larger, centered
- `favicon.png` — 48×48

Until they exist, `expo prebuild` will fail unless `app.json` references are removed or replaced. Use any placeholder PNGs to unblock first build.
