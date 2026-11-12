#!/usr/bin/env bash
# The whole QuickPlate story with curl: roles, menu, coupons, bill, idempotent order, payment
# (verify + webhook), the kitchen, a rider, delivery, cancellation with refund, and failure drills.
# Needs: the API on :3200, PaySim on :4000, a fresh database (./reset.sh).
set -euo pipefail

API="${API:-http://localhost:3200/api/v1}"
PAYSIM="${PAYSIM:-http://localhost:4000}"
J='Content-Type: application/json'

step() { printf '\n\033[1;36m== %s\033[0m\n' "$1"; }
call() { curl -s -w '  → %{http_code}\n' "$@"; }
field() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const v=JSON.parse(s)$1;console.log(typeof v==='object'?JSON.stringify(v):v)})"; }
login() { curl -s -X POST "$API/auth/login" -H "$J" -d "{\"phone\":\"$1\",\"code\":\"000000\",\"name\":\"$2\",\"role\":\"$3\"}" | field .access_token; }
mode() { curl -s -o /dev/null -X POST "$PAYSIM/__mode" -H "$J" -d "{\"mode\":\"$1\"}"; }

# The customer's home, 3.2 km north of the restaurant
HOME_LAT=23.6981; HOME_LNG=86.1511
S=$(( RANDOM % 9000 + 1000 ))

step "1. Three people sign in: a restaurant owner, a customer and a rider"
ASHA=$(login "+9190000${S}1" "Asha (Biryani House)" restaurant_owner)
PRIYA=$(login "+9190000${S}2" "Priya" customer)
RAVI=$(login "+9190000${S}3" "Ravi (rider)" rider)
echo "tokens received"

step "2. Asha opens a restaurant and adds three dishes"
REST=$(curl -s -X POST "$API/restaurants" -H "$J" -H "Authorization: Bearer $ASHA" \
  -d '{"name":"Biryani House","cuisine":"Biryani","latitude":23.6694,"longitude":86.1512}' | field .id)
add() { curl -s -X POST "$API/restaurants/$REST/menu" -H "$J" -H "Authorization: Bearer $ASHA" -d "$1" | field .id; }
BIRYANI=$(add '{"name":"Chicken Biryani","price":249,"is_veg":false}')
PANEER=$(add '{"name":"Paneer Tikka","price":180,"is_veg":true}')
ROTI=$(add '{"name":"Butter Roti","price":40,"is_veg":true}')
echo "restaurant $REST"

step "3. A customer tries to open a restaurant"
call -X POST "$API/restaurants" -H "$J" -H "Authorization: Bearer $PRIYA" -d '{"name":"Fake","cuisine":"x","latitude":23.6,"longitude":86.1}'

step "4. Restaurants near Priya's home"
call "$API/restaurants/nearby?lat=$HOME_LAT&lng=$HOME_LNG"

step "5. Active coupons"
call "$API/coupons"

CART="{\"restaurant_id\":\"$REST\",\"items\":[{\"menu_item_id\":\"$PANEER\",\"quantity\":2},{\"menu_item_id\":\"$ROTI\",\"quantity\":3}],\"latitude\":$HOME_LAT,\"longitude\":$HOME_LNG"

step "6. Quote: 2 paneer + 3 roti, 3.2 km away (expect ₹554)"
call -X POST "$API/orders/quote" -H "$J" -H "Authorization: Bearer $PRIYA" -d "$CART}"

step "7. The same with WELCOME50 (50% off, capped at ₹100; expect ₹449)"
call -X POST "$API/orders/quote" -H "$J" -H "Authorization: Bearer $PRIYA" -d "$CART,\"coupon_code\":\"welcome50\"}"

step "8–11. Four bad carts: FLAT75 too small, fake coupon, 12 km away, a price sneaked in"
call -X POST "$API/orders/quote" -H "$J" -H "Authorization: Bearer $PRIYA" \
  -d "{\"restaurant_id\":\"$REST\",\"items\":[{\"menu_item_id\":\"$ROTI\",\"quantity\":2}],\"latitude\":$HOME_LAT,\"longitude\":$HOME_LNG,\"coupon_code\":\"FLAT75\"}"
call -X POST "$API/orders/quote" -H "$J" -H "Authorization: Bearer $PRIYA" -d "$CART,\"coupon_code\":\"FREEFOOD\"}"
call -X POST "$API/orders/quote" -H "$J" -H "Authorization: Bearer $PRIYA" \
  -d "{\"restaurant_id\":\"$REST\",\"items\":[{\"menu_item_id\":\"$ROTI\",\"quantity\":2}],\"latitude\":23.7774,\"longitude\":86.1512}"
call -X POST "$API/orders/quote" -H "$J" -H "Authorization: Bearer $PRIYA" \
  -d "{\"restaurant_id\":\"$REST\",\"items\":[{\"menu_item_id\":\"$ROTI\",\"quantity\":2,\"price\":1}],\"latitude\":$HOME_LAT,\"longitude\":$HOME_LNG}"

step "12. Place the order with WELCOME50 (Idempotency-Key: tap-$S)"
PLACED=$(curl -s -X POST "$API/orders" -H "$J" -H "Authorization: Bearer $PRIYA" -H "Idempotency-Key: tap-$S" -d "$CART,\"coupon_code\":\"WELCOME50\"}")
echo "$PLACED"
ORDER=$(echo "$PLACED" | field .order_id)
GORDER=$(echo "$PLACED" | field .payment.gateway_order_id)

step "13. The same tap arrives again (a network retry): the same order comes back"
AGAIN=$(curl -s -X POST "$API/orders" -H "$J" -H "Authorization: Bearer $PRIYA" -H "Idempotency-Key: tap-$S" -d "$CART,\"coupon_code\":\"WELCOME50\"}" | field .order_id)
echo "{\"order_id\":\"$AGAIN\",\"same_as_first\":$([ "$AGAIN" = "$ORDER" ] && echo true || echo false)}"

step "14. Priya pays on the PaySim checkout page"
PAID=$(curl -s -X POST "$PAYSIM/checkout/$GORDER/pay?format=json")
echo "$PAID"
PAY_ID=$(echo "$PAID" | field .razorpay_payment_id)
SIG=$(echo "$PAID" | field .razorpay_signature)

step "15. Someone sends a made-up payment id with the same signature"
call -X POST "$API/payments/verify" -H "$J" -H "Authorization: Bearer $PRIYA" \
  -d "{\"razorpay_order_id\":\"$GORDER\",\"razorpay_payment_id\":\"pay_FAKE\",\"razorpay_signature\":\"$SIG\"}"

step "16. The app verifies the real signature (the webhook may already have marked it paid)"
call -X POST "$API/payments/verify" -H "$J" -H "Authorization: Bearer $PRIYA" \
  -d "{\"razorpay_order_id\":\"$GORDER\",\"razorpay_payment_id\":\"$PAY_ID\",\"razorpay_signature\":\"$SIG\"}"

step "17. Someone else's eyes on the order: Ravi is not assigned yet"
call "$API/orders/$ORDER" -H "Authorization: Bearer $RAVI"

step "18–19. Priya tries to accept her own order; Asha jumps straight to ready"
status() { call -X POST "$API/orders/$ORDER/status" -H "$J" -H "Authorization: Bearer $1" -d "{\"status\":\"$2\"}"; }
status "$PRIYA" accepted
status "$ASHA" ready

step "20. Accept, then preparing"
status "$ASHA" accepted
status "$ASHA" preparing

step "21. Ravi comes online 400 m from the restaurant, then the food is ready"
call -X POST "$API/riders/me/location" -H "$J" -H "Authorization: Bearer $RAVI" -d '{"latitude":23.6730,"longitude":86.1512,"available":true}'
status "$ASHA" ready

step "22. Ravi picks it up and moves; Priya tracks him"
status "$RAVI" picked_up
curl -s -o /dev/null -X POST "$API/riders/me/location" -H "$J" -H "Authorization: Bearer $RAVI" -d '{"latitude":23.69,"longitude":86.1511,"available":false}'
curl -s "$API/orders/$ORDER" -H "Authorization: Bearer $PRIYA" | field '.rider'

step "23. Delivered: the full timeline"
status "$RAVI" delivered
curl -s "$API/orders/$ORDER" -H "Authorization: Bearer $PRIYA" | field '.timeline.map(e=>e.status)'

step "24. WELCOME50 a second time"
call -X POST "$API/orders/quote" -H "$J" -H "Authorization: Bearer $PRIYA" -d "$CART,\"coupon_code\":\"WELCOME50\"}"

step "25. A second order is paid, then cancelled: the money goes back"
O2=$(curl -s -X POST "$API/orders" -H "$J" -H "Authorization: Bearer $PRIYA" -d "$CART}")
O2_ID=$(echo "$O2" | field .order_id); G2=$(echo "$O2" | field .payment.gateway_order_id)
P2=$(curl -s -X POST "$PAYSIM/checkout/$G2/pay?format=json")
curl -s -o /dev/null -X POST "$API/payments/verify" -H "$J" -H "Authorization: Bearer $PRIYA" -d "$P2"
call -X POST "$API/orders/$O2_ID/cancel" -H "Authorization: Bearer $PRIYA"
call -X POST "$API/orders/$ORDER/cancel" -H "Authorization: Bearer $PRIYA"

step "26. The gateway is down: the order fails cleanly with 503"
mode down
call -X POST "$API/orders" -H "$J" -H "Authorization: Bearer $PRIYA" -d "$CART}"

step "27. The gateway is slow: a 5 s timeout and one retry, then 503 (~10 s, not forever)"
mode slow
START=$(date +%s.%N)
call -X POST "$API/orders" -H "$J" -H "Authorization: Bearer $PRIYA" -d "$CART}"
echo "took $(node -e "console.log(($(date +%s.%N)-$START).toFixed(2))") s"
mode normal

step "28. The gateway sends the same webhook twice: the order is paid once"
mode duplicate_webhooks
O3=$(curl -s -X POST "$API/orders" -H "$J" -H "Authorization: Bearer $PRIYA" -d "$CART}")
O3_ID=$(echo "$O3" | field .order_id); G3=$(echo "$O3" | field .payment.gateway_order_id)
curl -s -o /dev/null -X POST "$PAYSIM/checkout/$G3/pay?format=json"
sleep 1.5
mode normal
curl -s "$API/orders/$O3_ID" -H "Authorization: Bearer $PRIYA" | field '.timeline.map(e=>e.status)'

step "29. A forged webhook"
call -X POST "$API/webhooks/payments" -H "$J" -H "X-Razorpay-Signature: deadbeef" \
  -d '{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_x","order_id":"order_x","amount":100,"status":"captured"}}}}'

step "30. Health"
call "$API/health"
