import sqlite3

import archive


def _row(hid, frp):
    return {"id": hid, "external_id": hid, "source": "FIRMS", "category": "fire", "title": "Fire hotspot",
            "severity_value": frp, "started_at": "2026-10-28T08:12:00+00:00", "latitude": 31.5, "longitude": 74.5,
            "geometry": {"type": "Point", "coordinates": [74.5, 31.5]}, "raw": {"frp": str(frp), "confidence": "n"}}


def test_hotspots_are_stored_and_a_later_copy_replaces_the_earlier():
    assert archive.store_hotspots([_row("FIRMS-a", 5.0), _row("FIRMS-b", 7.0)]) == 2
    assert archive.store_hotspots([_row("FIRMS-a", 9.5)]) == 1                 # FIRMS re-sent it
    conn = sqlite3.connect(archive.DB_PATH)
    rows = conn.execute("select id, source, severity_value, raw, geometry from events order by id").fetchall()
    assert [r[:3] for r in rows] == [("FIRMS-a", "FIRMS", 9.5), ("FIRMS-b", "FIRMS", 7.0)]
    assert rows[0][3] == '{"frp": "9.5", "confidence": "n"}' and rows[0][4].startswith('{"type": "Point"')


def test_no_hotspots_writes_nothing():
    assert archive.store_hotspots([]) == 0
