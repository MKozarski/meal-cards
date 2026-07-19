# Data model sketch

Minimal entities for the MVP. Names are illustrative; storage can be JSON files, SQLite, or a small backend later.

## User

| Field | Notes |
|-------|--------|
| `id` | |
| `location` | Zip and/or lat-lng; source: manual zip vs device |
| `taste_profile` | Derived; not a long form the user fills out |
| `created_at` | |

## MealCard

| Field | Notes |
|-------|--------|
| `id` | |
| `owner_id` | Null/system for shared catalog seeds |
| `title` | |
| `summary` | Short blurb for the card face |
| `ingredients[]` | `{ name, quantity, unit, canonical_id? }` |
| `steps[]` | Optional free text steps |
| `servings` | Default servings |
| `method_tags[]` | e.g. one-pot, sheet-pan, stir-fry |
| `style_tags[]` | Derived cuisine/style chips |
| `effort_minutes` | Optional |
| `source` | `photo` \| `generated` \| `seed` \| `shared` |
| `source_image_url` | Optional |
| `embedding_ref` | Optional pointer for similarity |

## TasteProfile (derived)

| Field | Notes |
|-------|--------|
| `user_id` | |
| `signals` | Aggregated tags, ingredient preferences, methods |
| `updated_at` | Updated when user saves cards or plans meals |

## WeekPlan

| Field | Notes |
|-------|--------|
| `id` | |
| `user_id` | |
| `week_start` | Date (locale week start TBD) |
| `slots[]` | `{ date, meal_card_id, servings }` |

## ShoppingList / ShoppingDay

Derived from a `WeekPlan` (or explicit meal selection); may be snapshot-persisted.

| Field | Notes |
|-------|--------|
| `id` | |
| `user_id` | |
| `source_plan_id` | |
| `items[]` | `{ canonical_id, display_name, quantity, unit, store_role, checked }` |
| `stops[]` | `{ role, place_name, place_id?, address?, item_ids[], sort_order }` |
| `generated_at` | |

## PlaceCandidate (system)

Not user-configured preferred stores.

| Field | Notes |
|-------|--------|
| `place_id` | External places provider id when available |
| `name` | |
| `types[]` | supermarket, asian_grocery, warehouse, etc. |
| `location` | |
| `distance_m` | From user location |

## ShareToken

| Field | Notes |
|-------|--------|
| `id` / `token` | |
| `resource_type` | `meal_card` \| `week_plan` \| `shopping_day` |
| `resource_id` | |
| `expires_at` | Optional |
| `permissions` | View-only for MVP |

## Friends (post-MVP)

| Field | Notes |
|-------|--------|
| `user_id` | |
| `friend_user_id` | |
| `status` | pending \| accepted |

---

## Ingredient → store role (logic, not a user screen)

Example rules (system-owned):

- Default → `main_supermarket`  
- Specialty sauces/condiments poorly covered by typical main stores → `specialty` if a suitable place is near; else `main_supermarket` with note  
- Optional bulk-only items → `warehouse` only when distance/benefit heuristics pass  

Exact rule tables live in code/config, not in the user settings UI.
