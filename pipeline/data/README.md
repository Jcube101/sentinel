# Pipeline reference data

## india_outline.geojson

India's outline, used for the quake scope ("within 100 km of India").

- **Built by** `tools/build_india_outline.py`: the 735 districts dissolved
  into one shape, holes dropped, simplified to ~1 km.
- **Source:** [geoBoundaries](https://www.geoboundaries.org) gbOpen IND ADM2,
  release commit `9469f09` (2021 vintage, from LGD via Pathways Data). It
  follows India's official boundary.
- **Licence:** Open Database License (ODbL) 1.0. This file is a derived
  database, so it is shared under ODbL too. Attribution:
  "Contains geoBoundaries data (ODbL 1.0)". The credit on the frontend's
  About page is a TODO (docs/severity-pipeline.md).

## india_districts.geojson

India's 735 districts with their state, used to place fire events
(`fire.py`).

- **Built by** `tools/build_districts.py`: each district gets the state
  whose polygon contains a point inside it; names without diacritics;
  a few source typos fixed (`NAME_FIXES`); simplified to ~300 m.
- **Sources:** geoBoundaries gbOpen IND, release commit `9469f09`:
  ADM2 districts (LGD via Pathways Data, ODbL 1.0) and ADM1 states
  (DataMeet / Election Commission of India, CC BY 2.5 IN; current: has
  Telangana, Ladakh, and Dadra and Nagar Haveli and Daman and Diu).
- **Note:** the source has one unnamed polygon covering Gilgit-Baltistan
  and PoK, filed under Ladakh; it is named "Gilgit-Baltistan / PoK" here.
- **Licences:** ODbL 1.0 (derived database, shared under ODbL) and
  CC BY 2.5 IN. Attribution: "Contains geoBoundaries data (ODbL 1.0) and
  DataMeet / ECI state boundaries (CC BY 2.5 IN)".

## static_heat_cells.json

The static heat-source mask: ~450 m grid cells where the FIRMS archive saw
volcano (type 1), static land-source (type 2: steel plants, refineries,
gas flares, coal-seam fires) or offshore (type 3) detections. The live
NRT feed has no type column, so `fire.py` drops live hotspots in or next
to these cells before clustering.

- **Built by** `tools/build_fire_baseline.py` from the VIIRS NOAA-20
  standard-processing archive (2024-2025) pulled by
  `tools/pull_firms_archive.py`; parameters in severity.toml
  `[fire.static_mask]`.
- **Source:** NASA FIRMS. Acknowledgement: "We acknowledge the use of data
  from NASA's Fire Information for Resource Management System (FIRMS),
  part of NASA's Earth Science Data and Information System (ESDIS)."

## fire_baseline.csv

The seasonal norm: mean daily fire events per state (plus "India") per
calendar week, from the same archive, counted exactly like live
fire_events. Also uploaded to the fire_baseline table (migration 004).
Built by `tools/build_fire_baseline.py`; parameters in severity.toml
`[fire.baseline]`. Source and acknowledgement as above (NASA FIRMS).
