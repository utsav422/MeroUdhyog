export const STATUS_COLORS: Record<string, string> = {
  on_track: '#22c55e',
  due_soon: '#f59e0b',
  overdue: '#f43f5e',
  insufficient_data: '#a1a1aa',
};

export const STATUS_LABELS: Record<string, string> = {
  on_track: 'On track',
  due_soon: 'Due soon',
  overdue: 'Overdue',
  insufficient_data: 'Needs data',
};

export const STATUS_ORDER: Record<string, number> = {
  overdue: 2,
  due_soon: 1,
  on_track: 0,
  insufficient_data: -1,
};

export const STATUS_EXPLAIN: Record<string, string> = {
  on_track: 'ordering on their usual schedule',
  due_soon: 'likely to reorder within days',
  overdue: 'past their usual reorder time',
  insufficient_data: 'not enough history yet to predict',
};