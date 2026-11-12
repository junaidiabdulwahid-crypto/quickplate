/** Money is stored as NUMERIC rupees and calculated in whole paise. */

/** Accepts "480.75" (from the DB) or 480.75 (from JSON). */
export function rupeesToPaise(rupees: number | string): number {
  return Math.round(Number(rupees) * 100);
}

export function paiseToRupees(paise: number): number {
  return Math.round(paise) / 100;
}

/** percent of an amount in paise, rounded half-up to the nearest paisa. */
export function percentOfPaise(paise: number, percent: number): number {
  return Math.round((paise * percent) / 100);
}
