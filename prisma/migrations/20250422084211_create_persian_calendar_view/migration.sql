CREATE OR REPLACE VIEW persian_calendar AS
WITH date_range AS (
  SELECT generate_series(
    '2022-03-21'::date,
    current_date + INTERVAL '7 day',
    INTERVAL '1 day'
  ) AS date
),
base AS (
  SELECT
    date,
    EXTRACT(YEAR FROM date) AS g_year,
    EXTRACT(MONTH FROM date) AS g_month,
    EXTRACT(DAY FROM date) AS g_day,
    -- Gregorian day of year (doy)
    CASE EXTRACT(MONTH FROM date)::int
      WHEN 1 THEN 0
      WHEN 2 THEN 31
      WHEN 3 THEN 59
      WHEN 4 THEN 90
      WHEN 5 THEN 120
      WHEN 6 THEN 151
      WHEN 7 THEN 181
      WHEN 8 THEN 212
      WHEN 9 THEN 243
      WHEN 10 THEN 273
      WHEN 11 THEN 304
      WHEN 12 THEN 334
    END + EXTRACT(DAY FROM date)::int AS doy_g,
    EXTRACT(YEAR FROM date) % 4 AS d_4,
    FLOOR(((EXTRACT(YEAR FROM date) - 16) % 132) * 0.0305) AS d_33,
    EXTRACT(DOW FROM date) AS dow
  FROM date_range
),
converted AS (
  SELECT *,
    CASE 
      WHEN (d_33 = 3 OR d_33 < (d_4 - 1) OR d_4 = 0) THEN 286
      ELSE 287
    END AS a,
    CASE 
      WHEN (d_33 = 1 OR d_33 = 2) AND (d_33 = d_4 OR d_4 = 1) THEN 78
      WHEN d_33 = 3 AND d_4 = 0 THEN 80
      ELSE 79
    END AS b
  FROM base
),
final AS (
  SELECT *,
    CASE 
      WHEN g_month > 2 AND d_4 = 0 THEN doy_g + 1
      ELSE doy_g
    END AS doy_g_adj
  FROM converted
),
persian_dates AS (
  SELECT *,
    CASE 
      WHEN doy_g_adj > b THEN g_year - 621
      ELSE g_year - 622
    END AS persian_year,
    CASE 
      WHEN doy_g_adj > b THEN doy_g_adj - b
      ELSE doy_g_adj + a
    END AS doy_j
  FROM final
)
SELECT
  date,
  persian_year,
  -- Persian month (1–12)
  CASE
    WHEN doy_j <= 186 THEN FLOOR((doy_j - 1) / 31) + 1
    ELSE FLOOR((doy_j - 187) / 30) + 7
  END AS persian_month,
  -- Persian day
  CASE
    WHEN doy_j <= 186 THEN ((doy_j - 1) % 31) + 1
    ELSE ((doy_j - 187) % 30) + 1
  END AS persian_day,
  -- Persian month name
  CASE
    WHEN doy_j <= 31 THEN 'فروردین'
    WHEN doy_j <= 62 THEN 'اردیبهشت'
    WHEN doy_j <= 93 THEN 'خرداد'
    WHEN doy_j <= 124 THEN 'تیر'
    WHEN doy_j <= 155 THEN 'مرداد'
    WHEN doy_j <= 186 THEN 'شهریور'
    WHEN doy_j <= 216 THEN 'مهر'
    WHEN doy_j <= 246 THEN 'آبان'
    WHEN doy_j <= 276 THEN 'آذر'
    WHEN doy_j <= 306 THEN 'دی'
    WHEN doy_j <= 336 THEN 'بهمن'
    ELSE 'اسفند'
  END AS persian_month_name,
  -- Persian season
  CASE
    WHEN doy_j <= 93 THEN 'بهار'
    WHEN doy_j <= 186 THEN 'تابستان'
    WHEN doy_j <= 279 THEN 'پاییز'
    ELSE 'زمستان'
  END AS persian_season,
  -- Persian season number
  CASE
    WHEN doy_j <= 93 THEN 1
    WHEN doy_j <= 186 THEN 2
    WHEN doy_j <= 279 THEN 3
    ELSE 4
  END AS persian_season_number,
  -- Week start date (Saturday)
  CASE
    WHEN dow = 6 THEN date
    ELSE (date - ((dow + 1)::text || ' days')::interval)::date
  END AS persian_week_start_date
FROM persian_dates;