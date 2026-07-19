/**
 * Meal Cards prototype — Deal → Want → Week → Run
 * Similar cards + local store matching (OSM).
 */

const STORAGE_KEY = "meal-cards-proto-v2";
const DAYS = [
  { key: "mon", label: "Mon", short: "M" },
  { key: "tue", label: "Tue", short: "T" },
  { key: "wed", label: "Wed", short: "W" },
  { key: "thu", label: "Thu", short: "T" },
  { key: "fri", label: "Fri", short: "F" },
  { key: "sat", label: "Sat", short: "S" },
  { key: "sun", label: "Sun", short: "S" },
];

const FIXTURE_URL = "../testdata/photo-ingest/rice-robot-cajun-dirty-and-fried-rice.expected.json";
const CATALOG_URL = "./data/similar-catalog.json";
const OSM_UA = "MealCardsPrototype/0.2 (hobby; local meal planning)";

/** @type {{ library: object[], want: string[], week: Record<string, string|null>, checked: Record<string, boolean>, location: object|null, places: object|null }} */
let state = loadState();

let pendingHand = [];
let selectedWantId = null;
let dragCardId = null;
/** @type {object[]} */
let similarCatalog = [];
let similarShuffle = 0;

// ——— Persistence ———

function defaultState() {
  return {
    library: [],
    want: [],
    week: Object.fromEntries(DAYS.map((d) => [d.key, null])),
    checked: {},
    location: null,
    places: null,
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultState(), ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return defaultState();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ——— Ingredient → store role ———

const SPECIALTY_HINTS = [
  "oyster",
  "sesame oil",
  "mirin",
  "gochujang",
  "fish sauce",
  "rice vinegar",
  "miso",
  "kimchi",
  "sambal",
  "shaoxing",
  "nori",
  "tofu",
];

const BULK_HINTS = ["rice", "chicken broth", "beef broth", "coconut milk", "chickpeas"];

function storeRoleForIngredient(name) {
  const n = (name || "").toLowerCase();
  if (SPECIALTY_HINTS.some((h) => n.includes(h))) return "specialty";
  return "main";
}

// ——— Similarity ———

function tagSet(card) {
  return new Set([...(card.method_tags || []), ...(card.style_tags || [])].map((t) => t.toLowerCase()));
}

function ingredientNames(card) {
  return new Set(
    (card.ingredients || []).map((i) => (i.name || i.display || "").toLowerCase().split(",")[0].trim())
  );
}

function similarityScore(a, b) {
  if (!a || !b || a.id === b.id) return 0;
  const ta = tagSet(a);
  const tb = tagSet(b);
  let tagScore = 0;
  for (const t of ta) if (tb.has(t)) tagScore += 1;
  const ia = ingredientNames(a);
  const ib = ingredientNames(b);
  let ingScore = 0;
  for (const n of ia) {
    for (const m of ib) {
      if (n && m && (n.includes(m) || m.includes(n))) {
        ingScore += 0.5;
        break;
      }
    }
  }
  return tagScore * 2 + ingScore;
}

function anchorsForSimilar() {
  const fromWant = state.want.map(cardById).filter(Boolean);
  if (fromWant.length) return fromWant;
  if (pendingHand.length) return pendingHand;
  return state.library.filter((c) => c.source === "photo" || !c.source || c.source === "seed");
}

function rankSimilar(limit = 4) {
  const anchors = anchorsForSimilar();
  if (!anchors.length || !similarCatalog.length) return [];

  const owned = new Set(state.library.map((c) => c.id));
  const scored = similarCatalog
    .filter((c) => !owned.has(c.id))
    .map((c) => {
      const score = Math.max(...anchors.map((a) => similarityScore(a, c)));
      return { card: c, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  // rotate for Shuffle
  if (!scored.length) return [];
  const rot = similarShuffle % scored.length;
  const rotated = scored.slice(rot).concat(scored.slice(0, rot));
  return rotated.slice(0, limit).map((x) => x.card);
}

function addSimilarToLibrary(card) {
  if (state.library.some((c) => c.id === card.id)) return;
  state.library.push({ ...card, source: "similar" });
  saveState();
}

// ——— Places / location ———

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1);
  const dLon = toR(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const SPECIALTY_NAME_RE =
  /asian|chinese|korean|japanese|vietnamese|thai|indian|oriental|h-?\s*mart|99\s*ranch|seafood city|uwajimaya|mitsuwa|super h|\bhindu\b|halal market|latin market|mercado/;

function classifyPlace(tags = {}, displayName = "") {
  const name = `${tags.name || ""} ${tags.brand || ""} ${displayName}`.toLowerCase();
  const shop = (tags.shop || "").toLowerCase();

  if (SPECIALTY_NAME_RE.test(name)) return "specialty";
  if (shop === "wholesale" || /costco|sam'?s club|bj'?s/.test(name)) return "bulk";
  if (
    shop === "supermarket" ||
    shop === "grocery" ||
    shop === "convenience" ||
    shop === "greengrocer" ||
    shop === "department_store" ||
    tags.amenity === "marketplace"
  ) {
    return "main";
  }
  if (/publix|walmart|aldi|kroger|safeway|food lion|winn-?dixie|trader joe|whole foods|target|heb|meijer|weismann|wegmans|harris teeter|sprouts|lidl|giant|stop\s*&?\s*shop/.test(name)) {
    return "main";
  }
  if (shop) return "main";
  return "main";
}

function placeDisplayName(tags = {}) {
  return tags.name || tags.brand || tags["name:en"] || tags.operator || null;
}

async function geocodeZip(zip) {
  const q = encodeURIComponent(`${zip}, USA`);
  const url = `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(zip)}&countrycodes=us&format=json&limit=1`;
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": OSM_UA } });
  if (!res.ok) throw new Error("Geocoder unavailable");
  const data = await res.json();
  if (!data?.length) {
    // fallback free-text
    const res2 = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
      { headers: { Accept: "application/json", "User-Agent": OSM_UA } }
    );
    const data2 = await res2.json();
    if (!data2?.length) throw new Error("Zip not found");
    return {
      lat: parseFloat(data2[0].lat),
      lon: parseFloat(data2[0].lon),
      label: data2[0].display_name?.split(",").slice(0, 3).join(",") || zip,
      zip,
    };
  }
  return {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
    label: data[0].display_name?.split(",").slice(0, 3).join(",") || zip,
    zip,
  };
}

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter",
];

function normalizePlaces(rawList, lat, lon) {
  const places = rawList
    .map((el) => {
      const plat = el.lat ?? el.center?.lat ?? (el.geometry && el.geometry[0]?.lat);
      const plon = el.lon ?? el.center?.lon ?? (el.geometry && el.geometry[0]?.lon);
      if (plat == null || plon == null) return null;
      const tags = el.tags || {};
      const name = placeDisplayName(tags) || el.display_name?.split(",")[0];
      if (!name) return null;
      const role = classifyPlace(tags, name);
      const miles = haversineMiles(lat, lon, plat, plon);
      // drop absurd outliers (bad geocode / world results)
      if (miles > 40) return null;
      return {
        id: el.id != null ? `${el.type || "n"}/${el.id}` : `nom/${name}-${plat.toFixed(3)}`,
        name,
        role,
        lat: plat,
        lon: plon,
        miles,
        mapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${plat},${plon}`,
      };
    })
    .filter(Boolean);

  const seen = new Set();
  const unique = [];
  for (const p of places.sort((a, b) => a.miles - b.miles)) {
    const key = p.name.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(p);
  }
  return unique;
}

async function fetchOverpassPlaces(lat, lon, radiusM) {
  // Keep the query light — busy public Overpass servers time out on heavy regex.
  const query = `
[out:json][timeout:30];
(
  nwr["shop"="supermarket"](around:${radiusM},${lat},${lon});
  nwr["shop"="grocery"](around:${radiusM},${lat},${lon});
  nwr["shop"="convenience"](around:${radiusM},${lat},${lon});
  nwr["shop"="wholesale"](around:${radiusM},${lat},${lon});
  nwr["shop"="greengrocer"](around:${radiusM},${lat},${lon});
  nwr["shop"="department_store"](around:${radiusM},${lat},${lon});
  nwr["brand"~"Publix|Walmart|Aldi|Target|Kroger|Winn-Dixie|Trader Joe|Whole Foods|Costco|Lidl|H-E-B",i](around:${radiusM},${lat},${lon});
);
out center tags 60;
`.trim();

  let lastErr = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 28000);
      const res = await fetch(endpoint, {
        method: "POST",
        body: query,
        headers: { "Content-Type": "text/plain", Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      const text = await res.text();
      if (!res.ok) {
        lastErr = new Error(`Overpass ${res.status}`);
        continue;
      }
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        lastErr = new Error("Overpass busy or returned non-JSON");
        continue;
      }
      if (data.remark && !data.elements?.length) {
        lastErr = new Error(data.remark);
        continue;
      }
      return normalizePlaces(data.elements || [], lat, lon);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Overpass unavailable");
}

/** Nominatim fallback when Overpass is empty/busy (common). */
async function fetchNominatimGroceries(lat, lon, radiusMiles = 12) {
  // viewbox: left, top, right, bottom
  const dLat = radiusMiles / 69;
  const dLon = radiusMiles / (Math.cos((lat * Math.PI) / 180) * 69);
  const viewbox = [lon - dLon, lat + dLat, lon + dLon, lat - dLat].map((n) => n.toFixed(5)).join(",");

  const queries = [
    "supermarket",
    "grocery store",
    "Publix",
    "Walmart",
    "Aldi",
    "Asian market",
  ];

  const collected = [];
  for (const q of queries) {
    const url =
      `https://nominatim.openstreetmap.org/search?` +
      new URLSearchParams({
        q,
        format: "json",
        addressdetails: "0",
        limit: "12",
        viewbox,
        bounded: "1",
        countrycodes: "us",
      });
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": OSM_UA },
      });
      if (!res.ok) continue;
      const rows = await res.json();
      for (const row of rows) {
        collected.push({
          type: "nominatim",
          id: row.place_id,
          lat: parseFloat(row.lat),
          lon: parseFloat(row.lon),
          display_name: row.display_name,
          tags: {
            name: row.display_name?.split(",")[0],
            shop: /market|asian|chinese|korean|thai|indian/i.test(row.display_name || "")
              ? "grocery"
              : "supermarket",
          },
        });
      }
      // Nominatim polite use: small pause between queries
      await sleep(1100);
    } catch {
      /* try next query */
    }
  }
  return normalizePlaces(collected, lat, lon);
}

async function fetchNearbyPlaces(lat, lon) {
  const radii = [12000, 20000, 30000];
  let overpassError = null;

  for (const radiusM of radii) {
    try {
      const places = await fetchOverpassPlaces(lat, lon, radiusM);
      if (places.length) return { places, source: "overpass", radiusM };
    } catch (e) {
      overpassError = e;
    }
  }

  // Fallback: Nominatim text search in a bounding box
  try {
    const places = await fetchNominatimGroceries(lat, lon, 15);
    if (places.length) return { places, source: "nominatim", radiusM: 24000 };
  } catch (e) {
    overpassError = overpassError || e;
  }

  return {
    places: [],
    source: "none",
    error: overpassError?.message || "No grocery places found",
  };
}

function pickStores(places) {
  const mains = places.filter((p) => p.role === "main" || p.role === "bulk");
  const specialty = places.filter((p) => p.role === "specialty");
  const main = mains[0] || places[0] || null;
  // specialty only if closer-ish or exists; avoid sending user 20mi away if main can do it
  let spec = specialty.find((p) => p.miles <= 12) || specialty[0] || null;
  if (spec && main && spec.miles > main.miles + 8 && spec.miles > 10) {
    // too far — fold into main note later
    spec = null;
  }
  return { main, specialty: spec };
}

async function resolveLocationFromZip() {
  const zip = $("#zip-input").value.trim();
  if (!/^\d{5}(-\d{4})?$/.test(zip)) {
    setLocationStatus("Enter a 5-digit US zip.", true);
    return;
  }
  setLocationStatus("Finding your area…");
  try {
    const loc = await geocodeZip(zip);
    state.location = loc;
    saveState();
    await loadPlacesForLocation(loc);
  } catch (e) {
    setLocationStatus(e.message || "Could not find that zip.", true);
  }
}

function resolveLocationFromDevice() {
  if (!navigator.geolocation) {
    setLocationStatus("Location not available in this browser — try zip.", true);
    return;
  }
  setLocationStatus("Asking for location…");
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const loc = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        label: "Near you",
        zip: state.location?.zip || null,
      };
      // reverse geocode for a friendly label
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${loc.lat}&lon=${loc.lon}&format=json`,
          { headers: { Accept: "application/json", "User-Agent": OSM_UA } }
        );
        const data = await res.json();
        const a = data.address || {};
        loc.label = [a.city || a.town || a.village, a.state].filter(Boolean).join(", ") || data.display_name;
        loc.zip = a.postcode || loc.zip;
        if (loc.zip) $("#zip-input").value = String(loc.zip).slice(0, 5);
      } catch {
        /* keep Near you */
      }
      state.location = loc;
      saveState();
      await loadPlacesForLocation(loc);
    },
    () => setLocationStatus("Location denied — enter a zip instead.", true),
    { enableHighAccuracy: false, timeout: 12000 }
  );
}

async function loadPlacesForLocation(loc) {
  setLocationStatus(`Looking up stores near ${loc.label}… (may take ~10–20s)`);
  try {
    const { places, source, radiusM, error } = await fetchNearbyPlaces(loc.lat, loc.lon);
    const picks = pickStores(places);
    state.places = {
      all: places.slice(0, 25),
      picks,
      source,
      radiusM,
      fetchedAt: Date.now(),
      error: error || null,
    };
    saveState();
    const n = places.length;
    if (n) {
      const via = source === "nominatim" ? " (map search fallback)" : "";
      const mi = radiusM ? ` within ~${Math.round(radiusM / 1609)} mi` : "";
      setLocationStatus(`Found ${n} grocery spots near ${loc.label}${mi}${via}. Routed below.`);
    } else {
      setLocationStatus(
        `Still no stores found near ${loc.label}. ${error ? `(${error}) ` : ""}Using generic stops — try zip, or again in a minute if map servers are busy.`,
        true
      );
    }
    renderRun();
  } catch (e) {
    state.places = { all: [], picks: { main: null, specialty: null }, error: e.message };
    saveState();
    setLocationStatus((e.message || "Lookup failed") + " — using generic stop names. Try again shortly.", true);
    renderRun();
  }
}

function setLocationStatus(msg, isErr = false) {
  const el = $("#location-status");
  el.textContent = msg;
  el.classList.toggle("error", isErr);
}

// ——— DOM helpers ———

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function cardById(id) {
  return state.library.find((c) => c.id === id) || similarCatalog.find((c) => c.id === id);
}

function setPhase(phase) {
  $$(".phase").forEach((el) => {
    el.hidden = el.id !== `phase-${phase}`;
    el.classList.toggle("active", el.id === `phase-${phase}`);
  });
  $$(".phase-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.phase === phase);
  });
  if (phase === "want") renderWant();
  if (phase === "week") renderWeek();
  if (phase === "run") renderRun();
}

function updateNav() {
  const badge = $("#want-badge");
  if (state.want.length) {
    badge.hidden = false;
    badge.textContent = String(state.want.length);
  } else {
    badge.hidden = true;
  }

  const runTab = $("#run-tab");
  const hasWeekMeals = DAYS.some((d) => state.week[d.key]);
  runTab.disabled = !hasWeekMeals;
  $("#start-run-btn").disabled = !hasWeekMeals;
  $("#to-week-from-want").disabled = state.want.length === 0;
}

// ——— Card UI ———

function chipsHtml(card) {
  const tags = [...(card.method_tags || []), ...(card.style_tags || [])].slice(0, 4);
  return tags
    .map(
      (t) =>
        `<span class="chip ${card.method_tags?.includes(t) ? "method" : ""}">${escapeHtml(t)}</span>`
    )
    .join("");
}

function ingredientsHtml(card) {
  const items = (card.ingredients || [])
    .map((ing) => `<li>${escapeHtml(ing.display || ing.name)}</li>`)
    .join("");
  return `<ul>${items}</ul>`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMealCard(card, { mode = "deal" } = {}) {
  const wanted = state.want.includes(card.id);
  const inLib = state.library.some((c) => c.id === card.id);
  const el = document.createElement("article");
  el.className = `meal-card${wanted ? " wanted" : ""}${card.source === "similar" ? " similar-card" : ""}`;
  el.dataset.id = card.id;
  const why =
    mode === "similar"
      ? `<p class="similar-why">Similar to your hand</p>`
      : "";
  el.innerHTML = `
    ${why}
    <h3>${escapeHtml(card.title)}</h3>
    <p class="summary">${escapeHtml(card.summary || "")}</p>
    <div class="chips">${chipsHtml(card)}</div>
    <div class="card-back">${ingredientsHtml(card)}</div>
    <div class="card-actions"></div>
  `;

  const actions = el.querySelector(".card-actions");

  if (mode === "similar") {
    const add = document.createElement("button");
    add.type = "button";
    add.className = "btn btn-want";
    add.textContent = inLib && wanted ? "In Want ✓" : inLib ? "I want this" : "Deal me this";
    add.disabled = inLib && wanted;
    add.addEventListener("click", (e) => {
      e.stopPropagation();
      addSimilarToLibrary(card);
      if (!state.want.includes(card.id)) {
        state.want.push(card.id);
        saveState();
      }
      updateNav();
      renderSimilarSections();
      const active = $(".phase-tab.active")?.dataset.phase;
      if (active === "want") renderWant();
      if (active === "deal") renderDealt(pendingHand.length ? pendingHand : state.library.filter((c) => c.source !== "similar" || pendingHand.some((p) => p.id === c.id)));
      // soft toast via hand eyebrow if on deal
    });
    actions.appendChild(add);
  } else if (mode === "deal" || mode === "library") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = wanted ? "btn btn-unwant" : "btn btn-want";
    btn.textContent = wanted ? "Unwant" : "I want this";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleWant(card.id);
    });
    actions.appendChild(btn);
  } else if (mode === "want") {
    const un = document.createElement("button");
    un.type = "button";
    un.className = "btn btn-unwant";
    un.textContent = "Toss back";
    un.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleWant(card.id);
    });
    const plan = document.createElement("button");
    plan.type = "button";
    plan.className = "btn btn-primary";
    plan.textContent = "Park on a day";
    plan.addEventListener("click", (e) => {
      e.stopPropagation();
      openDayPicker(card.id);
    });
    actions.append(un, plan);
  }

  el.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    el.classList.toggle("flipped");
  });

  return el;
}

function renderSimilarSections() {
  const sims = rankSimilar(4);
  const dealBlock = $("#deal-similar-block");
  const dealRow = $("#deal-similar-cards");
  const wantBlock = $("#want-similar-block");
  const wantRow = $("#want-similar-cards");

  const showDeal = !$("#hand-panel").hidden && sims.length > 0;
  dealBlock.hidden = !showDeal;
  if (showDeal) {
    dealRow.innerHTML = "";
    sims.forEach((c) => dealRow.appendChild(renderMealCard(c, { mode: "similar" })));
  }

  const showWant = state.want.length > 0 && sims.length > 0;
  wantBlock.hidden = !showWant;
  if (showWant) {
    wantRow.innerHTML = "";
    sims.forEach((c) => wantRow.appendChild(renderMealCard(c, { mode: "similar" })));
  }
}

function toggleWant(id) {
  const i = state.want.indexOf(id);
  if (i >= 0) {
    state.want.splice(i, 1);
    for (const d of DAYS) {
      if (state.week[d.key] === id) state.week[d.key] = null;
    }
  } else {
    if (!state.library.some((c) => c.id === id)) {
      const fromCat = similarCatalog.find((c) => c.id === id);
      if (fromCat) addSimilarToLibrary(fromCat);
    }
    state.want.push(id);
  }
  saveState();
  updateNav();
  const active = $(".phase-tab.active")?.dataset.phase;
  if (active === "deal" && !$("#hand-panel").hidden) {
    renderDealt(pendingHand.length ? pendingHand : state.library);
    renderSimilarSections();
  }
  if (active === "want") renderWant();
  if (active === "week") renderWeek();
}

// ——— Deal ———

const THEATER_LINES = [
  "Reading the page…",
  "Splitting recipes…",
  "Printing cards…",
  "Dealing…",
];

async function runDealTheater() {
  const theater = $("#deal-theater");
  const empty = $("#deal-empty");
  const hand = $("#hand-panel");
  empty.hidden = true;
  hand.hidden = true;
  theater.hidden = false;
  const line = $("#theater-line");
  for (const text of THEATER_LINES) {
    line.textContent = text;
    await sleep(550);
  }
  theater.hidden = true;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function dealFromFixture() {
  await runDealTheater();
  const res = await fetch(FIXTURE_URL);
  if (!res.ok) throw new Error("Could not load fixture");
  const data = await res.json();
  const cards = data.meal_cards.map((c) => ({ ...c }));
  finishDeal(cards, data.fixture?.expected_card_count);
}

async function dealFromUpload(_file) {
  await runDealTheater();
  const res = await fetch(FIXTURE_URL);
  const data = await res.json();
  const cards = data.meal_cards.map((c) => ({
    ...c,
    id: `${c.id}-upload-${Date.now()}`,
    source: "photo",
  }));
  finishDeal(cards, cards.length);
}

function finishDeal(cards, count) {
  pendingHand = cards;
  for (const c of cards) {
    const existing = state.library.findIndex((x) => x.id === c.id);
    if (existing >= 0) state.library[existing] = c;
    else state.library.push(c);
  }
  saveState();
  const n = count ?? cards.length;
  $("#hand-eyebrow").textContent = n > 1 ? "Two dishes in one shot. Dealt." : "One card, clean";
  $("#hand-title").textContent = n > 1 ? `You’re holding ${n}` : "You’re holding 1";
  renderDealt(cards);
  $("#hand-panel").hidden = false;
  similarShuffle = 0;
  renderSimilarSections();
  updateNav();
}

function renderDealt(cards) {
  const row = $("#dealt-cards");
  row.innerHTML = "";
  // show photo/hand cards first, not the whole library dump of similars unless pending
  const show = cards?.length
    ? cards
    : state.library.filter((c) => c.source !== "similar");
  show.forEach((c) => row.appendChild(renderMealCard(c, { mode: "deal" })));
}

// ——— Want ———

function renderWant() {
  const row = $("#want-cards");
  const empty = $("#want-empty-msg");
  const libBlock = $("#library-block");
  const libRow = $("#library-cards");
  row.innerHTML = "";
  libRow.innerHTML = "";

  const wantCards = state.want.map(cardById).filter(Boolean);
  empty.hidden = wantCards.length > 0;

  wantCards.forEach((c) => row.appendChild(renderMealCard(c, { mode: "want" })));

  const rest = state.library.filter((c) => !state.want.includes(c.id));
  if (rest.length) {
    libBlock.hidden = false;
    rest.forEach((c) => libRow.appendChild(renderMealCard(c, { mode: "library" })));
  } else {
    libBlock.hidden = true;
  }
  renderSimilarSections();
  updateNav();
}

// ——— Week ———

function renderWeek() {
  const tray = $("#week-want-cards");
  tray.innerHTML = "";
  const freeWant = state.want.filter((id) => !DAYS.some((d) => state.week[d.key] === id));
  if (!freeWant.length) {
    tray.innerHTML = `<span class="tray-empty">${
      state.want.length ? "All cravings are parked. Nice." : "Want a dish first — then drop it here."
    }</span>`;
  } else {
    freeWant.forEach((id) => {
      const card = cardById(id);
      if (!card) return;
      const mini = document.createElement("div");
      mini.className = "mini-card" + (selectedWantId === id ? " selected" : "");
      mini.draggable = true;
      mini.dataset.id = id;
      mini.textContent = card.title;
      mini.title = "Drag to a day, or tap then tap a day";
      mini.addEventListener("dragstart", (e) => {
        dragCardId = id;
        mini.classList.add("dragging");
        e.dataTransfer.setData("text/plain", id);
        e.dataTransfer.effectAllowed = "move";
      });
      mini.addEventListener("dragend", () => {
        dragCardId = null;
        mini.classList.remove("dragging");
      });
      mini.addEventListener("click", () => {
        selectedWantId = selectedWantId === id ? null : id;
        renderWeek();
      });
      tray.appendChild(mini);
    });
  }

  const board = $("#week-board");
  board.innerHTML = "";
  DAYS.forEach((day) => {
    const slot = document.createElement("div");
    slot.className = "day-slot";
    const mealId = state.week[day.key];
    const meal = mealId ? cardById(mealId) : null;

    slot.innerHTML = `
      <div class="day-label">${day.label}</div>
      <div class="day-drop" data-day="${day.key}"></div>
    `;
    const drop = slot.querySelector(".day-drop");

    if (meal) {
      drop.innerHTML = `
        <div class="day-meal">
          <span>${escapeHtml(meal.title)}</span>
          <button type="button" aria-label="Remove">×</button>
        </div>
      `;
      drop.querySelector("button").addEventListener("click", () => {
        state.week[day.key] = null;
        saveState();
        renderWeek();
        updateNav();
      });
    } else {
      drop.classList.add("open-label");
      drop.textContent = selectedWantId ? "Tap to park here" : "Open";
    }

    drop.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("drag-over");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("drag-over"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("drag-over");
      const id = e.dataTransfer.getData("text/plain") || dragCardId;
      if (id) assignDay(day.key, id);
    });
    drop.addEventListener("click", () => {
      if (meal) return;
      if (selectedWantId) {
        assignDay(day.key, selectedWantId);
        selectedWantId = null;
      }
    });

    board.appendChild(slot);
  });

  const toast = $("#week-toast");
  const counts = {};
  DAYS.forEach((d) => {
    const id = state.week[d.key];
    if (id) counts[id] = (counts[id] || 0) + 1;
  });
  const dynasty = Object.entries(counts).find(([, n]) => n >= 3);
  if (dynasty) {
    const c = cardById(dynasty[0]);
    toast.hidden = false;
    toast.textContent = `Bold. ${c?.title || "That dish"} dynasty this week?`;
  } else {
    const filled = DAYS.filter((d) => state.week[d.key]).length;
    if (filled >= 4) {
      toast.hidden = false;
      toast.textContent = "Solid week. Ready when you are — Start the run.";
    } else {
      toast.hidden = true;
    }
  }

  updateNav();
}

function assignDay(dayKey, cardId) {
  for (const d of DAYS) {
    if (state.week[d.key] === cardId) state.week[d.key] = null;
  }
  state.week[dayKey] = cardId;
  if (!state.want.includes(cardId)) state.want.push(cardId);
  if (!state.library.some((c) => c.id === cardId)) {
    const fromCat = similarCatalog.find((c) => c.id === cardId);
    if (fromCat) addSimilarToLibrary(fromCat);
  }
  saveState();
  renderWeek();
  updateNav();
}

function openDayPicker(cardId) {
  selectedWantId = cardId;
  const sheet = $("#day-picker");
  const row = $("#day-picker-row");
  row.innerHTML = "";
  DAYS.forEach((day) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = day.label;
    b.addEventListener("click", () => {
      assignDay(day.key, cardId);
      sheet.hidden = true;
      setPhase("week");
    });
    row.appendChild(b);
  });
  sheet.hidden = false;
}

// ——— Run / shopping ———

function buildShoppingList() {
  const mealIds = [...new Set(DAYS.map((d) => state.week[d.key]).filter(Boolean))];
  const byKey = new Map();

  for (const id of mealIds) {
    const card = cardById(id);
    if (!card) continue;
    for (const ing of card.ingredients || []) {
      const key = (ing.name || ing.display || "").toLowerCase();
      if (!key) continue;
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          name: ing.name || ing.display,
          display: ing.display || ing.name,
          role: storeRoleForIngredient(ing.name || ing.display),
          from: [card.title],
        });
      } else {
        const row = byKey.get(key);
        if (!row.from.includes(card.title)) row.from.push(card.title);
      }
    }
  }

  const items = [...byKey.values()];
  // If no specialty store nearby, fold specialty items into main
  const picks = state.places?.picks;
  const hasSpecialtyStop = !!(picks?.specialty);
  if (!hasSpecialtyStop) {
    items.forEach((i) => {
      if (i.role === "specialty") i.role = "main";
    });
  }

  const main = items.filter((i) => i.role === "main");
  const specialty = items.filter((i) => i.role === "specialty");
  return { main, specialty, mealCount: mealIds.length };
}

function renderRun() {
  if (state.location?.zip && !$("#zip-input").value) {
    $("#zip-input").value = String(state.location.zip).slice(0, 5);
  }

  const { main, specialty, mealCount } = buildShoppingList();
  const picks = state.places?.picks || {};
  const mainPlace = picks.main;
  const specPlace = picks.specialty;
  const stops = specialty.length && specPlace ? 2 : specialty.length && !specPlace ? 1 : specialty.length ? 2 : 1;
  // recount: if specialty items but no store, already folded
  const effectiveStops = specialty.length > 0 ? 2 : 1;

  const summary = $("#run-summary");
  const area = state.location?.label || "your area";
  summary.innerHTML = `
    <p style="margin:0 0 0.35rem"><strong>${effectiveStops} stop${effectiveStops > 1 ? "s" : ""}</strong>
    · ${mealCount} meal${mealCount === 1 ? "" : "s"} on the board
    · near ${escapeHtml(area)}</p>
    <p style="margin:0;color:var(--muted);font-size:0.9rem">Ingredients routed by type + nearest matching store. Not live shelf stock.</p>
  `;

  const container = $("#run-stops");
  container.innerHTML = "";

  const makeStop = (num, title, meta, items, place) => {
    const div = document.createElement("div");
    div.className = "stop-card";
    const miles =
      place?.miles != null ? ` · ${place.miles < 10 ? place.miles.toFixed(1) : Math.round(place.miles)} mi` : "";
    const mapLink = place?.mapsUrl
      ? `<a class="map-link" href="${place.mapsUrl}" target="_blank" rel="noopener">Directions</a>`
      : "";
    div.innerHTML = `
      <h3>Stop ${num} — ${escapeHtml(place?.name || title)}</h3>
      <p class="stop-meta">${escapeHtml(meta)}${miles} ${mapLink}</p>
      <ul class="check-list"></ul>
    `;
    const ul = div.querySelector("ul");
    items.forEach((item) => {
      const li = document.createElement("li");
      const checked = !!state.checked[item.key];
      if (checked) li.classList.add("done");
      li.innerHTML = `
        <label>
          <input type="checkbox" data-key="${escapeHtml(item.key)}" ${checked ? "checked" : ""} />
          <span>${escapeHtml(item.display)}
            <small style="display:block;color:var(--muted);font-size:0.75rem">${escapeHtml(item.from.join(" · "))}</small>
          </span>
        </label>
      `;
      li.querySelector("input").addEventListener("change", (e) => {
        state.checked[item.key] = e.target.checked;
        li.classList.toggle("done", e.target.checked);
        saveState();
        updateRunComplete();
      });
      ul.appendChild(li);
    });
    return div;
  };

  const mainTitle = "Main supermarket";
  const mainMeta = mainPlace
    ? "Best full-grocery match nearby"
    : "Generic main grocery (set location for a real store name)";
  container.appendChild(makeStop(1, mainTitle, mainMeta, main, mainPlace));

  if (specialty.length) {
    const specMeta = specPlace
      ? "Specialty items often stocked better here"
      : "No nearby specialty market in OSM — items may also live in the international aisle at stop 1";
    container.appendChild(
      makeStop(2, "Specialty / international", specMeta, specialty, specPlace)
    );
  }

  // optional: show a few alternate mains
  const alts = (state.places?.all || []).filter((p) => p.role === "main").slice(1, 4);
  if (alts.length) {
    const alt = document.createElement("div");
    alt.className = "alt-stores";
    alt.innerHTML = `<p class="eyebrow">Other groceries nearby</p><ul>${alts
      .map(
        (p) =>
          `<li>${escapeHtml(p.name)} <span class="muted">${p.miles.toFixed(1)} mi</span></li>`
      )
      .join("")}</ul>`;
    container.appendChild(alt);
  }

  updateRunComplete();
}

function updateRunComplete() {
  const { main, specialty } = buildShoppingList();
  const keys = new Set([...main, ...specialty].map((i) => i.key));
  const n = [...keys].filter((k) => state.checked[k]).length;
  const el = $("#run-complete");
  el.hidden = !(keys.size && n >= keys.size);
}

function copyList() {
  const { main, specialty } = buildShoppingList();
  const picks = state.places?.picks || {};
  const lines = ["MEAL CARDS — SHOPPING RUN", state.location?.label || "", ""];
  lines.push(`STOP 1 — ${picks.main?.name || "Main supermarket"}`);
  main.forEach((i) => lines.push(`☐ ${i.display}`));
  if (specialty.length) {
    lines.push("", `STOP 2 — ${picks.specialty?.name || "Specialty / international"}`);
    specialty.forEach((i) => lines.push(`☐ ${i.display}`));
  }
  navigator.clipboard.writeText(lines.join("\n").trim()).then(() => {
    const btn = $("#copy-list-btn");
    const t = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => {
      btn.textContent = t;
    }, 1500);
  });
}

// ——— Events ———

function bind() {
  $$(".phase-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      if (tab.disabled) return;
      setPhase(tab.dataset.phase);
    });
  });

  $("#demo-deal").addEventListener("click", () => {
    dealFromFixture().catch((err) => {
      alert(err.message + "\n\nServe the repo over HTTP so fixtures can load.");
    });
  });

  $("#photo-input").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    dealFromUpload(file).catch((err) => alert(err.message));
    e.target.value = "";
  });

  $("#confirm-hand").addEventListener("click", () => {
    pendingHand = [];
    setPhase("want");
    renderWant();
  });

  $("#to-week-from-want").addEventListener("click", () => setPhase("week"));
  $("#start-run-btn").addEventListener("click", () => setPhase("run"));
  $("#copy-list-btn").addEventListener("click", copyList);
  $("#day-picker-cancel").addEventListener("click", () => {
    $("#day-picker").hidden = true;
  });

  $("#refresh-similar-deal").addEventListener("click", () => {
    similarShuffle += 1;
    renderSimilarSections();
  });
  $("#refresh-similar-want").addEventListener("click", () => {
    similarShuffle += 2;
    renderSimilarSections();
  });

  $("#find-stores-btn").addEventListener("click", () => resolveLocationFromZip());
  $("#use-location-btn").addEventListener("click", () => resolveLocationFromDevice());
  $("#zip-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") resolveLocationFromZip();
  });
}

// ——— Boot ———

async function boot() {
  bind();
  updateNav();
  try {
    const res = await fetch(CATALOG_URL);
    if (res.ok) {
      const data = await res.json();
      similarCatalog = data.catalog || [];
    }
  } catch {
    similarCatalog = [];
  }

  if (state.library.length) {
    $("#deal-empty").hidden = true;
    $("#hand-panel").hidden = false;
    $("#hand-title").textContent = `Library: ${state.library.length} card${state.library.length === 1 ? "" : "s"}`;
    $("#hand-eyebrow").textContent = "Welcome back";
    renderDealt(state.library.filter((c) => c.source !== "similar"));
    renderSimilarSections();
  }

  if (state.location && !state.places?.picks?.main) {
    // soft re-fetch not automatic to save API; user can click Find again
    setLocationStatus(`Last area: ${state.location.label}. Tap Find stores to refresh.`);
  } else if (state.location) {
    setLocationStatus(`Shopping near ${state.location.label}.`);
  }
}

boot();
