export function notFound(req, res) {
  res.status(404).json({ error: 'Endpoint not found.' });
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A conflicting record already exists.' });
  if (err.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ error: 'A referenced team or user does not exist.' });
  const status = Number(err.status) || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'An unexpected server error occurred.' : err.message });
}
