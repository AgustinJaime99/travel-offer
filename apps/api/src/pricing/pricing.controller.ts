import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  CATALOG_EDITOR_ROLES,
  type PricingPreviewRequest,
  pricingPreviewRequestSchema,
  type PricingResult,
} from '@travel-rock/shared';
import { ApiException } from '../common/api-exception.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Roles } from '../staff-auth/decorators.js';
import { calculateOffer, PricingValidationError } from './domain/pricing-engine.js';
import { toOfferDto } from './pricing-result.mapper.js';

/** Server-side preview for the Proposal Builder: inputs in, full calculation out, nothing persisted. */
@Controller('admin/pricing')
export class PricingController {
  @Post('preview')
  @HttpCode(200)
  @Roles(...CATALOG_EDITOR_ROLES)
  preview(
    @Body(new ZodValidationPipe(pricingPreviewRequestSchema)) body: PricingPreviewRequest,
  ): PricingResult {
    try {
      const offer = calculateOffer({
        lines: body.items.map((item) => ({
          quantity: item.quantity,
          unitPriceMinor: BigInt(item.unitPriceMinor),
          discountMinor: BigInt(item.discountMinor),
          pricingUnit: item.pricingUnit,
        })),
        commercialDiscountMinor: BigInt(body.commercialDiscountMinor),
        downPaymentMinor: BigInt(body.downPaymentMinor),
        installments: body.installments,
        tnaBps: body.tnaBps,
        passengerCount: body.passengerCount,
      });
      return toOfferDto(offer);
    } catch (error) {
      if (error instanceof PricingValidationError) {
        throw new ApiException(
          400,
          'VALIDATION_FAILED',
          'Revisá los datos de la propuesta.',
          error.issues,
        );
      }
      throw error;
    }
  }
}
