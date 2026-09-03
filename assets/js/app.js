// assets/js/app.js

let SB_STATE = {
  birds: [],
  birdsById: {},
  taxo: null,
  familiesById: {},
  resources: [],
  siteMeta: null,
  sites: [],
  iucnCodes: [],
  currentBirdId: null,
  searchQuery: "",
  theme: "dark",

  currentFilter: "all", // 'all' | 'endemic' | 'with-photo' | IUCN code
  currentSort: "common_name", // 'common_name' | 'scientific_name' | 'status'
};

// IUCN code -> human label, used only for the filter dropdown text.
const SB_IUCN_LABELS = {
  EW: "Extinct in the Wild",
  CR: "Critically Endangered",
  EN: "Endangered",
  VU: "Vulnerable",
  NT: "Near Threatened",
  LC: "Least Concern",
  DD: "Data Deficient",
  NE: "Not Evaluated",
};

// Inline SVG used for species without a photograph yet.
const SB_EMPTY_GLYPH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 7h.01"/><path d="M3.4 18c-.6-1.1-.9-2.4-.9-3.7C2.5 9.2 6.4 5 11.2 5c3.6 0 6.6 2.1 7.9 5.2.2.5.7.8 1.2.8h.2c.7 0 1.3.6 1.3 1.3 0 .7-.6 1.3-1.3 1.3h-2.1c-1 0-1.9.5-2.5 1.3L13 18"/><path d="M8 21c.5-2 2-3.5 4-4"/></svg>`;

// Escape user-authored text before injecting it into innerHTML.
/* A photo record with "pending": true is a placeholder waiting for its image
   (birds.json carries one for every species without a photograph yet); it is
   ignored everywhere until the image is added and the flag removed. */
function livePhotos(bird) {
  return (Array.isArray(bird.photos) ? bird.photos : []).filter((p) => p && !p.pending);
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* Prose fields in birds.json are plain text, escaped here; the one piece of
   markup they may carry is *asterisks* around a genus or species name, which
   become <em> so that scientific names are italicised as in the sister
   collections. */
function formatProse(value) {
  return escapeHtml(value).replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
}

/* Search and the hash both compare names; fold typographic apostrophes so
   that "jerdon's" finds "Jerdon’s". */
function foldName(value) {
  return String(value || "").toLowerCase().replace(/[’‘]/g, "'");
}

function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}

document.addEventListener("DOMContentLoaded", () => {
  initSite().catch((err) => {
    console.error(err);
    const infoPanel = document.querySelector(SB_CONFIG.ui.infoPanelSelector);
    if (infoPanel) {
      infoPanel.innerHTML =
        "<p>Failed to load data. Check console for details.</p>";
    }
  });
});

async function initSite() {
  const data = await sbLoadAllData();
  SB_STATE = { ...SB_STATE, ...data };

  initTheme();
  initTabs();
  initSearch();
  initFilters();
  buildSidebar();
  renderResources();
  renderSites();
  renderAbout();

  const hashId = window.location.hash.replace("#", "");
  let initialBirdId = SB_CONFIG.defaults.initialBirdId;

  if (hashId && SB_STATE.birdsById[hashId]) {
    initialBirdId = hashId;
  } else if (!initialBirdId) {
    initialBirdId = pickRandomBirdId(true); // true = requirePhoto
  }

  if (initialBirdId) {
    // replaceState: the first bird must not add a history entry, or Back
    // from the site leads to the same page without a hash.
    showBird(initialBirdId, { replaceHistory: true, scrollSidebar: true });
  }

  // Back/Forward (and hand-edited hashes) drive the species panel.
  window.addEventListener("hashchange", () => {
    const id = window.location.hash.replace("#", "");
    if (id && id !== SB_STATE.currentBirdId && SB_STATE.birdsById[id]) {
      showBird(id, { fromHash: true, scrollSidebar: true });
    }
  });
}

/* =====================
   TABS
   ===================== */

function initTabs() {
  const tabButtons = document.querySelectorAll(SB_CONFIG.ui.tabsSelector);
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-tab");
      setActiveTab(target);

      // Preserved behaviour: tapping Home surfaces a fresh random bird.
      if (target === "home") {
        const newId = pickRandomBirdId(true); // require photo
        if (newId) showBird(newId);
      }
    });
  });

  // The site title carries data-tab="home", so it is wired above like any tab:
  // clicking it returns to the home view with a fresh random bird.

  setActiveTab("home");
}

/* The contact address is written as "mihir [at] naniwadekar [dot] in" in the
   data and assembled here, so people can read it and address-harvesters cannot. */
function fillMailLinks(root) {
  (root || document).querySelectorAll("a.mail").forEach((a) => {
    const m = a.getAttribute("data-u") + "@" + a.getAttribute("data-d");
    a.href = "mailto:" + m;
    a.textContent = m;
  });
}

function setActiveTab(tabName) {
  document.querySelectorAll(SB_CONFIG.ui.tabsSelector).forEach((btn) => {
    const isActive = btn.getAttribute("data-tab") === tabName;
    btn.classList.toggle("active", isActive);
    if (isActive) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });

  document
    .querySelectorAll(SB_CONFIG.ui.tabContentSelector)
    .forEach((section) => {
      const isMatch = section.getAttribute("data-tab-content") === tabName;

      if (!isMatch) {
        section.style.display = "none";
        return;
      }

      if (section.classList.contains("home-layout")) {
        section.style.display = "grid"; // keep the 3-panel grid
      } else {
        section.style.display = "block";
      }
    });
}

/* =====================
   THEME (LIGHT / DARK)
   ===================== */

function initTheme() {
  // The pre-paint script in <head> has already set data-theme from storage;
  // read it back so JS state and the toggle button agree with the DOM.
  let stored = null;
  try {
    stored = window.localStorage.getItem("root-theme");
  } catch (e) {}

  const domTheme = document.documentElement.getAttribute("data-theme");
  const theme = stored || domTheme || "dark";

  SB_STATE.theme = theme === "light" ? "light" : "dark";
  applyTheme(SB_STATE.theme);

  const btn = document.querySelector("#theme-toggle");
  if (btn) {
    btn.addEventListener("click", () => {
      const next = SB_STATE.theme === "dark" ? "light" : "dark";
      SB_STATE.theme = next;
      applyTheme(next);
      try {
        window.localStorage.setItem("root-theme", next);
      } catch (e) {}
    });
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute(
    "data-theme",
    theme === "dark" ? "dark" : "light"
  );

  const btn = document.querySelector("#theme-toggle");
  if (btn) {
    btn.textContent = theme === "dark" ? "Light" : "Dark";
    btn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
  }
}

/* =====================
   SEARCH
   ===================== */

function initSearch() {
  const input = document.querySelector("#sidebar-search-input");
  if (!input) return;

  const debouncedBuildSidebar = debounce((query) => {
    SB_STATE.searchQuery = query;
    buildSidebar();
  }, 250);

  input.addEventListener("input", (e) => {
    debouncedBuildSidebar(e.target.value);
  });
}

/* =====================
   FILTERS & SORT
   ===================== */

function initFilters() {
  const filterSelect = document.querySelector("#filter-select");
  const sortSelect = document.querySelector("#sort-select");

  if (filterSelect) {
    // Inject only the IUCN codes that actually appear in the data.
    // Idempotent: clear any previously injected options first.
    filterSelect
      .querySelectorAll("option[data-iucn]")
      .forEach((o) => o.remove());

    if (SB_STATE.iucnCodes && SB_STATE.iucnCodes.length) {
      const sep = document.createElement("option");
      sep.disabled = true;
      sep.dataset.iucn = "1";
      sep.textContent = "--- IUCN Status ---";
      filterSelect.appendChild(sep);

      SB_STATE.iucnCodes.forEach((code) => {
        const opt = document.createElement("option");
        opt.value = code;
        opt.dataset.iucn = "1";
        const label = SB_IUCN_LABELS[code] || code;
        opt.textContent = `${code} (${label})`;
        filterSelect.appendChild(opt);
      });
    }

    filterSelect.value = SB_STATE.currentFilter;
    filterSelect.addEventListener("change", (e) => {
      SB_STATE.currentFilter = e.target.value;
      buildSidebar();
    });
  }

  if (sortSelect) {
    sortSelect.value = SB_STATE.currentSort;
    sortSelect.addEventListener("change", (e) => {
      SB_STATE.currentSort = e.target.value;
      buildSidebar();
    });
  }
}

/* =====================
   SIDEBAR
   ===================== */

function buildSidebar() {
  const sidebar = document.querySelector(SB_CONFIG.ui.sidebarSelector);
  if (!sidebar || !SB_STATE.taxo) return;

  const headerBlock = sidebar.querySelector(".sidebar-header-static");
  if (!headerBlock) {
    console.warn("Sidebar header not found; cannot build list.");
    return;
  }

  // Remove everything after the static header (previous render).
  while (headerBlock.nextSibling) {
    sidebar.removeChild(headerBlock.nextSibling);
  }

  const groups = [...(SB_STATE.taxo.groups || [])].sort(
    (a, b) =>
      (a.sidebar_order || 0) - (b.sidebar_order || 0) ||
      a.label.localeCompare(b.label)
  );

  const families = SB_STATE.taxo.families || [];

  // 1. Filter + sort the full list.
  let filteredBirds = SB_STATE.birds.slice();
  const currentFilter = SB_STATE.currentFilter;
  const currentSort = SB_STATE.currentSort;

  if (currentFilter !== "all") {
    if (currentFilter === "endemic") {
      filteredBirds = filteredBirds.filter((bird) => bird.is_endemic);
    } else if (currentFilter === "with-photo") {
      filteredBirds = filteredBirds.filter(
        (bird) => livePhotos(bird).length > 0
      );
    } else {
      filteredBirds = filteredBirds.filter(
        (bird) => bird.conservation_status?.iucn_code === currentFilter
      );
    }
  }

  filteredBirds.sort((a, b) => {
    if (currentSort === "scientific_name") {
      return (a.scientific_name || "").localeCompare(b.scientific_name || "");
    }
    if (currentSort === "status") {
      // Sort by the normalised residency label so casing/spelling variants
      // no longer fragment the order; common name breaks ties.
      const sa = (a.residency && a.residency.label) || "";
      const sb = (b.residency && b.residency.label) || "";
      return (
        sa.localeCompare(sb) ||
        (a.common_name || "").localeCompare(b.common_name || "")
      );
    }
    return (a.common_name || "").localeCompare(b.common_name || "");
  });

  // 2. Group by family.
  const birdsByFamily = {};
  filteredBirds.forEach((bird) => {
    (birdsByFamily[bird.family_id] =
      birdsByFamily[bird.family_id] || []).push(bird);
  });

  const q = foldName(SB_STATE.searchQuery).trim();

  // 3. Render group -> family -> species.
  let shown = 0;
  groups.forEach((group) => {
    const groupSection = document.createElement("section");
    groupSection.className = "sidebar-group";

    const groupHeader = document.createElement("div");
    groupHeader.className = "sidebar-group-header";
    groupHeader.textContent = group.label;
    groupSection.appendChild(groupHeader);

    if (group.description) {
      const desc = document.createElement("div");
      desc.className = "sidebar-group-description";
      desc.textContent = group.description;
      groupSection.appendChild(desc);
    }

    const groupFamilies = families
      .filter((fam) => fam.group_id === group.id)
      .sort((a, b) =>
        a.sidebar_label.localeCompare(b.sidebar_label, undefined, {
          sensitivity: "base",
        })
      );

    let hasAnyFamily = false;

    groupFamilies.forEach((fam) => {
      let speciesList = birdsByFamily[fam.id] || [];

      if (q) {
        speciesList = speciesList.filter((bird) => {
          const common = foldName(bird.common_name);
          const sci = foldName(bird.scientific_name);
          return common.includes(q) || sci.includes(q);
        });
      }

      if (!speciesList.length) return;
      hasAnyFamily = true;

      const famBlock = document.createElement("div");
      famBlock.className = "sidebar-family";

      const header = document.createElement("div");
      header.className = "sidebar-family-header";
      header.textContent = fam.sidebar_label;
      famBlock.appendChild(header);

      const list = document.createElement("ul");
      list.className = "sidebar-species-list";

      shown += speciesList.length;
      speciesList.forEach((bird) => {
        const li = document.createElement("li");

        // Real button => focusable + Enter/Space activation for free.
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "sidebar-species-item";
        const isActive = bird.id === SB_STATE.currentBirdId;
        btn.classList.toggle("active", isActive);
        if (isActive) btn.setAttribute("aria-current", "true");
        btn.textContent = bird.common_name;
        btn.dataset.birdId = bird.id;
        btn.addEventListener("click", () => showBird(bird.id));

        li.appendChild(btn);
        list.appendChild(li);
      });

      famBlock.appendChild(list);
      groupSection.appendChild(famBlock);
    });

    if (hasAnyFamily) {
      sidebar.appendChild(groupSection);
    }
  });

  if (!shown) {
    const empty = document.createElement("p");
    empty.className = "sidebar-empty";
    empty.setAttribute("role", "status");
    empty.textContent = q
      ? `No species matches “${SB_STATE.searchQuery.trim()}”.`
      : "No species matches this filter.";
    sidebar.appendChild(empty);
  }
}

/* Move the highlight to the current species without rebuilding the list,
   so the sidebar keeps its scroll position when a species is chosen. */
function updateSidebarActive(scrollIntoView) {
  document.querySelectorAll(".sidebar-species-item").forEach((btn) => {
    const isActive = btn.dataset.birdId === SB_STATE.currentBirdId;
    btn.classList.toggle("active", isActive);
    if (isActive) {
      btn.setAttribute("aria-current", "true");
      if (scrollIntoView) btn.scrollIntoView({ block: "nearest" });
    } else {
      btn.removeAttribute("aria-current");
    }
  });
}

/* =====================
   BIRD RENDERING
   ===================== */

function pickRandomBirdId(requirePhoto = false) {
  if (!SB_STATE.birds.length) return null;

  let pool = SB_STATE.birds;
  if (requirePhoto) {
    const withPhotos = SB_STATE.birds.filter(
      (b) => livePhotos(b).length > 0
    );
    if (withPhotos.length > 0) pool = withPhotos;
  }

  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx].id;
}

function showBird(birdId, opts = {}) {
  const bird = SB_STATE.birdsById[birdId];
  if (!bird) return;

  SB_STATE.currentBirdId = birdId;
  updateSidebarActive(!!opts.scrollSidebar);
  renderBirdInfo(bird);
  renderBirdImages(bird);

  if (opts.fromHash) return; // the URL already says so
  if (opts.replaceHistory) {
    history.replaceState(null, "", "#" + birdId);
  } else if (window.location.hash !== "#" + birdId) {
    window.location.hash = birdId; // one history entry per species chosen
  }
}

function formatRange(range) {
  if (!range || !Array.isArray(range)) return "n/a";
  const unique = [...new Set(range)];
  return unique.length === 1 ? unique[0] : unique.join("–");
}

function renderBirdInfo(bird) {
  const el = document.querySelector(SB_CONFIG.ui.infoPanelSelector);
  if (!el) return;

  const family = SB_STATE.familiesById[bird.family_id];
  const order = (SB_STATE.taxo.orders || []).find(
    (o) => o.id === bird.order_id
  );

  const statusLabel = (bird.residency && bird.residency.label) || "";
  const cs = bird.conservation_status;

  let html = `
    <header class="bird-header">
      <h1 class="bird-common-name">${escapeHtml(bird.common_name)}</h1>
      <h2 class="bird-scientific-name"><em>${escapeHtml(
        bird.scientific_name
      )}</em></h2>
      <div class="bird-badges">
        ${
          bird.is_endemic
            ? `<span class="badge badge-endemic">Endemic to Western Ghats</span>`
            : ""
        }
        ${
          statusLabel
            ? `<span class="badge badge-status">${escapeHtml(statusLabel)}</span>`
            : ""
        }
        ${
          cs
            ? `<span class="badge badge-iucn">${escapeHtml(cs.label)} (${escapeHtml(
                cs.iucn_code
              )})</span>`
            : ""
        }
      </div>
      <div class="bird-classification">
        ${
          order
            ? `<div><span class="label">Order:</span> ${escapeHtml(
                order.scientific_name
              )}</div>`
            : ""
        }
        ${
          family
            ? `<div><span class="label">Family:</span> ${escapeHtml(
                family.scientific_name
              )} – ${escapeHtml(family.common_label)}</div>`
            : ""
        }
      </div>
    </header>

    <section class="bird-section">
      <h3>Habitat</h3>
      <p>${formatProse(bird.habitat)}</p>
    </section>

    <section class="bird-section">
      <h3>Size &amp; appearance</h3>
      ${
        bird.size
          ? `<p><strong>Length:</strong> ${formatRange(bird.size.length_cm)} cm${
              bird.size.wingspan_cm
                ? `; <strong>Wingspan:</strong> ${formatRange(
                    bird.size.wingspan_cm
                  )} cm`
                : ""
            }${
              bird.size.note ? ` (${escapeHtml(bird.size.note)})` : ""
            }</p>`
          : ""
      }
      <p><strong>Adult male:</strong> ${formatProse(
        bird.description?.adult_male
      )}</p>
      <p><strong>Adult female:</strong> ${formatProse(
        bird.description?.adult_female
      )}</p>
      <p><strong>Juvenile:</strong> ${formatProse(
        bird.description?.juvenile
      )}</p>
      <p><strong>In flight:</strong> ${formatProse(
        bird.description?.in_flight
      )}</p>
    </section>

    <section class="bird-section">
      <h3>Food</h3>
      <p>${formatProse(bird.food)}</p>
    </section>

    <section class="bird-section">
      <h3>Behaviour</h3>
      <p>${formatProse(bird.behaviour)}</p>
    </section>
  `;

  if (bird.did_you_know) {
    html += `
      <section class="dyk-box">
        <h3>Did you know?</h3>
        <p>${formatProse(bird.did_you_know)}</p>
      </section>
    `;
  }

  el.innerHTML = html;
}

function renderBirdImages(bird) {
  const el = document.querySelector(SB_CONFIG.ui.imagePanelSelector);
  if (!el) return;

  const photos = livePhotos(bird);

  if (!photos.length) {
    el.innerHTML = `
      <div class="image-placeholder">
        ${SB_EMPTY_GLYPH}
        <p>No photograph yet for ${escapeHtml(bird.common_name)} – contributions from the Sahyadris are welcome.</p>
      </div>
    `;
    return;
  }

  const html = photos
    .map((p) => {
      // caption / photographer / license are author-controlled HTML
      // (the credits contain attribution <a> links), like about_html.
      // source_note is plain text ("via Wikimedia Commons, resized"): the
      // source and modification statement that CC attribution asks for.
      const caption = p.caption || "";
      const photographer = p.photographer || "";
      const license = p.license || "";
      const sourceNote = p.source_note ? escapeHtml(p.source_note) : "";
      const credit = [photographer ? `Photo: ${photographer}` : "", license, sourceNote]
        .filter(Boolean)
        .join(" · ");

      return `
        <figure class="bird-main-image">
          <img src="${encodeURI(p.file)}" alt="${escapeHtml(
        bird.common_name
      )}" loading="lazy">
          <figcaption class="image-caption">
            ${caption ? `<div>${caption}</div>` : ""}
            ${credit ? `<div class="image-credit">${credit}</div>` : ""}
          </figcaption>
        </figure>
      `;
    })
    .join("");

  el.innerHTML = html;

  // A photograph that fails to load (not yet uploaded, renamed) should not
  // leave a broken-image icon behind: replace the figure with a short note.
  el.querySelectorAll(".bird-main-image img").forEach((img) => {
    img.addEventListener("error", () => {
      const fig = img.closest("figure");
      if (!fig) return;
      const note = document.createElement("div");
      note.className = "image-placeholder";
      note.innerHTML = `${SB_EMPTY_GLYPH}<p>Photograph unavailable.</p>`;
      fig.replaceWith(note);
    });
  });
}

/* =====================
   RESOURCES TAB
   ===================== */

function renderResources() {
  const container = document.querySelector("#resources-list");
  if (!container) return;

  const items = SB_STATE.resources || [];
  if (!items.length) {
    container.innerHTML = "<p>No resources added yet.</p>";
    return;
  }

  container.innerHTML = items
    .map(
      (r) => `
      <article class="resource-item">
        <h3><a href="${encodeURI(r.url || "#")}" target="_blank" rel="noopener noreferrer">${escapeHtml(
        r.name
      )}</a></h3>
        <p>${escapeHtml(r.description)}</p>
      </article>
    `
    )
    .join("");
}

/* =====================
   SITES TAB
   ===================== */

function renderSites() {
  const container = document.querySelector("#sites-list");
  if (!container || !SB_STATE.sites) return;

  container.innerHTML = "";

  SB_STATE.sites.forEach((site) => {
    const div = document.createElement("article");
    div.className = "site-entry";

    const locationLine = site.location
      ? `<p class="site-location"><strong>Location:</strong> ${escapeHtml(
          site.location
        )}</p>`
      : "";

    let placesBlock = "";
    if (Array.isArray(site.places_to_stay) && site.places_to_stay.length > 0) {
      const items = site.places_to_stay
        .map((p) => {
          const link =
            p.url && p.url.trim()
              ? ` <a href="${encodeURI(
                  p.url
                )}" target="_blank" rel="noopener noreferrer">(details)</a>`
              : "";
          return `<li><strong>${escapeHtml(p.name)}</strong>– ${escapeHtml(
            p.description
          )}${link}</li>`;
        })
        .join("");

      placesBlock = `
        <div class="site-stay">
          <h3>Places to stay</h3>
          <ul>${items}</ul>
        </div>
      `;
    }

    div.innerHTML = `
      <h2>${escapeHtml(site.name)}</h2>
      ${locationLine}
      <p>${escapeHtml(site.description)}</p>
      ${placesBlock}
    `;

    container.appendChild(div);
  });
}

/* =====================
   ABOUT
   ===================== */

function renderAbout() {
  const meta = SB_STATE.siteMeta;
  if (!meta) return;
  const about = document.querySelector("#about-content");
  if (about) {
    // about_html is intentional, author-controlled markup.
    about.innerHTML = meta.about_html || "";
    fillMailLinks(about);
  }
}
