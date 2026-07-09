import { format, isToday, isTomorrow } from 'date-fns';

export function dayLabel(dateStr, pattern = 'EEE, d MMM') {
  const d = new Date(dateStr);
  if (isToday(d)) return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  return format(d, pattern);
}

export function groupByDate(items, key = 'scheduled_date') {
  return items.reduce((acc, item) => {
    (acc[item[key]] ||= []).push(item);
    return acc;
  }, {});
}
