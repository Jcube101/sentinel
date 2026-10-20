"""In-memory stand-in for the supabase-py client: just the calls the pipeline makes."""
import copy
from types import SimpleNamespace


class FakeSupabase:
    def __init__(self, tables=None, missing=()):
        self.tables = {name: [dict(r) for r in rows] for name, rows in (tables or {}).items()}
        self.missing = set(missing)  # tables that "don't exist yet" (migration not applied)
        # Tables whose upserts are stored (others are only recorded in calls)
        self.upsert_keys = {"desk_items": ("id",), "desk_item_snapshots": ("run_id", "item_id")}
        self.calls = []              # (table, op, payload)
        self._next_id = {}

    def table(self, name):
        return _Query(self, name)

    def rows(self, name):
        return self.tables.setdefault(name, [])


class _Query:
    def __init__(self, db, name):
        self.db, self.name = db, name
        self.op, self.payload, self.filters = "select", None, []

    def select(self, *_cols):
        self.op = "select"
        return self

    def insert(self, row):
        self.op, self.payload = "insert", row
        return self

    def upsert(self, rows, on_conflict=None):
        self.op, self.payload = "upsert", rows
        return self

    def update(self, values):
        self.op, self.payload = "update", values
        return self

    def eq(self, col, value):
        self.filters.append((col, lambda v, value=value: v == value))
        return self

    def in_(self, col, values):
        values = set(values)
        self.filters.append((col, lambda v: v in values))
        return self

    def _matches(self, row):
        return all(test(row.get(col)) for col, test in self.filters)

    def execute(self):
        db = self.db
        db.calls.append((self.name, self.op, copy.deepcopy(self.payload)))
        if self.name in db.missing:
            raise RuntimeError(f'relation "public.{self.name}" does not exist')
        rows = db.rows(self.name)
        if self.op == "select":
            return SimpleNamespace(data=[dict(r) for r in rows if self._matches(r)])
        if self.op == "insert":
            row = dict(self.payload)
            row.setdefault("id", db._next_id.setdefault(self.name, 1))
            db._next_id[self.name] = row["id"] + 1
            rows.append(row)
            return SimpleNamespace(data=[dict(row)])
        if self.op == "upsert":
            if self.name in db.upsert_keys:  # keep rows, keyed like the real table
                key = db.upsert_keys[self.name]
                by_key = {tuple(r[k] for k in key): r for r in rows}
                for r in self.payload:
                    by_key[tuple(r[k] for k in key)] = dict(r)
                rows[:] = list(by_key.values())
            return SimpleNamespace(data=[dict(r) for r in self.payload])
        if self.op == "update":
            hit = [r for r in rows if self._matches(r)]
            for r in hit:
                r.update(self.payload)
            return SimpleNamespace(data=[dict(r) for r in hit])
        raise AssertionError(self.op)
