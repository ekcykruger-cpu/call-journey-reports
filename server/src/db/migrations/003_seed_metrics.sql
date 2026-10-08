-- 003: starter metrics (editable later in the Metric Builder). INSERT IGNORE skips any name that already exists.
INSERT IGNORE INTO metrics (name, description, definition, chart_type) VALUES
(
  'Average InQueue time',
  'Average total InQueue time per journey (all legs), by the interval the journey started in.',
  '{"name":"Average InQueue time","description":"Average total InQueue time per journey (all legs), by the interval the journey started in.","chartType":"line","xAxis":"timeline","filters":[],"numerator":"avg(sum_in_queue)","denominator":"","format":"seconds","decimals":1,"emptyAs":"gap","profileMode":"combined"}',
  'line'
),
(
  'Journeys offered',
  'Number of journeys (customer calls) that started in each interval.',
  '{"name":"Journeys offered","description":"Number of journeys (customer calls) that started in each interval.","chartType":"bar","xAxis":"timeline","filters":[],"numerator":"count()","denominator":"","format":"number","decimals":0,"emptyAs":"zero","profileMode":"dailyAverage"}',
  'bar'
),
(
  'Abandon rate',
  'Share of journeys whose last leg was abandoned.',
  '{"name":"Abandon rate","description":"Share of journeys whose last leg was abandoned.","chartType":"line","xAxis":"timeline","filters":[],"numerator":"countif(abandoned_final = ''Y'')","denominator":"count()","format":"percent","decimals":1,"emptyAs":"gap","profileMode":"combined"}',
  'line'
),
(
  'Avg PreQ+InQ for abandoned journeys',
  '(PreQueue + InQueue time) / number of journeys, for journeys whose last leg was abandoned.',
  '{"name":"Avg PreQ+InQ for abandoned journeys","description":"(PreQueue + InQueue time) / number of journeys, for journeys whose last leg was abandoned.","chartType":"line","xAxis":"timeline","filters":[{"field":"abandoned_final","op":"=","value":"Y"}],"numerator":"sum(sum_pre_queue + sum_in_queue)","denominator":"count()","format":"seconds","decimals":1,"emptyAs":"gap","profileMode":"combined"}',
  'line'
);
