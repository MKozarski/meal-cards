# Meal Cards — Project plan & requirements

## 1. Vision

Meal Cards helps people turn recipes they already like into a low-friction weekly meal plan and a practical shopping trip.

Users do **not** configure stores, aisles, or pricing systems. They:

1. Take a photo (or upload a screenshot) of a recipe they like  
2. Confirm a generated **meal card**  
3. Browse **similar** meal cards in the same general style  
4. **Drag and drop** cards onto days of the week  
5. Open a **shopping day** plan: where to stop, what to get at each stop  
6. Optionally **share** a card or a week with friends/family  

---

## 2. Design principles

1. **Dead simple** — Primary path is photo → cards → week → shopping day. Prefer defaults over settings.  
2. **Show, don’t configure** — Meal style is learned from liked recipes and planned meals, not long preference forms.  
3. **Hide complexity** — Store roles, ingredient routing, and similarity logic stay under the hood.  
4. **Actionable shopping without commerce** — Output is checklists and stop order (and map links), not checkout.  
5. **Share lightly** — Link/QR first; optional friends list later. No heavy social product.  

---

## 3. Personas (meal *types*, not a single cuisine)

A “meal type” is a pattern learned from user behavior, for example:

- One-pot grain + protein + veg  
- High-protein plate with simple sides  
- Sheet-pan dinners  
- Stir-fry style  
- Soup / stew batch cook  

Any single recipe (e.g. a spicy rice cooker dish) is only an **example instance** of a type for that user. Different users develop different types from the recipes they photograph and pin to the week.

The product must support **multiple concurrent styles** across the user base, not a single fixed cuisine theme.

---

## 4. Functional requirements

### 4.1 Recipe ingest

| ID | Requirement |
|----|-------------|
| R1 | User can upload a photo or screenshot of a recipe. |
| R2 | System extracts title, ingredients, steps, servings, and method hints into a structured meal card. |
| R3 | User can confirm or lightly edit the card before save (required trust step). |
| R4 | Saved cards are stored in the user’s library. |

### 4.2 Meal cards & similarity

| ID | Requirement |
|----|-------------|
| R5 | Each meal is presented as a **card** (name, short description, effort/time if known, style chips). |
| R6 | From a liked/saved card, system suggests **similar** cards (retrieve and/or generate within style constraints). |
| R7 | Similarity uses structured signals (ingredients, method, protein base, effort) and a taste profile updated from likes and week placements. |
| R8 | User can dismiss or ignore suggestions without penalty beyond weaker ranking. |

### 4.3 Weekly planning

| ID | Requirement |
|----|-------------|
| R9 | Week view with days; user can **drag and drop** meal cards onto days. |
| R10 | User can remove, move, or duplicate a planned meal. |
| R11 | Servings adjustable per planned meal (default from card). |
| R12 | Planning a meal reinforces the user’s meal-type / taste profile. |

### 4.4 Location

| ID | Requirement |
|----|-------------|
| R13 | User can set location via **zip code**. |
| R14 | User may allow **automatic location** when the platform permits; system derives a usable local area (e.g. zip/metro). |
| R15 | Location is used only to discover nearby store *options* and to order shopping stops—not to require brand loyalty setup. |

### 4.5 Shopping day (no carts)

| ID | Requirement |
|----|-------------|
| R16 | From a planned week (or selected meals), system builds a **merged shopping list** (quantities combined). |
| R17 | User can mark pantry staples as “have” so they drop off the list (simple, not a full inventory system in v1). |
| R18 | Ingredients are assigned to **store roles** automatically (e.g. main supermarket, specialty market when needed). |
| R19 | System uses location + public place discovery and **category heuristics** (and optional static “likely carried by store type” knowledge) to choose stops—not live SKU inventory. |
| R20 | User sees a **shopping day** view: ordered stops, checklist per stop, approximate stop count/time guidance. |
| R21 | User can open multi-stop directions in an external maps app when available. |
| R22 | If all items fit one stop, present a **single-stop** plan. |
| R23 | No third-party grocery cart integration in scope. No live price requirement. |

### 4.6 Sharing & collaboration

| ID | Requirement |
|----|-------------|
| R24 | User can share a **meal card** via link and/or QR code. |
| R25 | User can share a **week plan** via link and/or QR code. |
| R26 | User can share a **shopping list / shopping day** (e.g. split stops informally). |
| R27 | Recipients can view shared content with minimal friction (account optional for view-only where possible). |
| R28 | Optional later: friends list for recurring sharing; not required for MVP if link/QR works. |

---

## 5. Non-functional requirements

| ID | Requirement |
|----|-------------|
| N1 | Primary flows usable on mobile web (photo + week board + shopping day). |
| N2 | UI stays task-focused: meal cards, week board, shopping day, share. Avoid dense configuration or dashboard-heavy screens. |
| N3 | Extraction and suggestions may be imperfect; confirm/edit paths must make recovery easy. |
| N4 | USA-focused place discovery and store-type assumptions for initial versions. |
| N5 | Hobby / early product: prefer simple architecture and clear data ownership over scale optimizations. |

---

## 6. Explicit non-goals (current)

- Grocery vendor cart APIs or automatic checkout  
- Live prices or guaranteed in-stock status per SKU  
- User-facing store pickers, aisle maps, or “configure my preferred chains” flows  
- Full household pantry ERP  
- Heavy social network features (feeds, comments, public discovery marketplace)  

---

## 7. Under-the-hood concepts (not user settings)

These exist so the product can stay simple:

| Concept | Purpose |
|---------|---------|
| **Taste / meal-type profile** | Rank “more like this” from photos and week usage |
| **Canonical ingredients** | Merge lists and map to store roles |
| **Store roles** | Main grocery vs specialty vs optional bulk—assigned automatically |
| **Place discovery by location** | Which physical options exist near the user |
| **Routing heuristics** | Multi-stop order and “one stop this week” when possible |

---

## 8. MVP scope

Ship a vertical slice:

1. Photo → confirm meal card → library  
2. Similar cards for a seed style  
3. Drag-and-drop week board  
4. Zip or device location (once)  
5. Shopping day: stops + checklists + maps link  
6. Share card or week via link/QR  

### Post-MVP

- Stronger multi-style clustering per user  
- Better specialty-stop detection by metro  
- Friends list and split-shopping helpers  
- Community corrections to “usually found at” mappings (invisible to casual users)  

---

## 9. Success criteria (MVP)

- A new user can go from **first photo** to a **filled week** without a settings tour.  
- Shopping day answer is clear: **how many stops**, **what to get where**, **suggested order**.  
- Sharing a card or week works for someone who has never used the app.  
- Users with different meal styles (not one cuisine) can each get relevant suggestions from *their* photos.  

---

## 10. Suggested implementation phases

| Phase | Deliverable |
|-------|-------------|
| **0** | This repo: product docs + data model |
| **1** | Schema + seed meal cards + week planner UI (manual add OK) |
| **2** | Photo ingest + confirm flow |
| **3** | Similarity / “more like this” |
| **4** | Location + stop assignment + shopping day |
| **5** | Link/QR share |
| **6** | Polish mobile UX + harden extraction |

---

## 11. Open questions

1. Account model for MVP: fully local-first vs minimal auth for sync/share?  
2. Generation vs retrieval mix for similar cards (quality control)?  
3. Which maps/places provider for nearby store discovery?  
4. How aggressive should specialty-stop splitting be (avoid unnecessary second stops)?  

Decisions can land in short ADRs under `docs/decisions/` as they are made.
