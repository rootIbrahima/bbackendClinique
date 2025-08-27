import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import isBetween from 'dayjs/plugin/isBetween.js';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore.js';
import { q } from '../db/pg.js';

dayjs.extend(utc);
dayjs.extend(isBetween);
dayjs.extend(isSameOrBefore);

export async function generateSlots(doctorId, fromISO, toISO) {
  const rules = (await q(
    'SELECT weekday, start_time, end_time, slot_minutes FROM doctor_availability WHERE doctor_id=$1',
    [doctorId]
  )).rows.map(r => ({
    weekday: Number(r.weekday),
    startTime: r.start_time, // "09:00:00"
    endTime: r.end_time,     // "12:00:00"
    slotMin: Number(r.slot_minutes || 30),
  }));

  const exc = (await q(
    'SELECT starts_at, ends_at FROM doctor_unavailability WHERE doctor_id=$1',
    [doctorId]
  )).rows;

  const appts = (await q(
    `SELECT starts_at FROM appointments
     WHERE doctor_id=$1 AND status='scheduled' AND starts_at BETWEEN $2 AND $3`,
    [doctorId, fromISO, toISO]
  )).rows;
  const taken = new Set(appts.map(a => new Date(a.starts_at).toISOString()));

  const from = dayjs.utc(fromISO);
  const to   = dayjs.utc(toISO);
  const slots = [];

  for (let d = from; d.isBefore(to); d = d.add(1, 'day')) {
    const weekday = d.day();

    for (const r of rules.filter(x => x.weekday === weekday)) {
      const start = dayjs.utc(`${d.format('YYYY-MM-DD')}T${r.startTime}Z`);
      const end   = dayjs.utc(`${d.format('YYYY-MM-DD')}T${r.endTime}Z`);

      for (let s = start; s.add(r.slotMin, 'minute').isSameOrBefore(end); s = s.add(r.slotMin, 'minute')) {
        const sEnd = s.add(r.slotMin, 'minute');

        const excluded = exc.some(ex =>
          s.isBefore(dayjs.utc(ex.ends_at)) && sEnd.isAfter(dayjs.utc(ex.starts_at))
        );

        if (!excluded) {
          const iso = s.toISOString();
          if (!taken.has(iso)) slots.push({ startsAt: iso, endsAt: sEnd.toISOString() });
        }
      }
    }
  }
  return slots;
}
