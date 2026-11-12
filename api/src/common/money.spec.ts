import { paiseToRupees, percentOfPaise, rupeesToPaise } from './money';

describe('money', () => {
  it('works in whole paise', () => {
    expect(rupeesToPaise(480.75)).toBe(48075);
    expect(rupeesToPaise('0.30')).toBe(30);
    expect(percentOfPaise(48075, 10)).toBe(4808); // 4807.5 rounds up
    expect(paiseToRupees(43267)).toBe(432.67);
  });

  it('discount + payable always equals the bill', () => {
    for (const [bill, pct] of [[480.75, 10], [99.99, 12.5], [1, 100], [1234.56, 33.33]] as const) {
      const billPaise = rupeesToPaise(bill);
      const discount = percentOfPaise(billPaise, pct);
      expect(discount + (billPaise - discount)).toBe(billPaise);
    }
  });
});
