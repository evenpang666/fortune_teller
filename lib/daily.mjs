import lunar from 'lunar-javascript';

export const DAILY_TIME_ZONE = 'Asia/Shanghai';
export function dailyFortune(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DAILY_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = type => Number(parts.find(p => p.type === type).value);
  const solar = lunar.Solar.fromYmd(value('year'), value('month'), value('day'));
  const day = solar.getLunar();
  const favorable = day.getDayTianShenLuck() === '吉';
  return {
    date: solar.toYmd(), timeZone: DAILY_TIME_ZONE,
    weekday: '星期' + solar.getWeekInChinese(),
    lunar: `${day.getYearInGanZhi()}年 ${day.getMonthInChinese()}月${day.getDayInChinese()}`,
    ganzhi: `${day.getMonthInGanZhi()}月 · ${day.getDayInGanZhi()}日`,
    festival: [...day.getFestivals(), ...solar.getFestivals()], solarTerm: day.getJieQi(),
    yi: day.getDayYi().slice(0, 6), ji: day.getDayJi().slice(0, 6),
    spirit: day.getDayTianShen(), luck: day.getDayTianShenLuck(),
    assessment: favorable
      ? { label: '从容推进', summary: '适合按计划推进手头事务，沟通时把想法说清楚。', advice: '选一件重要的小事，今天完成它。' }
      : { label: '稳中求进', summary: '适合梳理安排、查漏补缺，给沟通和行动多留一点余地。', advice: '先处理熟悉的事，重要决定留出核对时间。' },
    note: '按北京时间更新；运势参考黄历值神吉凶，仅供民俗文化参考。',
  };
}
