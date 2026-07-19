/**
 * Meal Cards prototype — Deal → Want → Week → Run
 * Fixture-backed; playful kitchen tone.
 */

const STORAGE_KEY = "meal-cards-proto-v1";
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

/** @type {{ library: object[], want: string[], week: Record<string, string|null>, checked: Record<string, boolean> }} */
let state = loadState();

let pendingHand = [];
let selectedWantId = null;
let dragCardId = null;

// ——— Persistence ———

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {
    library: [],
    want: [],
    week: Object.fromEntries(DAYS.map((d) => [d.key, null])),
    checked: {},
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ——— Specialty heuristics (no live inventory) ———

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
];

function storeRoleForIngredient(name) {
  const n = (name || "").toLowerCase();
  if (SPECIALTY_HINTS.some((h) => n.includes(h))) return "specialty";
  return "main";
}

// ——— DOM helpers ———

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function cardById(id) {
  return state.library.find((c) => c.id === id);
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
  const el = document.createElement("article");
  el.className = `meal-card${wanted ? " wanted" : ""}`;
  el.dataset.id = card.id;
  el.innerHTML = `
    <h3>${escapeHtml(card.title)}</h3>
    <p class="summary">${escapeHtml(card.summary || "")}</p>
    <div class="chips">${chipsHtml(card)}</div>
    <div class="card-back">${ingredientsHtml(card)}</div>
    <div class="card-actions"></div>
  `;

  const actions = el.querySelector(".card-actions");
  if (mode === "deal" || mode === "library") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = wanted ? "btn btn-unwant" : "btn btn-want";
    btn.textContent = wanted ? "Unwant" : "I want this";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleWant(card.id);
    });
    actions.appendChild(btn);
  }
  if (mode === "want") {
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

function toggleWant(id) {
  const i = state.want.indexOf(id);
  if (i >= 0) {
    state.want.splice(i, 1);
    // bounce off week if parked
    for (const d of DAYS) {
      if (state.week[d.key] === id) state.week[d.key] = null;
    }
  } else {
    state.want.push(id);
  }
  saveState();
  updateNav();
  // re-render active phase
  const active = $(".phase-tab.active")?.dataset.phase;
  if (active === "deal" && !$("#hand-panel").hidden) renderDealt(pendingHand.length ? pendingHand : state.library);
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
  // Prototype: any photo uses the same structured fixture (vision later)
  await runDealTheater();
  const res = await fetch(FIXTURE_URL);
  const data = await res.json();
  const cards = data.meal_cards.map((c) => ({
    ...c,
    id: `${c.id}-upload-${Date.now()}`,
    source: "photo",
  }));
  // merge titles uniqueness for demo
  finishDeal(cards, cards.length);
}

function finishDeal(cards, count) {
  pendingHand = cards;
  // merge into library by id
  for (const c of cards) {
    const existing = state.library.findIndex((x) => x.id === c.id);
    if (existing >= 0) state.library[existing] = c;
    else state.library.push(c);
  }
  saveState();
  const n = count ?? cards.length;
  $("#hand-eyebrow").textContent = n > 1 ? "Nice hand" : "One card, clean";
  $("#hand-title").textContent =
    n > 1 ? `You’re holding ${n}` : "You’re holding 1";
  if (n > 1) {
    $("#hand-eyebrow").textContent = "Two dishes in one shot. Dealt.";
  }
  renderDealt(cards);
  $("#hand-panel").hidden = false;
  updateNav();
}

function renderDealt(cards) {
  const row = $("#dealt-cards");
  row.innerHTML = "";
  cards.forEach((c) => row.appendChild(renderMealCard(c, { mode: "deal" })));
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
  updateNav();
}

// ——— Week ———

function renderWeek() {
  const tray = $("#week-want-cards");
  tray.innerHTML = "";
  const freeWant = state.want.filter(
    (id) => !DAYS.some((d) => state.week[d.key] === id)
  );
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

  // dynasty toast
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
  // remove from other days
  for (const d of DAYS) {
    if (state.week[d.key] === cardId) state.week[d.key] = null;
  }
  state.week[dayKey] = cardId;
  if (!state.want.includes(cardId)) state.want.push(cardId);
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

// ——— Run ———

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
  const main = items.filter((i) => i.role === "main");
  const specialty = items.filter((i) => i.role === "specialty");
  return { main, specialty, mealCount: mealIds.length };
}

function renderRun() {
  const { main, specialty, mealCount } = buildShoppingList();
  const stops = specialty.length ? 2 : 1;
  const summary = $("#run-summary");
  summary.innerHTML = `
    <p style="margin:0 0 0.35rem"><strong>${stops} stop${stops > 1 ? "s" : ""}</strong>
    · ${mealCount} meal${mealCount === 1 ? "" : "s"} on the board
    · ~${stops === 1 ? "45" : "60–75"} min</p>
    <p style="margin:0;color:var(--muted);font-size:0.9rem">No carts. Just where to go and what to grab.</p>
  `;

  const container = $("#run-stops");
  container.innerHTML = "";

  const makeStop = (num, title, meta, items) => {
    const div = document.createElement("div");
    div.className = "stop-card";
    div.innerHTML = `
      <h3>Stop ${num} — ${escapeHtml(title)}</h3>
      <p class="stop-meta">${escapeHtml(meta)}</p>
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
        updateRunComplete(main.length + specialty.length);
      });
      ul.appendChild(li);
    });
    return div;
  };

  container.appendChild(
    makeStop(
      1,
      "Main supermarket",
      "Nearest full grocery — system pick for your area (prototype: generic)",
      main
    )
  );
  if (specialty.length) {
    container.appendChild(
      makeStop(
        2,
        "Specialty market",
        "Only for items that often hide better here",
        specialty
      )
    );
  }

  updateRunComplete(main.length + specialty.length);
}

function updateRunComplete(total) {
  const done = Object.values(state.checked).filter(Boolean).length;
  const el = $("#run-complete");
  // only count keys that are on this run — approximate
  const { main, specialty } = buildShoppingList();
  const keys = new Set([...main, ...specialty].map((i) => i.key));
  const n = [...keys].filter((k) => state.checked[k]).length;
  el.hidden = !(keys.size && n >= keys.size);
}

function copyList() {
  const { main, specialty } = buildShoppingList();
  const lines = ["MEAL CARDS — SHOPPING RUN", ""];
  lines.push("STOP 1 — Main supermarket");
  main.forEach((i) => lines.push(`☐ ${i.display}`));
  if (specialty.length) {
    lines.push("", "STOP 2 — Specialty market");
    specialty.forEach((i) => lines.push(`☐ ${i.display}`));
  }
  navigator.clipboard.writeText(lines.join("\n")).then(() => {
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
      alert(err.message + "\n\nServe the repo over HTTP so fixtures can load (see README).");
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
}

// ——— Boot ———

bind();
updateNav();
if (state.library.length) {
  $("#deal-empty").hidden = true;
  $("#hand-panel").hidden = false;
  $("#hand-title").textContent = `Library: ${state.library.length} card${state.library.length === 1 ? "" : "s"}`;
  $("#hand-eyebrow").textContent = "Welcome back";
  renderDealt(state.library);
}
