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
   `status_in_sahyadris` is a controlled vocabulary – resident, winter
   visitor, summer breeder, passage migrant, local migrant, vagrant –
   joined with " / " when a species fits more than one, the commoner
   status first (so "resident / winter visitor", never the reverse).
   We derive a { code, label } pair at load time for sorting and the
   badge, WITHOUT mutating birds.json. A value outside the vocabulary
   is reported on the console so a new species cannot silently
   fragment the list.
   --------------------------------------------------------------- */

const SB_STATUS_VOCAB = [
  "resident",
  "winter visitor",
  "summer breeder",
  "passage migrant",
  "local migrant",
  "vagrant",
];

function sbNormaliseResidency(raw) {
  if (!raw || typeof raw !== "string") {
    return { code: "unknown", label: "" };
  }
  const parts = raw
    .trim()
    .toLowerCase()
    .replace(/_/g, " ")
    .split(/\s*[\/,]\s*/)
    .filter(Boolean);
  parts.forEach((p) => {
    if (!SB_STATUS_VOCAB.includes(p)) {
      console.warn(`status_in_sahyadris outside the vocabulary: "${raw}"`);
    }
  });
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
