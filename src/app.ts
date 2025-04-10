import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Express + TypeScript + Bun API' });
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
