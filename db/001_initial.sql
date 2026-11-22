CREATE TABLE IF NOT EXISTS families (
  id uuid PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS farms (
  id uuid PRIMARY KEY,
  family_id uuid NOT NULL REFERENCES families(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  version integer NOT NULL DEFAULT 1,
  UNIQUE (id, family_id)
);

CREATE TABLE IF NOT EXISTS batches (
  id uuid PRIMARY KEY,
  family_id uuid NOT NULL REFERENCES families(id),
  farm_id uuid NOT NULL,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date,
  pig_count integer NOT NULL CHECK (pig_count > 0),
  pig_cost numeric(18,0) NOT NULL CHECK (pig_cost >= 0),
  version integer NOT NULL DEFAULT 1,
  FOREIGN KEY (farm_id, family_id) REFERENCES farms(id, family_id),
  UNIQUE (id, family_id),
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS batches_one_active_per_farm ON batches(farm_id) WHERE end_date IS NULL;

CREATE TABLE IF NOT EXISTS feed_types (
  id uuid PRIMARY KEY,
  family_id uuid NOT NULL REFERENCES families(id),
  name text NOT NULL,
  UNIQUE (id, family_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS feed_types_unique_name ON feed_types(family_id, lower(trim(name)));

CREATE TABLE IF NOT EXISTS entries (
  id uuid PRIMARY KEY,
  family_id uuid NOT NULL REFERENCES families(id),
  batch_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('feed', 'sale', 'labor', 'other')),
  date date NOT NULL,
  month text,
  description text NOT NULL DEFAULT '',
  amount numeric(18,0) NOT NULL CHECK (amount >= 0),
  pig_count integer CHECK (pig_count > 0),
  kg numeric(18,6) CHECK (kg > 0),
  price numeric(18,6) CHECK (price >= 0),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (batch_id, family_id) REFERENCES batches(id, family_id),
  UNIQUE (id, family_id),
  CHECK ((kind = 'labor' AND month ~ '^\d{4}-(0[1-9]|1[0-2])$') OR (kind <> 'labor' AND month IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS entries_one_labor_per_month ON entries(batch_id, month) WHERE kind = 'labor';
CREATE INDEX IF NOT EXISTS entries_family_date ON entries(family_id, date DESC);

CREATE TABLE IF NOT EXISTS feed_lines (
  id uuid PRIMARY KEY,
  family_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  feed_type_id uuid NOT NULL,
  position integer NOT NULL,
  name text NOT NULL,
  bags integer NOT NULL CHECK (bags > 0),
  price numeric(18,6) NOT NULL CHECK (price >= 0),
  discount numeric(18,6) NOT NULL CHECK (discount >= 0 AND discount <= price),
  FOREIGN KEY (entry_id, family_id) REFERENCES entries(id, family_id) ON DELETE CASCADE,
  FOREIGN KEY (feed_type_id, family_id) REFERENCES feed_types(id, family_id)
);
CREATE INDEX IF NOT EXISTS feed_lines_entry ON feed_lines(entry_id);

CREATE TABLE IF NOT EXISTS mutation_requests (
  family_id uuid NOT NULL REFERENCES families(id),
  request_id uuid NOT NULL,
  payload_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (family_id, request_id)
);
