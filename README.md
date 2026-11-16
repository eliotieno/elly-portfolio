# elly-portfolio

Elly Otieno's portfolio site. Astro, MapLibre GL JS, Observable Plot. Deployed on Netlify from this repo.

## Run it

    npm install
    npm run dev        # http://localhost:4321
    npm run check      # build, then copy check and leak check

## Data rule

Nothing from Trees for the Future is published here. Everything in `public/data/` is either generated from scratch
(`data-build/make_data.py`, seeded) or built from public or synthetic files (`data-build/make_from_sources.py`).
Real coordinates are never jittered or sampled.

`checks/leak_check.py` reads the real farm file named in `data-build/local_paths.json` (not committed; copy `local_paths.example.json`) and fails if any published coordinate is within 50 m of
a real farm, or if a real farmer name, farm ID or group name appears in `dist/`. It can only run on a computer that has
the Drive. Run it before every push that changes data.

`checks/copy_check.mjs` fails if a built page contains an em dash or a word from the banned list.

## Layout

    src/data/work.js      the case studies and the shorter index entries
    src/pages/work/       one .astro page per case study
    src/components/       the two maps and two dashboards
    src/lib/demo.js       shared map and chart helpers
    src/styles/tokens.css the palette (two neutrals, one green), type and shared classes
