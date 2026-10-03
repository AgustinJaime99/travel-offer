import { z } from 'zod';

export const paginationQuerySchema = z.object({
  // Bounded so OFFSET stays a small safe integer (an absurd page is a 400, not a 500).
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function paginatedSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  });
}

export type Paginated<T> = { items: T[]; page: number; pageSize: number; total: number };
