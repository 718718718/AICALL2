const mongoose = require('mongoose');
require('dotenv').config();

// User モデルをインポート
const User = require('../models/User');

async function deleteUser() {
  try {
    // MongoDB接続
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('MongoDB接続完了');
    
    const email = 'sekizawa1129@gmail.com';
    console.log(`削除対象ユーザー: ${email}`);
    
    // ユーザーを検索
    const user = await User.findOne({ email: email });
    if (!user) {
      console.log('ユーザーが見つかりません');
      process.exit(0);
    }
    
    console.log('削除前のユーザー情報:');
    console.log(`- ID: ${user._id}`);
    console.log(`- 氏名: ${user.firstName} ${user.lastName}`);
    console.log(`- 企業ID: ${user.companyId}`);
    console.log(`- 企業名: ${user.companyName}`);
    console.log(`- 作成日: ${user.createdAt}`);
    
    // ユーザーを削除
    await User.deleteOne({ email: email });
    console.log('\n✅ ユーザーが正常に削除されました');
    
    // 削除後の確認
    const deletedUser = await User.findOne({ email: email });
    if (!deletedUser) {
      console.log('✅ 削除確認完了: ユーザーが存在しません');
    } else {
      console.log('❌ エラー: ユーザーがまだ存在しています');
    }
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    // MongoDB接続を閉じる
    await mongoose.disconnect();
    console.log('MongoDB接続を閉じました');
    process.exit(0);
  }
}

deleteUser();