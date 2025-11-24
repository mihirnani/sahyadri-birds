// assets/js/app.js

let SB_STATE = {
  birds: [],
  birdsById: {},
  taxo: null,
  familiesById: {},
  resources: [],
  siteMeta: null,
  currentBirdId: null,
  searchQuery: "",
  theme: "dark",

  // --- NEW STATE VARIABLES ---
  currentFilter: "all", // e.g., 'all', 'endemic', 'vulnerable'
  currentSort: "common_name", // e.g., 'common_name', 'scientific_name', 'status'
  // ---------------------------
};

// Helper: Debounce function to limit how often a function is executed
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
  // We call initSearch/initFilters here for the first time,
  // but they are also called *inside* buildSidebar for subsequent rebuilds.
  initSearch();
  initFilters();
  buildSidebar();
  renderResources();
  renderSites();
  renderAbout();
  renderContactMeta();

  const hashId = window.location.hash.replace("#", "");
  let initialBirdId = SB_CONFIG.defaults.initialBirdId;

  if (hashId && SB_STATE.birdsById[hashId]) {
    initialBirdId = hashId;
  } else if (!initialBirdId) {
    initialBirdId = pickRandomBirdId(true); // true = requirePhoto
  }

  if (initialBirdId) {
    showBird(initialBirdId);
  }
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

      // NEW: every time Home is clicked, show a new random bird
      if (target === "home") {
        const newId = pickRandomBirdId(true); // true = require photo
        if (newId) showBird(newId);
      }
    });
  });

  // Default tab = home
  setActiveTab("home");
}

function setActiveTab(tabName) {
  // Buttons
  document.querySelectorAll(SB_CONFIG.ui.tabsSelector).forEach((btn) => {
    const isActive = btn.getAttribute("data-tab") === tabName;
    btn.classList.toggle("active", isActive);
  });

  // Contents
  document
    .querySelectorAll(SB_CONFIG.ui.tabContentSelector)
    .forEach((section) => {
      const isMatch = section.getAttribute("data-tab-content") === tabName;

      if (!isMatch) {
        section.style.display = "none";
        return;
      }

      // Active section
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
  // 1. Try localStorage
  let stored = null;
  try {
    stored = window.localStorage.getItem("sb-theme");
  } catch (e) {
    // ignore
  }

  // 2. Default to dark if nothing stored
  let theme = stored || "dark";

  SB_STATE.theme = theme === "dark" ? "dark" : "light";
  applyTheme(SB_STATE.theme);

  const btn = document.querySelector("#theme-toggle");
  if (btn) {
    btn.addEventListener("click", () => {
      const next = SB_STATE.theme === "dark" ? "light" : "dark";
      SB_STATE.theme = next;
      applyTheme(next);

      try {
        window.localStorage.setItem("sb-theme", next);
      } catch (e) {
        // ignore
      }
    });
  }
}

function applyTheme(theme) {
  const root = document.documentElement;

  if (theme === "dark") {
    root.setAttribute("data-theme", "dark");
  } else {
    root.setAttribute("data-theme", "light");
  }

  const btn = document.querySelector("#theme-toggle");
  if (btn) {
    // Correctly reflect the *next* theme option on the button
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

  // Use a debounced function to limit rebuilding the sidebar
  const debouncedBuildSidebar = debounce((query) => {
    SB_STATE.searchQuery = query;
    buildSidebar();
  }, 250);

  input.addEventListener("input", (e) => {
    debouncedBuildSidebar(e.target.value);
  });
}

/* =====================
   FILTERS & SORT (NEW)
   ===================== */

function initFilters() {
  const filterSelect = document.querySelector("#filter-select");
  const sortSelect = document.querySelector("#sort-select");

  if (filterSelect) {
    // Ensure the current state value is reflected in the rebuilt dropdown
    filterSelect.value = SB_STATE.currentFilter;
    filterSelect.addEventListener("change", (e) => {
      SB_STATE.currentFilter = e.target.value;
      buildSidebar();
    });
  }

  if (sortSelect) {
    // Ensure the current state value is reflected in the rebuilt dropdown
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

  // Keep the header (filters + search) as-is
  const headerBlock = sidebar.querySelector(".sidebar-header-static");
  if (!headerBlock) {
    console.warn("Sidebar header not found; cannot build list.");
    return;
  }

  // Remove everything AFTER the header (old groups/families/species)
  while (headerBlock.nextSibling) {
    sidebar.removeChild(headerBlock.nextSibling);
  }

  const groups = [...(SB_STATE.taxo.groups || [])].sort(
    (a, b) =>
      (a.sidebar_order || 0) - (b.sidebar_order || 0) ||
      a.label.localeCompare(b.label)
  );

  const families = SB_STATE.taxo.families || [];

  // 1. Filter and sort the entire bird list based on user selections
  let filteredBirds = SB_STATE.birds;
  const currentFilter = SB_STATE.currentFilter;
  const currentSort = SB_STATE.currentSort;

  // Apply Filter
  if (currentFilter !== "all") {
    if (currentFilter === "endemic") {
      filteredBirds = filteredBirds.filter((bird) => bird.is_endemic);
    } else if (currentFilter === "with-photo") {
      filteredBirds = filteredBirds.filter(
        (bird) => Array.isArray(bird.photos) && bird.photos.length > 0
      );
    } else {
      // IUCN code filter: LC, NT, VU, EN, CR etc.
      filteredBirds = filteredBirds.filter(
        (bird) => bird.conservation_status?.iucn_code === currentFilter
      );
    }
  }

  // Apply Sort
  filteredBirds.sort((a, b) => {
    if (currentSort === "scientific_name") {
      return (a.scientific_name || "").localeCompare(b.scientific_name || "");
    }
    if (currentSort === "status") {
      return (a.status_in_sahyadris || "").localeCompare(
        b.status_in_sahyadris || ""
      );
    }
    // Default or 'common_name'
    return (a.common_name || "").localeCompare(b.common_name || "");
  });

  // 2. Precompute family -> species array from the filtered list
  const birdsByFamily = {};
  filteredBirds.forEach((bird) => {
    if (!birdsByFamily[bird.family_id]) {
      birdsByFamily[bird.family_id] = [];
    }
    birdsByFamily[bird.family_id].push(bird);
  });

  const q = (SB_STATE.searchQuery || "").trim().toLowerCase();

  // 3. Build groups + families + species list
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

      // Apply search on top (common or scientific name)
      if (q) {
        speciesList = speciesList.filter((bird) => {
          const common = (bird.common_name || "").toLowerCase();
          const sci = (bird.scientific_name || "").toLowerCase();
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

      speciesList.forEach((bird) => {
        const li = document.createElement("li");
        li.className = "sidebar-species-item";
        li.classList.toggle("active", bird.id === SB_STATE.currentBirdId);
        li.textContent = bird.common_name;
        li.dataset.birdId = bird.id;
        li.addEventListener("click", () => showBird(bird.id));
        list.appendChild(li);
      });

      famBlock.appendChild(list);
      groupSection.appendChild(famBlock);
    });

    if (hasAnyFamily) {
      sidebar.appendChild(groupSection);
    }
  });
}

function highlightSidebarSelection(birdId) {
  // Since we rebuild the sidebar on filter/sort/search,
  // we need to re-highlight the current selection on rebuild.
  // This function is now mainly for when a bird is selected via click.
  const items = document.querySelectorAll(".sidebar-species-item");
  items.forEach((li) => {
    li.classList.toggle("active", li.dataset.birdId === birdId);
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
      (b) => Array.isArray(b.photos) && b.photos.length > 0
    );

    // If at least one bird has photos, restrict the random choice to that pool.
    if (withPhotos.length > 0) {
      pool = withPhotos;
    }
    // If no birds have photos, fall back silently to all birds.
  }

  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx].id;
}

function showBird(birdId) {
  const bird = SB_STATE.birdsById[birdId];
  if (!bird) return;

  SB_STATE.currentBirdId = birdId;
  buildSidebar(); // Rebuild sidebar to ensure correct item is highlighted
  renderBirdInfo(bird);
  renderBirdImages(bird);

  // Update URL hash for deep-linking
  window.location.hash = birdId;
}

// Helper function to format size ranges neatly
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

  const statusLabel = bird.status_in_sahyadris
    ? bird.status_in_sahyadris.replace(/_/g, " ")
    : "";

  // Build HTML in a string first
  let html = `
    <header class="bird-header">
      <h1 class="bird-common-name">${bird.common_name}</h1>
      <h2 class="bird-scientific-name"><em>${bird.scientific_name}</em></h2>
      <div class="bird-badges">
        ${
          bird.is_endemic
            ? `<span class="badge badge-endemic">Endemic to Western Ghats</span>`
            : ""
        }
        ${
          statusLabel
            ? `<span class="badge badge-status">${statusLabel}</span>`
            : ""
        }
        ${
          bird.conservation_status
            ? `<span class="badge badge-iucn">${bird.conservation_status.label} (${bird.conservation_status.iucn_code})</span>`
            : ""
        }
      </div>
      <div class="bird-classification">
        ${
          order
            ? `<div><span class="label">Order:</span> ${order.scientific_name}</div>`
            : ""
        }
        ${
          family
            ? `<div><span class="label">Family:</span> ${family.scientific_name} – ${family.common_label}</div>`
            : ""
        }
      </div>
    </header>

    <section class="bird-section">
      <h3>Habitat</h3>
      <p>${bird.habitat || ""}</p>
    </section>

    <section class="bird-section">
      <h3>Size & appearance</h3>
      ${
        bird.size
          ? `<p><strong>Length:</strong> ${
              formatRange(bird.size.length_cm) + " cm"
            }${
              bird.size.wingspan_cm
                ? `; <strong>Wingspan:</strong> ${formatRange(
                    bird.size.wingspan_cm
                  )} cm`
                : ""
            }</p>`
          : ""
      }
      <p><strong>Adult male:</strong> ${bird.description?.adult_male || ""}</p>
      <p><strong>Adult female:</strong> ${
        bird.description?.adult_female || ""
      }</p>
      <p><strong>Juvenile:</strong> ${bird.description?.juvenile || ""}</p>
      <p><strong>In flight:</strong> ${bird.description?.in_flight || ""}</p>
    </section>

    <section class="bird-section">
      <h3>Food</h3>
      <p>${bird.food || ""}</p>
    </section>

    <section class="bird-section">
      <h3>Behaviour</h3>
      <p>${bird.behaviour || ""}</p>
    </section>
  `;

  // Append the "Did you know?" box if present
  if (bird.did_you_know) {
    html += `
      <section class="dyk-box">
        <h3>Did you know?</h3>
        <p>${bird.did_you_know}</p>
      </section>
    `;
  }

  // Finally write everything to the DOM once
  el.innerHTML = html;
}

function renderBirdImages(bird) {
  const el = document.querySelector(SB_CONFIG.ui.imagePanelSelector);
  if (!el) return;

  const photos = Array.isArray(bird.photos) ? bird.photos : [];

  // No photos → show placeholder
  if (!photos.length) {
    el.innerHTML = `
      <div class="image-placeholder">
        <img src="${SB_CONFIG.images.placeholder}" alt="No photo available">
        <p>No photographs added yet for this species.</p>
      </div>
    `;
    return;
  }

  // Stack all images vertically, each with full caption + credit
  const html = photos
    .map((p) => {
      const caption = p.caption || "";
      const photographer = p.photographer || "";
      const license = p.license || "";

      return `
        <figure class="bird-main-image">
          <img src="${p.file}" alt="${bird.common_name}">
          <figcaption class="image-caption">
            <div>${caption}</div>
            <div class="image-credit">
              ${photographer ? `Photo: ${photographer}` : ""}
              ${license ? `${photographer ? " · " : ""}${license}` : ""}
            </div>
          </figcaption>
        </figure>
      `;
    })
    .join("");

  el.innerHTML = html;
}

// Global utility for switching images (Now unused in favor of stacked images)
window.switchMainImage = function (thumbnail) {
  // This function is no longer used as images are stacked vertically
  console.warn("switchMainImage is deprecated in the current layout.");
};

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

  const html = items
    .map(
      (r) => `
      <article class="resource-item">
        <h3><a href="${r.url}" target="_blank" rel="noopener noreferrer">${
        r.name
      }</a></h3>
        <p>${r.description || ""}</p>
      </article>
    `
    )
    .join("");

  container.innerHTML = html;
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
      ? `<p class="site-location"><strong>Location:</strong> ${site.location}</p>`
      : "";

    // Places-to-stay block
    let placesBlock = "";
    if (Array.isArray(site.places_to_stay) && site.places_to_stay.length > 0) {
      const items = site.places_to_stay
        .map((p) => {
          const link =
            p.url && p.url.trim()
              ? ` <a href="${p.url}" target="_blank" rel="noopener noreferrer">(details)</a>`
              : "";
          return `<li><strong>${p.name}</strong> – ${p.description}${link}</li>`;
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
      <h2>${site.name}</h2>
      ${locationLine}
      <p>${site.description}</p>
      ${placesBlock}
    `;

    container.appendChild(div);
  });
}

/* =====================
   ABOUT & CONTACT META
   ===================== */

function renderAbout() {
  const meta = SB_STATE.siteMeta;
  if (!meta) return;
  const about = document.querySelector("#about-content");
  if (about) {
    about.innerHTML = meta.about_html || "";
  }
}

function renderContactMeta() {
  const meta = SB_STATE.siteMeta;
  if (!meta) return;
  const note = document.querySelector("#contact-note");
  if (note && meta.contact && meta.contact.note_html) {
    note.innerHTML = meta.contact.note_html;
  }
}
