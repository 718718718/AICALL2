#!/bin/bash

echo "📧 MailHog セットアップスクリプト"
echo "================================="

# MailHogをダウンロード・インストール
echo "MailHogをダウンロードしています..."

# Linux用MailHogをダウンロード
wget -O mailhog https://github.com/mailhog/MailHog/releases/download/v1.0.1/MailHog_linux_amd64

# 実行権限を付与
chmod +x mailhog

echo "✅ MailHogのダウンロード完了"
echo ""
echo "使用方法:"
echo "1. MailHogを起動: ./mailhog"
echo "2. ブラウザで http://localhost:8025 にアクセス"
echo "3. アプリケーションのSMTP設定:"
echo "   - SMTP_HOST=localhost"
echo "   - SMTP_PORT=1025"
echo "   - 認証なし"
echo ""
echo "MailHogを起動しますか？ (y/n)"