import { z } from 'zod';

// No query params are part of the contract for any catalog endpoint today —
// .strict() rejects anything unexpected (e.g. a stray ?sport=) rather than
// silently ignoring it.
export const emptyQuerySchema = z.object({}).strict();
