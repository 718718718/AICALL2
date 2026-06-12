#!/bin/bash

# Test handoff API endpoint
echo "Testing handoff API endpoint..."

# Test with dev token
curl -X POST http://localhost:5001/api/calls/handoff-by-phone \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-user-test" \
  -d '{
    "phoneNumber": "09062660207",
    "callSid": "test-call-sid"
  }' \
  -v

echo ""
echo "Test completed"