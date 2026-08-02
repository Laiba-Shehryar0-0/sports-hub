import { Router } from 'express';
import { validate } from '../../middlewares/validate.js';
import { emptyQuerySchema } from './catalog.schema.js';
import { getKits, getProducts, getFeaturedKits } from './catalog.controller.js';

const router = Router();

router.get('/kits/featured', validate(emptyQuerySchema, 'query'), getFeaturedKits);
router.get('/kits', validate(emptyQuerySchema, 'query'), getKits);
router.get('/products', validate(emptyQuerySchema, 'query'), getProducts);

export default router;
