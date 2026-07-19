# Photo ingest test fixtures

## `rice-robot-cajun-dirty-and-fried-rice`

| File | Role |
|------|------|
| `rice-robot-cajun-dirty-and-fried-rice.jpg` | Source photo (printed page on countertop) |
| `rice-robot-cajun-dirty-and-fried-rice.expected.json` | Expected structured meal cards after extract + split |

### Why this fixture matters

1. **Real user capture** — same style of photo the product is built for (phone photo of a printed recipe).
2. **Two recipes in one image** — extractors must produce **two** meal cards (Cajun Dirty Rice + Fried Rice), not one merged blob.
3. **Appliance-specific units** — “Rice Robot Rice cups” / “Rice Robot Water cups” should survive extraction (or normalize with a clear mapping).
4. **Confirm step** — blurbs and salt “to taste” are good cases for user confirm/edit (requirement R3).

### Acceptance checks (when ingest exists)

- [ ] Both titles detected: `Cajun Dirty Rice`, `Fried Rice`
- [ ] Ingredient counts roughly match expected (6 and 7 lines)
- [ ] Three steps per recipe
- [ ] Method tags include rice-cooker / one-pot
- [ ] Cards are independently savable and plannable on the week board

### Provenance

Captured as a phone photo of a printed recipe page; contributed as the initial end-to-end photo-ingest test case for Meal Cards.
