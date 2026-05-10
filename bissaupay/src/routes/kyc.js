// src/routes/kyc.js
// Verificação de identidade (KYC)

const express = require('express')
const router  = express.Router()
const { body } = require('express-validator')

const { authenticate, requireAdmin } = require('../middleware/auth')
const { validate }   = require('../middleware/validate')
const {
  submitKYC, approveKYC, rejectKYC,
  listPendingKYC, getKYCStatus,
} = require('../services/kycService')

router.use(authenticate)

// ─────────────────────────────────────────────────────────────
// GET /kyc/status
// ─────────────────────────────────────────────────────────────
router.get('/status', async (req, res, next) => {
  try {
    const status = await getKYCStatus(req.userId)
    res.json({ success: true, data: status })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────
// POST /kyc/submit
// Em produção: use multipart/form-data com upload real
// Aqui recebe URLs (após upload para S3/Cloudinary/etc.)
// ─────────────────────────────────────────────────────────────
router.post('/submit',
  [
    body('document_type')
      .isIn(['bi', 'passport', 'residence', 'driving_license'])
      .withMessage('Tipo de documento inválido'),
    body('document_number')
      .trim().notEmpty().isLength({ max: 50 })
      .withMessage('Número do documento obrigatório'),
    body('document_photo_url')
      .isURL().withMessage('URL do documento inválida'),
    body('selfie_url')
      .isURL().withMessage('URL da selfie inválida'),
  ],
  async (req, res, next) => {
    if (validate(req, res)) return
    try {
      const result = await submitKYC(req.userId, {
        documentType:     req.body.document_type,
        documentNumber:   req.body.document_number.trim(),
        documentPhotoUrl: req.body.document_photo_url,
        selfieUrl:        req.body.selfie_url,
      })
      res.json(result)
    } catch (err) {
      next(err)
    }
  }
)

// ─────────────────────────────────────────────────────────────
// GET /kyc/pending  (admin)
// ─────────────────────────────────────────────────────────────
router.get('/pending', requireAdmin, async (req, res, next) => {
  try {
    const page  = parseInt(req.query.page)  || 1
    const limit = parseInt(req.query.limit) || 20
    const data  = await listPendingKYC({ page, limit })
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────
// POST /kyc/:userId/approve  (admin)
// ─────────────────────────────────────────────────────────────
router.post('/:userId/approve', requireAdmin, async (req, res, next) => {
  try {
    const result = await approveKYC(req.params.userId, req.userId)
    res.json(result)
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────
// POST /kyc/:userId/reject  (admin)
// ─────────────────────────────────────────────────────────────
router.post('/:userId/reject',
  requireAdmin,
  [body('reason').notEmpty().isLength({ max: 300 }).withMessage('Motivo de rejeição obrigatório')],
  async (req, res, next) => {
    if (validate(req, res)) return
    try {
      const result = await rejectKYC(req.params.userId, req.userId, req.body.reason)
      res.json(result)
    } catch (err) {
      next(err)
    }
  }
)

module.exports = router
