// =====================================
// グローバル変数：検索結果を格納
// =====================================
let currentSearchResults = [];

// =====================================
// ユーティリティ関数
// =====================================

/**
 * 要素を表示・非表示にする関数
 * @param {string} elementId - 要素のID
 * @param {boolean} visible - 表示するかどうか
 */
function setElementVisibility(elementId, visible) {
    const element = document.getElementById(elementId);
    if (element) {
        if (visible) {
            element.classList.remove('hidden');
        } else {
            element.classList.add('hidden');
        }
    }
}

/**
 * メッセージを表示する関数
 * @param {string} type - 'loading' または 'error'
 * @param {string} message - 表示メッセージ
 */
function showMessage(type, message) {
    const loadingElement = document.getElementById('loadingMessage');
    const errorElement = document.getElementById('errorMessage');

    // 全メッセージを非表示にする
    setElementVisibility('loadingMessage', false);
    setElementVisibility('errorMessage', false);

    // 指定されたメッセージを表示
    if (type === 'loading') {
        setElementVisibility('loadingMessage', true);
    } else if (type === 'error') {
        errorElement.textContent = message;
        setElementVisibility('errorMessage', true);
    }
}

/**
 * メッセージをクリアする関数
 */
function clearMessages() {
    setElementVisibility('loadingMessage', false);
    setElementVisibility('errorMessage', false);
}

// =====================================
// イベントハンドラ関数
// =====================================

/**
 * 検索ボタン押下時の処理
 */
async function handleSearch() {
    // 検索ワードを取得
    const searchInput = document.getElementById('searchInput');
    const searchWord = searchInput.value.trim();

    // バリデーション：検索ワードが空でないか確認
    if (searchWord === '') {
        showMessage('error', '検索ワードを入力してください');
        return;
    }

    // 読み込み中メッセージを表示
    showMessage('loading', '検索中...');

    try {
        // サーバーへ検索リクエストを送信
        const response = await fetch('/api/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ searchWord: searchWord })
        });

        // レスポンスをJSON形式で取得
        const data = await response.json();

        // エラーハンドリング
        if (!response.ok || !data.success) {
            showMessage('error', data.error || '検索に失敗しました');
            // プルダウンをクリア
            clearCardSelect();
            return;
        }

        // 検索結果をグローバル変数に格納
        currentSearchResults = data.data;

        // プルダウンに検索結果を反映
        populateCardSelect(currentSearchResults);

        // メッセージをクリア
        clearMessages();

    } catch (error) {
        // 通信エラー時の処理
        console.error('エラー:', error);
        showMessage('error', `通信エラー: ${error.message}`);
        clearCardSelect();
    }
}

/**
 * 検索入力フィールドでエンターキーが押された時の処理
 * @param {Event} event - キーボードイベント
 */
function handleSearchKeyPress(event) {
    // Enterキーでも検索できるようにする
    if (event.key === 'Enter') {
        handleSearch();
    }
}

/**
 * プルダウンに検索結果を反映する関数
 * @param {Array} cards - 検索結果のカード配列
 */
function populateCardSelect(cards) {
    const cardSelect = document.getElementById('cardSelect');

    // 既存のオプションをクリア（デフォルトオプションを残す）
    // オプションを1つだけ残す
    while (cardSelect.options.length > 1) {
        cardSelect.remove(1);
    }

    // 検索結果の各カードをオプションに追加
    cards.forEach((card, index) => {
        const option = document.createElement('option');
        // value属性には、結果配列のインデックスを格納
        option.value = index;
        // テキストにはカード名を表示
        option.textContent = card.name;
        cardSelect.appendChild(option);
    });

    // ページをリセット：選択結果をリセットする
    resetResult();
}

/**
 * プルダウンをクリアする関数
 */
function clearCardSelect() {
    const cardSelect = document.getElementById('cardSelect');
    currentSearchResults = [];

    // オプションを1つだけレセット（デフォルトオプションのみ）
    cardSelect.value = '';
    while (cardSelect.options.length > 1) {
        cardSelect.remove(1);
    }

    // 選択結果をリセット
    resetResult();
}

/**
 * 決定ボタン押下時の処理
 */
function handleDecision() {
    const cardSelect = document.getElementById('cardSelect');
    const selectedIndex = cardSelect.value;

    // バリデーション：プルダウンが選択されているか確認
    if (selectedIndex === '') {
        showMessage('error', 'カードを選択してください');
        return;
    }

    // 選択されたカードの情報を取得
    const selectedCard = currentSearchResults[selectedIndex];

    if (!selectedCard) {
        showMessage('error', 'カード情報が取得できません');
        return;
    }

    // 選択されたカードの情報を画面に表示
    displayCardResult(selectedCard);

    // メッセージをクリア
    clearMessages();
}

/**
 * 選択されたカードの情報を画面に表示する関数
 * @param {Object} card - カード情報オブジェクト
 */
function displayCardResult(card) {
    // カード名を表示
    const cardNameElement = document.getElementById('resultCardName');
    cardNameElement.textContent = card.name;

    // 価格を表示
    // 価格が取得できている場合は「¥」を付与
    const priceElement = document.getElementById('resultPrice');
    if (card.price && card.price !== '価格情報取得中') {
        priceElement.textContent = '¥ ' + card.price;
    } else {
        priceElement.textContent = '価格情報が取得できませんでした';
    }
}

/**
 * 選択結果をリセットする関数
 */
function resetResult() {
    const cardNameElement = document.getElementById('resultCardName');
    const priceElement = document.getElementById('resultPrice');

    cardNameElement.textContent = '選択されていません';
    priceElement.textContent = '価格情報なし';
}

// =====================================
// ページ読み込み時の初期化処理
// =====================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('ページが読み込まれました');

    // 初期状態として、プルダウンと結果をリセット
    resetResult();
    clearMessages();

    // 検索入力フィールドに フォーカスを当てる
    document.getElementById('searchInput').focus();
});
