// =============================================================================
// FERZU POS — Auth Routes  (/api/auth)
// =============================================================================
import express      from 'express';
import { body }     from 'express-validator';
import { supabaseAdmin } from '../config/supabase.js';
import logger            from '../config/logger.js';
import { pinRateLimit }  from '../config/rateLimits.js';
import { requireAuth }   from '../middleware/auth.js';
import { validate }      from '../middleware/validate.js';

const router = express.Router();

// POST /auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  validate,
], async (req, res) => {
  try {
    const { email, password } = req.body;
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: 'Credenciales incorrectas' });

    await supabaseAdmin.from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', data.user.id);

    res.json({
      access_token:  data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: {
        id:    data.user.id,
        email: data.user.email,
        role:  data.user.app_metadata?.role,
      },
    });
  } catch (err) {
    logger.error('Login error', { err });
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// POST /auth/welcome-email
router.post('/welcome-email', [
  body('email').isEmail().normalizeEmail(),
  validate,
], async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email) return res.status(400).json({ error: 'email requerido' });

    const { data: userRecord } = await supabaseAdmin
      .from('users').select('id').eq('email', email).maybeSingle();
    if (!userRecord) return res.json({ sent: false });

    const { sendWelcomeEmail } = await import('../lib/emails.js');
    await sendWelcomeEmail({ to: email, name: name || 'Usuario' });
    res.json({ sent: true });
  } catch (err) {
    logger.warn('Welcome email error (non-critical)', { err: err.message });
    res.json({ sent: false });
  }
});

// POST /auth/pin — Login rápido por PIN en caja
router.post('/pin', pinRateLimit, [
  body('pin').isLength({ min: 4, max: 6 }).isNumeric(),
  body('branch_id').isUUID(),
  validate,
], async (req, res) => {
  try {
    const { pin, branch_id } = req.body;

    const { data: branchUsers } = await supabaseAdmin
      .from('user_branches').select('user_id').eq('branch_id', branch_id);

    if (!branchUsers?.length) return res.status(401).json({ error: 'PIN incorrecto' });

    const userIds = branchUsers.map(b => b.user_id);
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, full_name, role, pin_hash, organization_id, email')
      .in('id', userIds)
      .eq('is_active', true);

    if (!users?.length) return res.status(401).json({ error: 'PIN incorrecto' });

    const bcrypt = (await import('bcryptjs')).default;
    let matchedUser = null;
    for (const u of users) {
      if (u.pin_hash && await bcrypt.compare(pin, u.pin_hash)) {
        matchedUser = u;
        break;
      }
    }

    if (!matchedUser) return res.status(401).json({ error: 'PIN incorrecto' });

    res.json({
      user_id:   matchedUser.id,
      full_name: matchedUser.full_name,
      role:      matchedUser.role,
    });
  } catch (err) {
    logger.error('PIN login error', { err });
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// POST /auth/verify-pin — Desbloquear pantalla de inactividad
router.post('/verify-pin', pinRateLimit, requireAuth, [
  body('pin').isLength({ min: 4, max: 6 }).isNumeric(),
  validate,
], async (req, res) => {
  try {
    const { pin } = req.body;

    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, full_name, role, pin_hash, email')
      .eq('organization_id', req.organizationId)
      .eq('is_active', true)
      .not('pin_hash', 'is', null);

    if (!users?.length) return res.json({ valid: false });

    const bcrypt = (await import('bcryptjs')).default;
    let matchedUser = null;
    for (const u of users) {
      if (u.pin_hash && await bcrypt.compare(pin, u.pin_hash)) {
        matchedUser = u;
        break;
      }
    }

    if (!matchedUser) return res.json({ valid: false });

    res.json({
      valid: true,
      user: { id: matchedUser.id, full_name: matchedUser.full_name, role: matchedUser.role },
    });
  } catch (err) {
    logger.error('verify-pin error', { err });
    res.status(500).json({ valid: false, error: 'Error del servidor' });
  }
});

export default router;
