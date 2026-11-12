import { IsString, Matches, MaxLength } from 'class-validator';

/** What the checkout page hands back to the app after paying. */
export class VerifyPaymentDto {
  @IsString()
  @MaxLength(64)
  razorpay_order_id!: string;

  @IsString()
  @MaxLength(64)
  razorpay_payment_id!: string;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/, { message: 'razorpay_signature must be a 64-character hex string' })
  razorpay_signature!: string;
}

export interface CheckoutInfo {
  gateway_order_id: string;
  amount_paise: number;
  currency: 'INR';
  key_id: string; // the public half of the key
  checkout_url: string;
}

export interface GatewayWebhook {
  event: 'payment.captured' | 'payment.failed' | string;
  payload: { payment: { entity: { id: string; order_id: string; amount: number; status: string } } };
}
