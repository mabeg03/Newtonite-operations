import dotenv from 'dotenv';
dotenv.config();
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be configured with at least 32 characters. See .env.example.');
}
const { app } = await import('./app.js');
const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`Newtonite Operations API listening on http://localhost:${port}`));
