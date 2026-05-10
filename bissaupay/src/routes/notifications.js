// src/routes/notifications.js
// Notificações in-app do utilizador

const express = require('express')
const router  = express.Router()
const { body, query: qParam } = require('express-validator')

const { authenticate }  = require('../middleware/auth')
const { validate }      = require('../middleware/validate')
const {
  getUserNotifications, markAsRead,
} = require('../services/notificationService')

router.use(authenticate)

// GET /notifications
router.get('/',
  [
    qParam('page').optional().isInt({ min: 1 }),
    qParam('limit').optional().isInt({ min: 1, max: 50 }),
  ],
  async (req, res, next) => {
    if (validate(req, res)) return
    try {
      const data = await getUserNotifications(req.userId, {
        page:  parseInt(req.query.page)  || 1,
        limit: parseInt(req.query.limit) || 20,
      })
      res.json({ success: true, data })
    } catch (err) {
      next(err)
    }
  }
)

// POST /notifications/read
router.post('/read',
  [body('ids').optional().isArray()],
  async (req, res, next) => {
    if (validate(req, res)) return
    try {
      const result = await markAsRead(req.userId, req.body.ids || [])
      res.json({ success: true, ...result })
    } catch (err) {
      next(err)
    }
  }
)

module.exports = router
