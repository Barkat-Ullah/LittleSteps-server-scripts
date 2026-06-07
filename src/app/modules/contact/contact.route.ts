import express from 'express';
import auth from '../../middlewares/auth';
import validateRequest from '../../middlewares/validateRequest';
import { contactController } from './contact.controller';
import { contactValidation } from './contact.validation';

const router = express.Router();


router.post(
  '/',
  auth(),
  validateRequest(contactValidation.createSchema),
  contactController.createContact,
);

router.get('/', auth(), contactController.getContactList);

router.get('/my', auth(), contactController.getMyContact);

router.get('/:id', auth(), contactController.getContactById);

router.put(
  '/:id',
  auth(),
  validateRequest(contactValidation.updateSchema),
  contactController.updateContact,
);

router.patch(
  '/toggle-status/:id',
  auth(),
  contactController.toggleStatusContact,
);

router.delete(
  '/soft-delete/:id',
  auth(),
  contactController.softDeleteContact,
);

router.delete('/:id', auth(), contactController.deleteContact);

export const contactRouter = router;