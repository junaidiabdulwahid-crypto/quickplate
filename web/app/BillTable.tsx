import { rupees, type Bill } from "../lib/api";

export function BillTable({ bill }: { bill: Bill }) {
  return (
    <table className="bill">
      <tbody>
        <tr><td>Items</td><td>{rupees(bill.items_total)}</td></tr>
        {bill.discount > 0 && <tr><td>Coupon</td><td>− {rupees(bill.discount)}</td></tr>}
        <tr><td>Delivery</td><td>{bill.delivery_fee === 0 ? "Free" : rupees(bill.delivery_fee)}</td></tr>
        <tr><td>Packaging</td><td>{rupees(bill.packaging_fee)}</td></tr>
        <tr><td>GST (5% on food)</td><td>{rupees(bill.gst)}</td></tr>
        <tr className="total"><td>To pay</td><td>{rupees(bill.grand_total)}</td></tr>
      </tbody>
    </table>
  );
}
