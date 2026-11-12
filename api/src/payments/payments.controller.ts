import { Body, Controller, Headers, HttpCode, Post, RawBodyRequest, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Roles } from '../auth/current-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VerifyPaymentDto } from './payments.dto';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('payments/verify')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Roles('customer')
  verify(@Body() dto: VerifyPaymentDto, @CurrentUser() user: AuthUser) {
    return this.payments.verifyCheckout(dto, user.id);
  }

  /** Called by the gateway's server, not a person: no JWT, the signature is the proof. */
  @Post('webhooks/payments')
  @HttpCode(200)
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature?: string,
    @Headers('x-razorpay-event-id') eventId?: string,
  ) {
    return this.payments.handleWebhook(req.rawBody, signature, eventId);
  }
}
