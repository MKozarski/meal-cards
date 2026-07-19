# Meal Cards

Snap a recipe you like. Get similar **meal cards**. Drag them onto your week. Get a simple multi-stop **shopping day** plan.

No store setup wizards. No price dashboards. No grocery-cart logins.

## Product in one sentence

**Photo a recipe → learn meal style → suggest more cards → plan the week by drag-and-drop → plan a shopping day from the user’s location — with optional easy sharing.**

## Core loop

```text
[ + Photo ]  →  meal card (confirm once)  →  similar cards
                        ↓
              drag cards onto Mon–Sun
                        ↓
               [ Shopping day ] one tap
```

## What’s in / out of scope

| In scope | Out of scope (for now) |
|----------|-------------------------|
| Recipe photo → structured meal card | Live shelf inventory / stock APIs |
| Similar meals from learned style | Third-party grocery cart checkout |
| Drag-and-drop weekly board | User-managed store configuration |
| Location (zip or device) → nearby store *types* | Live price feeds |
| Multi-stop shopping day + checklists | Complex admin / analytics UI |
| Share meal cards / weeks (link or QR) | |

## Docs

- [Project plan & requirements](docs/PROJECT.md)
- [Data model sketch](docs/DATA_MODEL.md)

## Prototype

Interactive vertical slice (Deal → Want → Week → Run):

```bash
cd meal-cards
python3 -m http.server 8765
# open http://localhost:8765/prototype/
```

Tap **Demo: Rice Robot page** to deal the photo-ingest fixture into two meal cards.

**Also in the prototype**
- **More like this** — similar meal cards from a local catalog (ranked by tags + ingredients)
- **Start the run** — zip or device location → nearby groceries via OpenStreetMap; ingredients routed to main vs specialty stops

Tone: playful kitchen. Shopping CTA: **Start the run** (subtitle: Shopping day).

## Status

Product docs + photo fixture + clickable prototype.

## License

TBD.
