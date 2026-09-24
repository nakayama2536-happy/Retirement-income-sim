export const RULES = {
  asOf: '2026-09-24',
  pension: {
    title: '公的年金',
    summary: '原則65歳。現行制度では60〜64歳の繰上げ、66〜75歳の繰下げを選択できます。繰下げは1か月0.7%増が基本です。個人別の生年月日と受給開始月で管理します。',
    source: '日本年金機構',
    url: 'https://www.nenkin.go.jp/service/jukyu/seido/roureinenkin/kuriage-kurisage/20140421-02.html'
  },
  nisa: {
    title: 'NISA',
    summary: '年間投資枠は、つみたて投資枠120万円・成長投資枠240万円。非課税保有限度額は合計1,800万円（成長投資枠は内数1,200万円）。売却した商品の簿価分は翌年以降に再利用できます。',
    source: '金融庁',
    url: 'https://www.fsa.go.jp/policy/nisa2/know/'
  },
  ideco: {
    title: 'iDeCo / DC',
    summary: '老齢給付金は一時金・年金・併用が可能です（併用条件は運営管理機関による）。DC一時金は退職所得で、DC一時金を受ける年の前年以前19年内に退職手当等がある場合、勤続期間等の重複により退職所得控除が調整されることがあります。',
    source: '国税庁・国民年金基金連合会',
    url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2732.htm'
  },
  retirement: {
    title: '退職金',
    summary: '退職所得控除は、勤続20年以下は40万円×勤続年数（最低80万円）、20年超は800万円＋70万円×（勤続年数−20年）。退職所得の受給に関する申告書を提出する前提で試算します。',
    source: '国税庁',
    url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1420.htm'
  },
  unemployment: {
    title: '雇用保険',
    summary: '2026年制度では、65歳未満の一般離職者で被保険者期間20年以上なら基本手当150日が基本。65歳以上の高年齢被保険者は、被保険者期間1年以上なら高年齢求職者給付金50日分です。基本手当日額の計算区分も異なるため、65歳前後を別計算し、退職直前に最新制度で再確認します。',
    source: 'ハローワーク・厚生労働省',
    url: 'https://www.hellowork.mhlw.go.jp/insurance/insurance_basicbenefit.html'
  },
  taxSocial: {
    title: '税・社会保険',
    summary: '所得税・住民税・健康保険・介護保険は所得、年齢、居住自治体、制度年度で変わります。年代別年間予算には税・社会保険を含め、詳細試算は内訳・手取り確認に使い、別加算しません。',
    source: '国税庁・福山市',
    url: 'https://www.city.fukuyama.hiroshima.jp/soumu/reiki_int/reiki_honbun/m308RG00000472.html'
  }
};
