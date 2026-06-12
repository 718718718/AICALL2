/**
 * testlin@testing.com を「電話発信可能」な状態にする統合スクリプト
 *
 * 実行内容:
 *   1. admin@example.com のパスワードを 'admin123' にリセット
 *   2. testlin の AgentSettings を作成（既存ユーザーから設定をコピー）
 *   3. 空いている PhonePool 番号を testlin にアサイン（あれば）
 *   4. 全状態を検証
 */
require('dotenv').config({ path: __dirname + '/.env.local' });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const AgentSettings = require('./models/AgentSettings');
const PhonePool = require('./models/PhonePool');

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected\n');

    // ====== Step 1: admin@example.com パスワード再設定 ======
    console.log('=== Step 1: admin@example.com のパスワードリセット ===');
    const adminDefault = await User.findOne({ email: 'admin@example.com' });
    if (adminDefault) {
      adminDefault.password = 'admin123';
      await adminDefault.save();
      const verify1 = await User.findOne({ email: 'admin@example.com' }).select('+password');
      const valid1 = await bcrypt.compare('admin123', verify1.password);
      console.log('  admin@example.com → password: admin123', valid1 ? '✅' : '❌');
    } else {
      console.log('  ⚠ admin@example.com が見つかりません');
    }

    // ====== Step 2: testlin のユーザー情報取得 ======
    console.log('\n=== Step 2: testlin の情報確認 ===');
    const testlin = await User.findOne({ email: 'testlin@testing.com' });
    if (!testlin) {
      console.log('❌ testlin@testing.com が見つかりません。create-test-admin.js を先に実行してください');
      process.exit(1);
    }
    console.log('  testlin._id     :', testlin._id);
    console.log('  testlin.role    :', testlin.role);
    console.log('  testlin.company :', testlin.companyId);

    // ====== Step 3: testlin の AgentSettings 作成 ======
    console.log('\n=== Step 3: AgentSettings の作成 ===');
    let testlinSettings = await AgentSettings.findOne({ userId: testlin._id });

    if (testlinSettings) {
      console.log('  ✅ AgentSettings 既に存在');
    } else {
      // 既存ユーザーの設定をテンプレートとして使う
      const templateSettings = await AgentSettings.findOne({}).lean();

      if (templateSettings) {
        console.log('  📋 既存ユーザーの設定をテンプレートとして使用');
        delete templateSettings._id;
        delete templateSettings.__v;
        templateSettings.userId = testlin._id;

        testlinSettings = await AgentSettings.create(templateSettings);
        console.log('  ✅ AgentSettings 作成完了 (id:', testlinSettings._id, ')');
      } else {
        // テンプレートもない場合は最小構成で作成
        console.log('  📋 既存テンプレートなし → 最小構成で作成');
        testlinSettings = await AgentSettings.create({
          userId: testlin._id,
          phoneNumber: process.env.TWILIO_PHONE_NUMBER_DEV || process.env.TWILIO_PHONE_NUMBER,
          isAvailable: true,
          conversationSettings: {
            companyName: 'テスト株式会社',
            serviceName: 'AI通話テスト',
            representativeName: 'テスト 林',
            targetDepartment: '営業部',
            salesPitch: {
              companyDescription: 'AI通話のテストを行っている会社です。',
              callToAction: 'お時間少々頂戴できますでしょうか。'
            }
          }
        });
        console.log('  ✅ AgentSettings 作成完了 (最小構成)');
      }
    }

    // ====== Step 4: PhonePool アサインを試みる ======
    console.log('\n=== Step 4: PhonePool 番号アサイン ===');
    const existingAssignment = await PhonePool.findOne({ 'assignedTo.userId': testlin._id });

    if (existingAssignment) {
      console.log('  ✅ 既にアサイン済み:', existingAssignment.phoneNumber);
    } else {
      // 未使用の番号を探す
      const availableNumber = await PhonePool.findOne({
        $or: [
          { assignedTo: { $exists: false } },
          { assignedTo: null },
          { 'assignedTo.userId': null }
        ]
      });

      if (availableNumber) {
        availableNumber.assignedTo = {
          userId: testlin._id,
          companyId: testlin.companyId,
          assignedAt: new Date()
        };
        await availableNumber.save();
        console.log('  ✅ 番号アサイン完了:', availableNumber.phoneNumber);
      } else {
        const totalPhones = await PhonePool.countDocuments();
        console.log(`  ⚠ 利用可能な PhonePool 番号がありません (合計 ${totalPhones} 件、全て使用中)`);
        console.log('  ℹ 発信時は env の TWILIO_PHONE_NUMBER がフォールバックとして使われます');
      }
    }

    // ====== 最終検証 ======
    console.log('\n=== 最終状態確認 ===');
    const finalSettings = await AgentSettings.findOne({ userId: testlin._id });
    const finalPhone = await PhonePool.findOne({ 'assignedTo.userId': testlin._id });

    console.log('  AgentSettings: ', finalSettings ? '✅ あり' : '❌ なし');
    console.log('  PhonePool番号: ', finalPhone ? `✅ ${finalPhone.phoneNumber}` : `⚠ なし (env fallback: ${process.env.TWILIO_PHONE_NUMBER_DEV || process.env.TWILIO_PHONE_NUMBER})`);

    console.log('\n========================================');
    console.log('✅ セットアップ完了');
    console.log('========================================');
    console.log('テストログイン:');
    console.log('  Email   : testlin@testing.com');
    console.log('  Password: TestLin2026!');
    console.log('========================================');

    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

run();
