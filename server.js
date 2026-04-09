// Express と 必要なライブラリをインポート
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

// Express アプリケーション初期化
const app = express();
const PORT = 3000;

// 静的ファイル（HTML/CSS/JS）のサービス
app.use(express.static(path.join(__dirname, 'public')));

// JSON形式のリクエストボディを受け入れる設定
app.use(express.json());

// =====================================
// スクレイピング処理：晴れる屋の検索ページから
// カード候補一覧を取得する関数
// =====================================
async function searchHareruyaMTG(searchWord) {
  try {
    // 検索ワードをURL形式にエンコード
    // 晴れる屋の検索URL形式に合わせて検索
    const searchUrl = `https://www.hareruyamtg.com/ja/products/search?suggest_type=all&product=${encodeURIComponent(searchWord)}&category=`;

    console.log(`検索中: ${searchUrl}`);

    // Webページの内容を取得
    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });

    // レスポンスボディをHTMLとして解析
    const $ = cheerio.load(response.data);

    // 候補カード一覧を格納する配列
    const cards = [];

    // 晴れる屋のページ構造に合わせて、カード情報を抽出
    // NOTE: 晴れる屋のサイト構造変更に対応しやすくするため、
    // スクレイピングロジックは分離している
    
    // 商品行を検索
    // 一般的な商品リスト構造: <div class="product-item"> や <li class="product"> 等
    // サイト構造の変更に強くするため、複数のセレクタを試行
    const productSelectors = [
      'div.product-item',
      'li.product-item',
      'div[data-product-id]',
      'a.product-name'
    ];

    let products = $();
    for (const selector of productSelectors) {
      products = $(selector);
      if (products.length > 0) {
        console.log(`マッチしたセレクタ: ${selector} (${products.length}件)`);
        break;
      }
    }

    // 最初の候補から取得した情報が０件の場合は、
    // 別の方法で商品を探す
    if (products.length === 0) {
      // テーブル行から検索
      products = $('table tr').slice(1);
      console.log(`テーブルから検索: ${products.length}件`);
    }

    // 各商品から情報を抽出
    products.each((index, element) => {
      try {
        // 限定: 取得件数が多すぎないよう、最大20件まで
        if (cards.length >= 20) {
          return false; // ループ終了
        }

        const $product = $(element);

        // カード名を取得
        // 複数のセレクタパターンを試す
        let cardName = '';
        const nameSelectors = [
          'a.product-name',
          'span.product-name',
          'a[href*="/products/"]',
          'div h2'
        ];

        for (const selector of nameSelectors) {
          const name = $product.find(selector).first().text().trim();
          if (name && name.length > 0) {
            cardName = name;
            break;
          }
        }

        // URL を取得（商品へのリンク）
        let productUrl = '';
        const linkElement = $product.find('a').first();
        if (linkElement.length > 0) {
          let url = linkElement.attr('href');
          if (url) {
            // 相対URLを絶対URLに変換
            if (!url.startsWith('http')) {
              url = 'https://www.hareruyamtg.com' + (url.startsWith('/') ? '' : '/') + url;
            }
            productUrl = url;
          }
        }

        // 価格を取得
        // 複数のパターンを試す
        let price = '';
        const pricePatterns = [
          /¥[\s]?([0-9,]+)/,
          /￥[\s]?([0-9,]+)/,
          /([0-9,]+)\s*円/
        ];

        const priceText = $product.text();
        for (const pattern of pricePatterns) {
          const match = priceText.match(pattern);
          if (match) {
            price = match[1];
            break;
          }
        }

        // 取得したデータが有効か確認
        if (cardName && cardName.length > 0) {
          cards.push({
            name: cardName,
            price: price || '価格情報取得中',
            url: productUrl,
            // 元のHTML要素テキスト（デバッグ用）
            rawText: $product.text().substring(0, 100)
          });
        }
      } catch (err) {
        console.log(`要素解析エラー: ${err.message}`);
      }
    });

    console.log(`取得完了: ${cards.length}件のカードが見つかりました`);
    return cards;

  } catch (error) {
    // エラーハンドリング
    console.error(`スクレイピングエラー: ${error.message}`);
    throw new Error(`検索結果の取得に失敗しました: ${error.message}`);
  }
}

// =====================================
// API エンドポイント：検索リクエストを受け取り、
// 結果をJSON形式で返す
// =====================================
app.post('/api/search', async (req, res) => {
  try {
    // フロントエンドから検索ワードを取得
    const { searchWord } = req.body;

    // バリデーション：検索ワードが空でないか確認
    if (!searchWord || searchWord.trim() === '') {
      return res.status(400).json({
        success: false,
        error: '検索ワードが入力されていません'
      });
    }

    // スクレイピング処理を実行
    const results = await searchHareruyaMTG(searchWord);

    // 結果がない場合のハンドリング
    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        error: '検索結果が見つかりませんでした'
      });
    }

    // 成功時の応答
    res.json({
      success: true,
      count: results.length,
      data: results
    });

  } catch (error) {
    // エラー時の応答
    console.error(`API エラー: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message || '検索処理中にエラーが発生しました'
    });
  }
});

// =====================================
// サーバー起動
// =====================================
app.listen(PORT, () => {
  console.log(`サーバーが起動しました`);
  console.log(`ブラウザで http://localhost:${PORT} にアクセスしてください`);
});
