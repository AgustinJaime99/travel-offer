import type { Service } from '@travel-rock/shared';
import type { Service as ServiceRecord } from '../generated/prisma/client.js';

/** Money leaves the API as a decimal string of centavos (T2): JSON cannot carry bigint. */
export function toServiceDto(service: ServiceRecord): Service {
  return {
    id: service.id,
    name: service.name,
    description: service.description,
    category: service.category,
    pricingUnit: service.pricingUnit,
    basePriceMinor: service.basePriceMinor.toString(),
    active: service.active,
    createdAt: service.createdAt.toISOString(),
    updatedAt: service.updatedAt.toISOString(),
  };
}
