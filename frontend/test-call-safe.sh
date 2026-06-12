#!/bin/bash
# Twilioテスト発信スクリプト（認証情報は環境変数から）

# 使用前に以下を設定してください：
# export TWILIO_ACCOUNT_SID="your_account_sid"
# export TWILIO_AUTH_TOKEN="your_auth_token"

curl -X POST https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Calls.json \
--data-urlencode "Url=${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/voice" \
--data-urlencode "To=+819062660207" \
--data-urlencode "From=+16076956082" \
-u $TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN