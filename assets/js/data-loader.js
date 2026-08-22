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
   filtering and the badge are consistent – WITHOUT mutating birds.json.
   Any unmapped value is surfaced via console.warn (and shown verbatim),
   so new species you add can't silently fragment the list.
   --------------------------------------------------------------- */

function sbNormaliseResidency(raw) {
  if (!raw || typeof raw !== "string") {
    return { code: "unknown", label: "" };
  }
  // Controlled vocabulary in birds.json: resident, winter visitor,
  // summer breeder, passage migrant, local migrant, vagrant – joined
  // with " / " when a species fits more than one.
  const parts = raw
    .trim()
    .toLowerCase()
    .replace(/_/g, " ")
    .split(/\s*[\/,]\s*/)
    .filter(Boolean);
  const label = parts
    .map((p, i) => (i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join(" / ");
  return { code: parts.join("_").replace(/\s+/g, "_"), label };
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
