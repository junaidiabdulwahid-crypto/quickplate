# QuickPlate

A food delivery app, end to end: menu and cart, coupons, a GST bill, Razorpay-style payments with webhooks and refunds, a kitchen status flow, and rider assignment with live tracking.

Built with **NestJS + TypeScript**, **PostgreSQL + PostGIS**, **Redis** and **Next.js**. It is the second companion project of my book *Full-Stack From Zero*, built from an empty folder to a production-style backend.

## Highlights

- **Prices only from the database.** The cart sends dish IDs and quantities; a sneaked-in `price` field is rejected with a 400. The quote and the real order share one `price()` function, so the bill shown is the bill charged.
- **A bill in whole paise.** Coupon (percent with a cap, or flat), distance-based delivery (free above ₹499), packaging, and 5% GST on food after discount. Pure functions with unit tests.
- **Coupons with five clear rules.** Invalid, expired, below the minimum ("Add ₹319.00 more to use FLAT75"), per-user limit, and the cap.
- **Double taps are harmless.** An `Idempotency-Key` header plus Redis `SET NX`: the same tap twice returns the same order.
- **Payments done properly.** The order is committed before the gateway is called (no DB locks held on a network call). The checkout signature is HMAC-SHA256, compared with `timingSafeEqual`. Webhooks are verified over the raw body, deduplicated by event ID, and both paths meet in one idempotent, row-locked `markPaid`.
- **Failure drills.** Gateway down → clean 503 and `payment_failed`. Gateway slow → 5 s timeout + one retry (~10 s, never forever). Duplicate webhook → paid once. Forged webhook → 400. Cancel a paid order → the refund goes through first, or nothing changes.
- **A status machine.** `pending_payment → paid → accepted → preparing → ready → picked_up → delivered`; anything else is a 409. Every change writes a timeline row.
- **Riders in Redis GEO.** Positions via `GEOADD`; the nearest free rider within 5 km is claimed with `SREM`, which is atomic, so two orders can never get the same rider.
- **Roles and ownership.** `@Roles()` + a custom guard (401 vs 403), ownership checks in services, and 404 for orders that aren't yours.

## Stack

| Layer | Tech |
| --- | --- |
| API | NestJS 11, TypeORM, class-validator, JWT, ioredis |
| Data | PostgreSQL 16 + PostGIS (10 tables), Redis 7 |
| Payments | PaySim (`gateway/server.ts`): a pretend Razorpay-style gateway in plain Node.js with chaos modes; no real money |
| Web | Next.js 15, React 19 |
| Tests | Jest (bill, status machine, signatures, money); `demo.sh` (30 steps against the running stack) |
| CI | GitHub Actions: typecheck, test and build |

## Run it

```bash
docker compose up -d                                   # PostgreSQL + PostGIS on :54340, Redis on :63790

cd api && cp ../.env.example .env                      # set JWT_SECRET (openssl rand -hex 32)
pnpm install && pnpm build && pnpm start               # API on :3200

cd ../gateway && pnpm install && pnpm start            # PaySim on :4000

cd ../web && pnpm install && pnpm dev                  # web on :3002

./demo.sh                                              # the whole story, 30 steps
./reset.sh                                             # start over
```

Sign in with any Indian number and the code `000000`. On a first login you may pick a role (`customer`, `restaurant_owner`, `rider`); a real app would verify restaurants and riders first.

## API

All paths start with `/api/v1`.

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| POST | `/auth/login` | public | Token; name + role on first login |
| GET | `/health` | public | Database + Redis |
| POST | `/restaurants` | restaurant_owner | Open a restaurant |
| PATCH | `/restaurants/:id` | owner | Open or close it |
| GET | `/restaurants/nearby` | public | Open restaurants, nearest first |
| GET | `/restaurants/:id/menu` | public | Menu |
| POST | `/restaurants/:id/menu` | owner | Add a dish |
| GET | `/coupons` | public | Active coupons |
| POST | `/orders/quote` | customer | The bill; nothing saved |
| POST | `/orders` | customer | Order + checkout (`Idempotency-Key`) |
| GET | `/orders` | signed in | My orders |
| GET | `/orders/:id` | customer / owner / rider | Order, bill, timeline, rider position |
| POST | `/orders/:id/status` | restaurant_owner, rider | Move the order forward |
| POST | `/orders/:id/cancel` | customer, restaurant_owner | Cancel (refunds if paid) |
| POST | `/payments/verify` | customer | Check the checkout signature |
| POST | `/webhooks/payments` | the gateway | Signed webhook |
| POST | `/riders/me/location` | rider | Position + availability |

## Project layout

```
db/001_init.sql   10 tables with CHECK / UNIQUE / REFERENCES, 2 sample coupons
api/src/          auth/ restaurants/ coupons/ (bill.ts) orders/ (status machine) payments/ riders/ redis/ audit/ health/
gateway/          PaySim: orders, hosted checkout, refunds, signed webhooks, chaos modes
web/app/          home, login, restaurants/[id] (menu + cart + bill), orders/[id] (verify + live tracking)
demo.sh, reset.sh
```
