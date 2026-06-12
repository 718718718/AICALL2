const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

// 音声キャッシュを配信
router.get('/cache/:filename', (req, res) => {
  const { filename } = req.params;
  
  // セキュリティ: ファイル名の検証
  if (!/^[a-f0-9]{32}\.(mp3|wav)$/.test(filename)) {
    return res.status(400).send('Invalid filename');
  }
  
  const filePath = path.join(__dirname, '../cache/audio', filename);
  
  // ファイルの存在確認
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).send('File not found');
    }
    
    // 音声ファイルを配信
    const contentType = filename.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 1時間キャッシュ
    
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

module.exports = router;