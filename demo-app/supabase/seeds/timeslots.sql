-- Availability for the profile calendar, generated from `current_date` (see the migration for why).
--
-- WHAT THE SHAPE GUARANTEES, because the demo depends on all four:
--   * Every member with an EVEN member_no has availability; odd ones have none. So the "this member
--     publishes no availability" state is reachable by clicking a real row rather than by editing
--     a fixture — an empty state nobody can navigate to is an empty state nobody believes.
--   * Availability runs over the next 21 days, weekdays only. A calendar with a weekend column that
--     is always empty looks broken; one that skips weekends looks like a calendar.
--   * Some days are FULL and some are EMPTY inside the range, so "pick a day" is a real choice
--     rather than a formality.
--   * Roughly a third of slots are already `taken`, so the disabled state renders on screen without
--     anyone having to arrange it.
--
-- Deterministic without being frozen: every branch below keys off `member_no` and the day offset,
-- never off `random()`. Re-running this produces the same calendar shifted to today, which is what
-- makes a recorded take reproducible.

truncate table public.timeslots;

insert into public.timeslots (member_id, starts_at, minutes, kind, taken)
select
  m.id,
  -- The slot's instant: midnight of the offset day, plus the hour.
  (current_date + d.offset_days)::timestamptz + (h.hour_of_day || ' hours')::interval,
  case h.hour_of_day when 9 then 30 when 11 then 60 when 14 then 30 else 45 end,
  case h.hour_of_day when 9 then 'intro' when 11 then 'workshop' when 14 then 'intro' else 'mentoring' end,
  -- Taken-ness is a pure function of who, when and what hour, so it is stable across resets.
  ((m.member_no::bigint + d.offset_days * 7 + h.hour_of_day) % 3) = 0
from public.members m
  cross join generate_series(0, 20) as d (offset_days)
  cross join unnest(array[9, 11, 14, 16]) as h (hour_of_day)
where
  -- Half the directory publishes availability; the other half is the empty state.
  (m.member_no::bigint % 2) = 0
  -- Weekdays only: 0 = Sunday, 6 = Saturday.
  and extract(dow from (current_date + d.offset_days)) between 1 and 5
  -- Punch holes in the range so days differ from one another: this member is away on some days,
  -- and which days depends on who they are.
  and ((m.member_no::bigint / 2 + d.offset_days) % 4) <> 0
  -- And thin out the afternoons on the far half of the range, so later days are sparser than the
  -- near ones — which is what a calendar that people have been booking actually looks like.
  and not (d.offset_days > 10 and h.hour_of_day >= 14 and ((m.member_no::bigint + d.offset_days) % 2) = 0);
