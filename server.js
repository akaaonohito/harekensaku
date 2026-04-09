// Express と 必要なライブラリをインポート
const express = require('express');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
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

    // Webページの内容を Puppeteer で取得
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ja-JP,ja;q=0.9'
    });
    await page.goto(searchUrl, {
      waitUntil: ['domcontentloaded', 'networkidle2'],
      timeout: 20000
    });

    // 必要ならJSで生成された要素を待機
    try {
      await page.waitForSelector('a.itemName', { timeout: 5000 });
    } catch (err) {
      // a.itemNameがない場合でも続行
    }

    const pageHtml = await page.content();
    await browser.close();

    // デバッグ：取得したHTMLの最初の部分を出力
    console.log('===== 取得HTML（最初2000文字）=====');
    console.log(pageHtml.substring(0, 2000));
    console.log('===== ここまで =====');

    // レスポンスボディをHTMLとして解析
    const $ = cheerio.load(pageHtml);

    // 候補カード一覧を格納する配列
    const cards = [];

    // 晴れる屋の実際の HTML 構造に合わせてスクレイピング
    // カード名：<a class="itemName">
    // 価格：<p class="itemDetail__price">
    
    // すべてのカード名リンクを取得
    const cardLinks = $('a.itemName');
    console.log(`a.itemName 見つかった件数: ${cardLinks.length}件`);

    // デバッグ：存在する a タグを調査
    if (cardLinks.length === 0) {
      console.log('【デバッグ】a.itemName が見つかりません。別のセレクタを確認します...');
      const allLinks = $('a');
      console.log(`全 a タグ数: ${allLinks.length}件`);
      const itemNameDivs = $('[class*="itemName"]');
      console.log(`itemName を含む要素: ${itemNameDivs.length}件`);
      const items = $('[class*="item"]');
      console.log(`item を含む要素: ${items.length}件（最初5個）`);
      for (let i = 0; i < Math.min(5, items.length); i++) {
        console.log(`  - ${$(items[i]).attr('class')}`);
      }
    }

    // 各カード情報を抽出
    cardLinks.each((index, element) => {
      try {
        // 限定: 取得件数が多すぎないよう、最大20件まで
        if (cards.length >= 20) {
          return false;
        }

        const $link = $(element);

        // カード名を取得
        const cardName = $link.text().trim();

        // URL を取得
        let productUrl = ($link.attr('href') || '').replace(/\s+/g, '').trim();
        if (productUrl && !productUrl.startsWith('http')) {
          productUrl = 'https://www.hareruyamtg.com' + (productUrl.startsWith('/') ? '' : '/') + productUrl;
        }

        // 価格を取得
        // 方法1: 親要素から <p class="itemDetail__price"> を探す
        let price = '';
        const $parent = $link.closest('div');
        if ($parent.length > 0) {
          const priceElement = $parent.find('p.itemDetail__price');
          if (priceElement.length > 0) {
            const priceText = priceElement.text().trim();
            // "¥ 1,500" から "1,500" を抽出
            const match = priceText.match(/¥[\s]?([0-9,]+)/);
            if (match) {
              price = match[1];
            } else {
              price = priceText;
            }
          }
        }

        // 方法2: 価格が見つからなければ、テキストから正規表現で抽出
        if (!price) {
          const textContent = $link.text();
          const pricePatterns = [
            /¥[\s]?([0-9,]+)/,
            /￥[\s]?([0-9,]+)/,
            /([0-9,]+)\s*円/
          ];
          for (const pattern of pricePatterns) {
            const match = textContent.match(pattern);
            if (match) {
              price = match[1];
              break;
            }
          }
        }

        // 取得したデータが有効か確認
        if (cardName && cardName.length > 0) {
          cards.push({
            name: cardName,
            price: price || '価格情報取得中',
            url: productUrl
          });
          console.log(`取得 [${cards.length}] ${cardName.substring(0, 50)}`);
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
