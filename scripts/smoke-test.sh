#!/usr/bin/env bash
# End-to-end smoke test for the VoiceFlow backend.
# Assumes server is running on :4000 with a fresh DB or unique email.
set -euo pipefail

BASE=${BASE:-http://localhost:4000}
EMAIL="smoke-$(date +%s)@example.com"
PASS="password123"

j() { python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('$1',''))"; }

step() { printf '\n\033[36m== %s ==\033[0m\n' "$1"; }

step "health"
curl -fs "$BASE/health" | python3 -m json.tool

step "signup ($EMAIL)"
RES=$(curl -fs -X POST "$BASE/auth/signup" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"displayName\":\"Smoke\"}")
echo "$RES" | python3 -m json.tool
TOKEN=$(echo "$RES" | j token)
RT=$(echo "$RES" | j refreshToken)

step "me"
curl -fs "$BASE/auth/me" -H "authorization: Bearer $TOKEN" | python3 -m json.tool

step "push (vocab + snippet + dictation)"
PUSH_RES=$(curl -fs -X POST "$BASE/sync/push" -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN" \
  -d '{
    "vocab":[{"term":"VoiceFlow","weight":2}],
    "snippets":[{"trigger":";gm","expansion":"good morning"}],
    "dictations":[{"rawText":"hello world from smoke test","durationMs":1500}]
  }')
echo "$PUSH_RES" | python3 -m json.tool

step "pull (verify)"
PULL=$(curl -fs "$BASE/sync/pull" -H "authorization: Bearer $TOKEN")
echo "$PULL" | python3 -m json.tool
DICT_ID=$(echo "$PULL" | python3 -c "import sys, json; print(json.load(sys.stdin)['dictations'][0]['id'])")
VOCAB_ID=$(echo "$PULL" | python3 -c "import sys, json; print(json.load(sys.stdin)['vocab'][0]['id'])")

step "PATCH /sync/settings → tone=email"
curl -fs -X PATCH "$BASE/sync/settings" -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN" -d '{"defaultTone":"email","cleanupEnabled":true}' \
  | python3 -m json.tool

step "POST /uploads/audio-url for dictation $DICT_ID"
UP=$(curl -fs -X POST "$BASE/uploads/audio-url" -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN" \
  -d "{\"dictationId\":\"$DICT_ID\",\"contentType\":\"audio/wav\"}")
echo "$UP" | python3 -m json.tool
URL=$(echo "$UP" | j url)

step "PUT a tiny dummy WAV to the presigned URL"
printf 'RIFF....WAVE' > /tmp/voiceflow_smoke.wav
curl -fs -X PUT "$URL" -H 'content-type: audio/wav' --data-binary @/tmp/voiceflow_smoke.wav -o /dev/null -w 'upload status: %{http_code}\n'

step "GET signed download URL → fetch and verify byte count"
DL=$(curl -fs "$BASE/uploads/audio-url/$DICT_ID" -H "authorization: Bearer $TOKEN")
echo "$DL" | python3 -m json.tool
DLURL=$(echo "$DL" | j url)
curl -fs "$DLURL" -o /tmp/voiceflow_smoke_back.wav
echo "downloaded: $(wc -c < /tmp/voiceflow_smoke_back.wav) bytes (expected 12)"

step "DELETE vocab $VOCAB_ID"
curl -fs -X DELETE "$BASE/sync/vocab/$VOCAB_ID" -H "authorization: Bearer $TOKEN" \
  | python3 -m json.tool

step "Refresh token → new access + new refresh"
REF=$(curl -fs -X POST "$BASE/auth/refresh" -H 'content-type: application/json' \
  -d "{\"refreshToken\":\"$RT\"}")
echo "$REF" | python3 -m json.tool
NEW_TOKEN=$(echo "$REF" | j token)
NEW_RT=$(echo "$REF" | j refreshToken)
test "$NEW_TOKEN" != "$TOKEN" && echo "✓ access token rotated"
test "$NEW_RT"    != "$RT"    && echo "✓ refresh token rotated"

step "Old refresh should now be invalid"
HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/auth/refresh" \
  -H 'content-type: application/json' -d "{\"refreshToken\":\"$RT\"}")
echo "old refresh HTTP $HTTP (expected 401)"

step "Logout"
curl -fs -X POST "$BASE/auth/logout" -H 'content-type: application/json' \
  -H "authorization: Bearer $NEW_TOKEN" -d "{\"refreshToken\":\"$NEW_RT\"}" \
  -o /dev/null -w 'logout status: %{http_code}\n'

step "After logout, refresh should fail"
HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/auth/refresh" \
  -H 'content-type: application/json' -d "{\"refreshToken\":\"$NEW_RT\"}")
echo "post-logout refresh HTTP $HTTP (expected 401)"

printf '\n\033[32mAll smoke tests passed.\033[0m\n'
