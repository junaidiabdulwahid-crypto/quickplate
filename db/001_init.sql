-- QuickPlate database: a food delivery app.
-- Run once on PostgreSQL 16 with PostGIS: psql "$DATABASE_URL" -f db/001_init.sql
-- Money is NUMERIC rupees (2 decimals); the API does all maths in whole paise.
BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    phone       TEXT        NOT NULL UNIQUE,
    name        TEXT        NOT NULL DEFAULT '',
    role        TEXT        NOT NULL CHECK (role IN ('customer', 'restaurant_owner', 'rider')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE restaurants (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id       UUID          NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    name           TEXT          NOT NULL CHECK (btrim(name) <> ''),
    cuisine        TEXT          NOT NULL,
    location       geography(Point, 4326) NOT NULL,                  -- longitude, latitude
    packaging_fee  NUMERIC(10,2) NOT NULL DEFAULT 15 CHECK (packaging_fee >= 0),
    is_open        BOOLEAN       NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX restaurants_location_idx ON restaurants USING GIST (location);

CREATE TABLE menu_items (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id  UUID          NOT NULL REFERENCES restaurants (id) ON DELETE CASCADE,
    name           TEXT          NOT NULL CHECK (btrim(name) <> ''),
    price          NUMERIC(10,2) NOT NULL CHECK (price > 0),
    is_veg         BOOLEAN       NOT NULL DEFAULT true,
    is_available   BOOLEAN       NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX menu_items_restaurant_idx ON menu_items (restaurant_id);

CREATE TABLE coupons (
    code            TEXT          PRIMARY KEY CHECK (code = upper(code)),   -- the code is the ID
    description     TEXT          NOT NULL,
    discount_type   TEXT          NOT NULL CHECK (discount_type IN ('percent', 'flat')),
    discount_value  NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),
    max_discount    NUMERIC(10,2),                                           -- cap for percent coupons
    min_order       NUMERIC(10,2) NOT NULL DEFAULT 0,
    per_user_limit  INTEGER       NOT NULL DEFAULT 1 CHECK (per_user_limit > 0),
    valid_until     TIMESTAMPTZ   NOT NULL,
    is_active       BOOLEAN       NOT NULL DEFAULT true,
    CHECK (discount_type <> 'percent' OR discount_value <= 100)
);

CREATE TABLE orders (
    id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id          UUID          NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    restaurant_id        UUID          NOT NULL REFERENCES restaurants (id) ON DELETE RESTRICT,
    rider_id             UUID          REFERENCES users (id) ON DELETE RESTRICT,
    status               TEXT          NOT NULL CHECK (status IN ('pending_payment', 'payment_failed', 'paid',
                                           'accepted', 'preparing', 'ready', 'picked_up', 'delivered', 'cancelled')),
    delivery_location    geography(Point, 4326) NOT NULL,
    delivery_distance_m  INTEGER       NOT NULL CHECK (delivery_distance_m >= 0),
    coupon_code          TEXT          REFERENCES coupons (code),
    items_total          NUMERIC(12,2) NOT NULL,
    discount             NUMERIC(12,2) NOT NULL DEFAULT 0,
    delivery_fee         NUMERIC(12,2) NOT NULL,
    packaging_fee        NUMERIC(12,2) NOT NULL,
    gst                  NUMERIC(12,2) NOT NULL,
    grand_total          NUMERIC(12,2) NOT NULL CHECK (grand_total > 0),
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX orders_customer_idx ON orders (customer_id, created_at DESC);
CREATE INDEX orders_restaurant_idx ON orders (restaurant_id, status);
CREATE INDEX orders_rider_idx ON orders (rider_id, created_at DESC);

-- A copy of each line at order time: a later price change never rewrites an old bill
CREATE TABLE order_items (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id      UUID          NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    menu_item_id  UUID          NOT NULL REFERENCES menu_items (id) ON DELETE RESTRICT,
    name          TEXT          NOT NULL,
    unit_price    NUMERIC(10,2) NOT NULL,
    quantity      INTEGER       NOT NULL CHECK (quantity BETWEEN 1 AND 20),
    line_total    NUMERIC(12,2) NOT NULL
);
CREATE INDEX order_items_order_idx ON order_items (order_id);

-- Every status change, in order: the tracking timeline
CREATE TABLE order_events (
    id             BIGSERIAL   PRIMARY KEY,
    order_id       UUID        NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    from_status    TEXT,
    to_status      TEXT        NOT NULL,
    actor_user_id  UUID        REFERENCES users (id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX order_events_order_idx ON order_events (order_id, id);

CREATE TABLE payments (
    id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            UUID          NOT NULL UNIQUE REFERENCES orders (id) ON DELETE RESTRICT,  -- one order, one payment
    gateway_order_id    TEXT          UNIQUE,
    gateway_payment_id  TEXT          UNIQUE,
    gateway_refund_id   TEXT,
    amount              NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    status              TEXT          NOT NULL CHECK (status IN ('pending', 'created', 'captured', 'failed', 'refunded')),
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Webhook events already handled: the gateway may send the same event more than once
CREATE TABLE webhook_events (
    event_id     TEXT        PRIMARY KEY,
    event_type   TEXT        NOT NULL,
    received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id  UUID        REFERENCES users (id),       -- NULL when the gateway caused the change
    action         TEXT        NOT NULL,
    entity_type    TEXT        NOT NULL,
    entity_id      UUID,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO coupons (code, description, discount_type, discount_value, max_discount, min_order, per_user_limit, valid_until)
VALUES ('WELCOME50', '50% off your first order, up to ₹100', 'percent', 50, 100, 149, 1, now() + interval '1 year'),
       ('FLAT75', '₹75 off orders above ₹399', 'flat', 75, NULL, 399, 3, now() + interval '1 year');

COMMIT;
