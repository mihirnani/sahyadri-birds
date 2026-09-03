# Birds of the Sahyadris

Part of [Curiosities](https://naniwadekar.com/). A field guide to the birds of the Western
Ghats: one page, rendered in the browser from JSON.

    index.html                the page shell and the About tab's container
    assets/data/birds.json    one record per species: names, status, habitat, size, plumage,
                              behaviour, food, IUCN category, photographs, a "did you know"
    assets/data/families.json orders, families and the sidebar groups the species belong to
    assets/data/site-meta.json  the title, taxonomy and IUCN sources, and the About tab's HTML
    assets/data/sites.json, resources.json   the places and further-reading tabs
    assets/js/                the renderer (app.js), data loading and config
    assets/css/main.css       the look; imports the site's fonts from /assets/fonts/
    assets/images/species/<id>/main.webp     photographs, one folder per species
    sahyadri-birds-sw.js      offline service worker; bump VERSION after any change

There is no build step. Editing the JSON is all that is needed; a species' URL is `#<id>`,
so ids do not change. Names follow the AviList version named on the About page; conservation
categories are the published BirdLife/IUCN assessments. Records with `"pending": true` have
no photograph yet and are shown with a placeholder; when a photograph arrives, fill in the
record (file, caption, photographer, licence, source note) and remove the flag.

Photograph credits are HTML links to the source file and the licence deed, as the live records
show; for a Wikimedia Commons image copy author and licence from the file page and add
`"source_note": "via Wikimedia Commons, resized"`.

The masthead and footer match the other Curiosities collections but are kept by hand in
`index.html`. The routines for the whole site are in `mihirnani.github.io/MAINTAINING.md`.
