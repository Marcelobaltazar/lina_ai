/**
 * Simple bearer token middleware for admin routes.
 * Validates against ADMIN_SECRET env var.
 */
export function requireAdminSecret(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.replace('Bearer ', '');
  if (token !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}
