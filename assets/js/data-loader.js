// assets/js/data-loader.js

async function sbLoadJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return response.json();
}

/* ---------------------------------------------------------------
   RESIDENCY NORMALISATION
   The hand-authored `status_in_sahyadris` field has accumulated many
   spellings/casings for a handful of real categories. We map each raw
   string to a canonical { code, label } pair at load time, so sorting,
   filtering and the badge are consistent — WITHOUT mutating birds.json.
   Any unmapped value is surfaced via console.warn (and shown verbatim),
   so new species you add can't silently fragment the list.
   --------------------------------------------------------------- */

const SB_RESIDENCY_MAP = {
  "resident": { code: "resident", label: "Resident" },
  "migrant": { code: "migrant", label: "Migrant" },
  "winter visitor": { code: "winter_visitor", label: "Winter visitor" },
  "winter_visitor": { code: "winter_visitor", label: "Winter visitor" },
  "resident/migrant": { code: "resident_migrant", label: "Resident / migrant" },
  "migrant/resident": { code: "resident_migrant", label: "Resident / migrant" },
  "resident, local migrant": {
    code: "resident_migrant",
    label: "Resident / local migrant",
  },
  "winter visitor/resident": {
    code: "winter_visitor_resident",
    label: "Winter visitor / resident",
  },
  "winter visitor / resident": {
    code: "winter_visitor_resident",
    label: "Winter visitor / resident",
  },
  "winter visitor / passage migrant": {
    code: "winter_visitor_passage",
    label: "Winter visitor / passage migrant",
  },
  "winter visitor/passage migrant": {
    code: "winter_visitor_passage",
    label: "Winter visitor / passage migrant",
  },
  "vagrant/winter_visitor": {
    code: "vagrant_winter_visitor",
    label: "Vagrant / winter visitor",
  },
  "rare/edge-of-range": {
    code: "rare_edge_of_range",
    label: "Rare / edge-of-range",
  },
};

function sbNormaliseResidency(raw) {
  if (!raw || typeof raw !== "string") {
    return { code: "unknown", label: "" };
  }
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  const hit = SB_RESIDENCY_MAP[key];
  if (hit) return hit;

  // Unmapped: keep the original text as the label, derive a code, warn.
  console.warn(
    `[data-loader] Unmapped residency status: "${raw}". ` +
      `Add it to SB_RESIDENCY_MAP in data-loader.js.`
  );
  return {
    code: key.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
    label: raw.trim(),
  };
}

const SB_IUCN_ORDER = ["EW", "CR", "EN", "VU", "NT", "LC", "DD", "NE"];

async function sbLoadAllData() {
  const [birds, taxo, resources, siteMeta, sites] = await Promise.all([
    sbLoadJson(SB_CONFIG.data.birds),
    sbLoadJson(SB_CONFIG.data.families),
    sbLoadJson(SB_CONFIG.data.resources),
    sbLoadJson(SB_CONFIG.data.siteMeta),
    sbLoadJson(SB_CONFIG.data.sites),
  ]);

  // Attach a normalised residency object to each bird (non-destructive).
  birds.forEach((b) => {
    b.residency = sbNormaliseResidency(b.status_in_sahyadris);
  });

  // Quick-lookup maps
  const birdsById = {};
  birds.forEach((b) => {
    birdsById[b.id] = b;
  });

  const familiesById = {};
  taxo.families.forEach((f) => {
    familiesById[f.id] = f;
  });

  // Which IUCN codes are actually present, in conventional severity order.
  const presentCodes = new Set(
    birds
      .map((b) => b.conservation_status && b.conservation_status.iucn_code)
      .filter(Boolean)
  );
  const iucnCodes = SB_IUCN_ORDER.filter((c) => presentCodes.has(c));

  return {
    birds,
    birdsById,
    taxo,
    familiesById,
    resources,
    siteMeta,
    sites,
    iucnCodes,
  };
}
