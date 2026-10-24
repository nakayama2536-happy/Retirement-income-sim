// Optional retirement planning text. No calculations, storage, or network I/O.
export const RETIREMENT_COMMENT_LIMIT = 2000;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function commentText(value) {
  if (typeof value !== 'string') throw new TypeError('構想コメントは文字列で入力してください。');
  if (value.length > RETIREMENT_COMMENT_LIMIT) {
    throw new RangeError('構想コメントは2,000文字以内で入力してください。内容を切り捨てず、反映を停止しました。');
  }
  return value; // Preserve newlines and spaces; never turn prose into calculation settings.
}

export function withRetirementConceptComment(retirement, draft) {
  if (!isRecord(retirement) || !isRecord(draft)) throw new TypeError('退職金設定と入力内容を確認してください。');
  const result = {...retirement};
  // An old form or caller without the new field must not delete a saved comment.
  if (!own(draft, 'conceptComment')) return result;
  const value = commentText(draft.conceptComment);
  // Avoid adding an empty field to an unchanged legacy plan.
  if (value !== '' || own(retirement, 'conceptComment')) result.conceptComment = value;
  return result;
}

const escapeHtml = value => value.replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
})[char]);

export function retirementConceptCommentField(retirement = {}) {
  if (!isRecord(retirement)) throw new TypeError('退職金設定を確認してください。');
  // Do not truncate existing data when displaying it. Invalid new input is rejected on apply.
  const value = own(retirement, 'conceptComment') ? retirement.conceptComment : '';
  if (typeof value !== 'string') throw new TypeError('保存済みの構想コメントの形式を確認してください。');
  return '<label class="retirement-concept-comment" style="grid-column:1/-1">構想コメント（任意）' +
    '<textarea name="conceptComment" rows="4" maxlength="2000" aria-describedby="retirementConceptCommentHelp" ' +
    'style="display:block;width:100%;box-sizing:border-box;min-height:7em;resize:vertical" ' +
    'placeholder="退職金の使い道や検討事項を自由に記入できます。">\n' + escapeHtml(value) + '</textarea></label>' +
    '<p id="retirementConceptCommentHelp" class="muted" style="grid-column:1/-1">' +
    '2,000文字以内。計算には使いません。入力・試算だけでは保存せず、「全体シミュレーションに反映」で保存します。' +
    '入力の取消は「未反映の入力を取り消す」を使用してください。</p>';
}
