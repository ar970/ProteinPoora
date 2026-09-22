#!/bin/bash
#
# The payment endpoints, checked with nothing but curl.
#
# Everything here runs before any call to api.razorpay.com -- basket
# validation in /api/create-order, and field and signature checks in
# /api/verify-payment -- so the suite passes without network access to
# Razorpay and without spending a test payment.
#
# What it therefore does NOT cover: that Razorpay accepts our key pair, and
# that a real payment verifies end to end. Those need a live call and a card;
# see "Testing" in the README.
#
#   npm run dev            # in one terminal
#   bash scripts/test-payments.sh
#
B=${BASE_URL:-http://127.0.0.1:3000}
pass=0; fail=0
check () { # name, expected_status, actual_status, body
  if [ "$2" = "$3" ]; then echo "  ok   $1 → $3"; pass=$((pass+1));
  else echo "  FAIL $1 → got $3, wanted $2"; echo "       $4"; fail=$((fail+1)); fi
}
call () { # method path json
  curl -s -o /tmp/body.json -w "%{http_code}" -X "$1" "$B$2" \
       -H 'Content-Type: application/json' -d "$3"
}

echo "create-order — validation (runs before any Razorpay call)"
s=$(call POST /api/create-order '{"items":[]}');                                      check "empty basket"        400 "$s" "$(cat /tmp/body.json)"
s=$(call POST /api/create-order '{}');                                                check "no items key"        400 "$s" "$(cat /tmp/body.json)"
s=$(call POST /api/create-order '{"items":[{"slug":"not-a-snack","qty":1}]}');        check "unknown slug"        400 "$s" "$(cat /tmp/body.json)"
s=$(call POST /api/create-order '{"items":[{"slug":"combo-bhujia-duo","qty":0}]}');   check "qty 0"               400 "$s" "$(cat /tmp/body.json)"
s=$(call POST /api/create-order '{"items":[{"slug":"combo-bhujia-duo","qty":21}]}');  check "qty 21"              400 "$s" "$(cat /tmp/body.json)"
s=$(call POST /api/create-order '{"items":[{"slug":"combo-bhujia-duo","qty":1.5}]}'); check "fractional qty"      400 "$s" "$(cat /tmp/body.json)"
s=$(call POST /api/create-order '{"items":[{"slug":"combo-bhujia-duo","qty":11},{"slug":"combo-bhujia-duo","qty":11}]}')
                                                                                  check "split to beat cap"   400 "$s" "$(cat /tmp/body.json)"
s=$(call POST /api/create-order '{"items":[{"slug":"masala-bhujia","qty":1}]}');      check "single pack"         400 "$s" "$(cat /tmp/body.json)"
s=$(call GET /api/create-order '');                                                   check "GET not allowed"     405 "$s" "$(cat /tmp/body.json)"

echo
echo "verify-payment — missing fields and signature (HMAC runs before any fetch)"
s=$(call POST /api/verify-payment '{}');                                              check "no fields"           400 "$s" "$(cat /tmp/body.json)"
s=$(call POST /api/verify-payment '{"razorpay_order_id":"order_x"}');                 check "missing payment id"  400 "$s" "$(cat /tmp/body.json)"
s=$(call POST /api/verify-payment '{"razorpay_order_id":"order_x","razorpay_payment_id":"pay_x","razorpay_signature":"deadbeef"}')
                                                                                  check "bad signature"       400 "$s" "$(cat /tmp/body.json)"
s=$(call GET /api/verify-payment '');                                                 check "GET not allowed"     405 "$s" "$(cat /tmp/body.json)"

echo
echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
