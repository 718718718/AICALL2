CoeFont Logo
Search...
認証方式
Text2speech
Dict
Coefont
get
GET /coefonts/pro
Documentation Powered by ReDoc
CoeFont API (2.0.3)
Download OpenAPI specification:Download

Terms of Service
Japanese / English

API Changelog
CoeFontのREST APIです。
アクセスキー及びアクセスシークレットはアカウント設定 → API情報ページから取得してください。

認証方式
CoefontAPIの利用時にはHMAC-SHA256を用いて署名する必要があります。
以下の仕様に基づいて適切にヘッダーを設定してください。

ヘッダー	詳細
X-Coefont-Date	UNIX時間 (UTC)
X-Coefont-Content	アクセスシークレットを用いて以下のデータをHMAC-SHA256でハッシュ化した結果をhex形式で表した文字列
- UNIX時間(UTC)
- リクエストボディ
Authorization	アクセスキー
Content-Type	application/json
ハッシュ化について
データのハッシュ化については次のようなフローで行います。

リクエストボディをjson形式にエンコードする。
UNIX時間(UTC)とjsonエンコードされたリクエストボディをこの順で結合する。
以上のデータをアクセスシークレットを用いてHMAC-SHA256でハッシュ化する。
リクエストボディが存在しない場合は現在時刻のみをハッシュ化します。
pythonでの実装例(/text2speech)
  import hmac
  import requests
  import hashlib
  import json
  from datetime import datetime, timezone

  accesskey = 'QY4Tuiug6XidAKjDS5zTQHGSI'
  access_secret = '62A03zCgPflc3NZwFHliphpKFt4tppOpdmUHgqPR'

  text = 'これはテストです。'
  date: str = str(int(datetime.utcnow().replace(tzinfo=timezone.utc).timestamp()))
  data: str = json.dumps({
    'coefont': '2b174967-1a8a-42e4-b1ae-5f6548cfa05d',
    'text': text
  })
  signature = hmac.new(bytes(access_secret, 'utf-8'), (date+data).encode('utf-8'), hashlib.sha256).hexdigest()

  response = requests.post('https://api.coefont.cloud/v2/text2speech', data=data, headers={
    'Content-Type': 'application/json',
    'Authorization': accesskey,
    'X-Coefont-Date': date,
    'X-Coefont-Content': signature
  })

  if response.status_code == 200:
    with open('response.wav', 'wb') as f:
      f.write(response.content)
  else:
    print(response.json())
Text2speech
POST /text2speech
テキストを合成音声に変換します。yomiとaccentが両方指定された場合は、その読みアクセントを合成音声に変換します(yomi accentパラメータ対応は日本語CoeFontのみ)。英語CoeFontの場合は英語、中国語CoeFontの場合は中国語のみ読み上げることができます。

header Parameters
Content-Type
required
string
Content-Type

Authorization
required
string
アクセスキー

X-Coefont-Date
required
string
UNIX時間(UTC)

X-Coefont-Content
required
string
アクセスシークレットを用いて署名した文字列

Request Body schema: application/json
Text

coefont
required
string
音声変換を行うcoefontのID。coefont詳細画面のurlに表示される個別のuuidを参照。

text
required
string [ 1 .. 1000 ] characters
音声変換するテキスト

yomi	
string non-empty
読み(ひらがな)

accent	
string non-empty
アクセント。1と2からなる文字列で、1が低い音、2が高い音になる。読み(yomi)の文字1つずつと前方から対応関係にあり、文字列の長さを同じにする必要がある。

speed	
number <float> [ 0.1 .. 10 ]
Default: 1
音声の速度。1.0で通常速度。0.5で半速。2.0で2倍速。

pitch	
number <float> [ -3000 .. 3000 ]
Default: 0
音声のピッチ。±1200で1オクターブ変化。

kuten	
number <float> [ 0 .. 5 ]
Default: 0.5
句点の間隔(秒)

toten	
number <float> [ 0.2 .. 2 ]
読点の間隔(秒)。0.2から2.0の範囲で指定可能です。指定がない場合はモデルごとに自動で推定されます。

volume	
number <float> [ 0.2 .. 2 ]
Default: 1
音量(倍)

format	
string
Enum: "wav" "mp3"
音声ファイルのフォーマット

Responses
302 合成された音声ファイルへリダイレクトされます。リダイレクト先でバイナリ化した音声ファイルが返却されます。リダイレクトURLの期限は7日間です。
400 リクエストの形式が違う、または禁止ワードが含まれています。
401 ヘッダー情報が間違っている，ポイント残高が不足しているなどの理由で認証に失敗しました。
403 コエフォントへのアクセス権が存在しません。
404 指定したコエフォントが存在しません。
429 リクエスト数または文字数の制限を超えています。トライアルユーザーは1分あたり100リクエストまたは5,000文字の制限があります。
500 声の生成に失敗しました。

post
/text2speech
Request samples
PayloadpythonnodejsGo

Copy
const axios = require('axios')
const crypto = require('crypto')
const fs = require('fs')

const accessKey = 'QY4Tuiug6XidAKjDS5zTQHGSI'
const accessSecret = '62A03zCgPflc3NZwFHliphpKFt4tppOpdmUHgqPR'
const text = 'これはテストです。'
const data = JSON.stringify({
  'coefont': '2b174967-1a8a-42e4-b1ae-5f6548cfa05d',
  'text': text
})
const date = String(Math.floor(Date.now() / 1000))
const signature = crypto.createHmac('sha256', accessSecret).update(date+data).digest('hex')

axios.post('https://api.coefont.cloud/v2/text2speech', data, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': accessKey,
      'X-Coefont-Date': date,
      'X-Coefont-Content': signature
    },
    responseType: 'stream'
  })
  .then(response => {
    response.data.pipe(fs.createWriteStream('response.wav'))
  })
  .catch(error => {
    console.log(error)
  })
Response samples
400401403404429500
Content type
application/json

Copy
Expand allCollapse all
{
"message": "error message"
}
Dict
GET /dict
ユーザー辞書の一覧を取得します

query Parameters
category	
string
カテゴリー

header Parameters
Content-Type
required
string
Content-Type

Authorization
required
string
アクセスキー

X-Coefont-Date
required
string
UNIX時間(UTC)

X-Coefont-Content
required
string
アクセスシークレットを用いて署名した文字列

Responses
200 ユーザー辞書の一覧を返します
400 リクエストの形式が違います
401 認証に失敗しました。

get
/dict
Response samples
200400401
Content type
application/json

Copy
Expand allCollapse all
[
{
"text": "ユーザー辞書",
"category": "カテゴリー",
"yomi": "ゆーざーじしょ",
"accent": "1222212"
}
]
PUT /dict
ユーザ辞書のアイテムを追加します。単語とカテゴリーが重複している場合は上書きされます。

header Parameters
Content-Type
required
string
Content-Type

Authorization
required
string
アクセスキー

X-Coefont-Date
required
string
UNIX時間(UTC)

X-Coefont-Content
required
string
アクセスシークレットを用いて署名した文字列

Request Body schema: application/json
ユーザー辞書のアイテム

text
required
string [ 1 .. 100 ] characters
辞書に登録する単語

category
required
string non-empty
カテゴリー

yomi
required
string [ 1 .. 100 ] characters
読み(ひらがな または カタカナ)

accent	
string non-empty
アクセント。1と2からなる文字列で、1が低い音、2が高い音になる。読み(yomi)の文字1つずつと前方から対応関係にあり、文字列の長さは同じになる。

Responses
204 登録に成功しました
400 リクエストの形式が違います
401 認証に失敗しました。
500 Internal Server Error

put
/dict
Request samples
Payload
Content type
application/json

Copy
Expand allCollapse all
{
"text": "ユーザー辞書",
"category": "カテゴリー",
"yomi": "ゆーざーじしょ",
"accent": "1222212"
}
Response samples
400401
Content type
application/json

Copy
Expand allCollapse all
{
"message": "error message"
}
DELETE /dict
ユーザー辞書のアイテムを削除します

header Parameters
Content-Type
required
string
Content-Type

Authorization
required
string
アクセスキー

X-Coefont-Date
required
string
UNIX時間(UTC)

X-Coefont-Content
required
string
アクセスシークレットを用いて署名した文字列

Request Body schema: application/json
辞書の単語とカテゴリーのオブジェクト

Array ()
text
required
string [ 1 .. 100 ] characters
辞書に登録する単語

category
required
string non-empty
カテゴリー

Responses
204 削除に成功しました
400 リクエストの形式が違います
401 認証に失敗しました。
500 Internal Server Error

delete
/dict
Request samples
Payload
Content type
application/json

Copy
Expand allCollapse all
[
{
"text": "ユーザー辞書",
"category": "カテゴリー"
}
]
Response samples
400401
Content type
application/json

Copy
Expand allCollapse all
{
"message": "error message"
}
Coefont
GET /coefonts/pro
Coefont Proとして使用できるCoefontの一覧を返します。

header Parameters
Content-Type
required
string
Content-Type

Authorization
required
string
アクセスキー

X-Coefont-Date
required
string
UNIX時間(UTC)

X-Coefont-Content
required
string
アクセスシークレットを用いて署名した文字列

Responses
200 Coefont Proとして使用できるCoefontの一覧を返します。
Response Schema: application/json
Array ()
coefont
required
string
CoeFontのID

name
required
string
CoeFontの名前

description
required
string
CoeFontの説明

icon
required
string
CoeFontのアイコンの画像URL

sample
required
Array of objects (Sample)
CoeFontのサンプル音声一覧

tags
required
Array of strings
CoeFontのタグ一覧

401 認証に失敗しました。
500 Internal Server Error

get
/coefonts/pro
Request samples
pythonnodejs

Copy
const axios = require('axios')
const crypto = require('crypto')

const accessKey = 'QY4Tuiug6XidAKjDS5zTQHGSI'
const accessSecret = '62A03zCgPflc3NZwFHliphpKFt4tppOpdmUHgqPR'
const date = String(Math.floor(Date.now() / 1000))
const signature = crypto.createHmac('sha256', accessSecret).update(date).digest('hex')

axios.get('https://api.coefont.cloud/v2/coefonts/pro', {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': accessKey,
      'X-Coefont-Date': date,
      'X-Coefont-Content': signature
    }
  })
  .then(response => {
    console.log(response.data)
  })
  .catch(error => {
    console.log(error)
  })
Response samples
200401
Content type
application/json

Copy
Expand allCollapse all
[
{
"coefont": "1f58f1ae-2e9c-443a-9e3c-60d8e5dee3b8",
"name": "アベルーニ",
"description": "あなたに最高のコエをお届けするCoeFont。\\n感情豊かで、落ち着いたコエを持つ。\\n\\n喜: https://coefont.cloud/coefonts/Averuni_happy\\n怒: https://coefont.cloud/coefonts/Averuni_angry\\n哀: https://coefont.cloud/coefonts/Averuni_sorrow\\n楽: https://coefont.cloud/coefonts/Averuni_joy\\n\\nイラスト /  凪白みと\\nYellston: https://www.yellston.com/",
"icon": "https://coefont-cloud-backend-production-public-bucket.s3.ap-northeast-1.amazonaws.com/icon/1f58f1ae-2e9c-443a-9e3c-60d8e5dee3b8.jpeg",
"sample": [],
"tags": []
}
]
