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
