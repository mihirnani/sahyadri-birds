// assets/js/data-loader.js

async function sbLoadJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return response.json();
}

async function sbLoadAllData() {
  const [birds, taxo, resources, siteMeta, sites] = await Promise.all([
    sbLoadJson(SB_CONFIG.data.birds),
    sbLoadJson(SB_CONFIG.data.families),
    sbLoadJson(SB_CONFIG.data.resources),
    sbLoadJson(SB_CONFIG.data.siteMeta),
    sbLoadJson(SB_CONFIG.data.sites),
  ]);

  // Build maps for quick lookup
  const birdsById = {};
  birds.forEach((b) => {
    birdsById[b.id] = b;
  });

  const familiesById = {};
  taxo.families.forEach((f) => {
    familiesById[f.id] = f;
  });

  return {
    birds,
    birdsById,
    taxo,
    familiesById,
    resources,
    siteMeta,
    sites,
  };
}
