export const CALENDAR_MODES=['legacy','anchored-months-v1'];
export function calendarMode(config,options={}) {
  const saved=Object.hasOwn(config?.plan||{},'calendarMode')?config.plan.calendarMode:'legacy';
  if(!CALENDAR_MODES.includes(saved))throw new Error('未対応の計算期間方式です。保存値を確認してください。');
  const mode=options.calendarMode===undefined?saved:options.calendarMode;
  if(!CALENDAR_MODES.includes(mode))throw new Error('未対応の計算期間方式です');
  return mode;
}
