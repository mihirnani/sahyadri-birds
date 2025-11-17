// assets/js/config.js
const SB_CONFIG = {
  data: {
    birds: "assets/data/birds.json",
    families: "assets/data/families.json",
    resources: "assets/data/resources.json",
    siteMeta: "assets/data/site-meta.json",
    sites: "assets/data/sites.json",
  },
  ui: {
    sidebarSelector: "#sidebar",
    infoPanelSelector: "#bird-info",
    imagePanelSelector: "#bird-images",
    tabsSelector: "[data-tab]",
    tabContentSelector: "[data-tab-content]",
  },
  defaults: {
    // if null, we will pick a random bird on load
    initialBirdId: null,
  },
  images: {
    placeholder: "assets/images/ui/placeholder-bird.jpg",
  },
};
