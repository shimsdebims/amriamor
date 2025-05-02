const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors({
  origin: '*', // For development. In production, specify your domain
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Serve static files - adjust path for Render's deployment environment
const publicPath = path.join(__dirname, '../public');
console.log('Serving static files from:', publicPath);
app.use(express.static(publicPath));

// MongoDB Connection with better error handling
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1); // Exit if DB connection fails
  });

// Letter Model
const letterSchema = new mongoose.Schema({
  secretCode: { type: String, required: true, unique: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  text: { type: String, required: true },
  signature: { type: String, required: true },
  sent: { type: Date, default: Date.now },
  expires: { type: Date, required: true },
  hasReply: { type: Boolean, default: false },
  reply: {
    text: String,
    signature: String,
    sent: Date
  }
});

const Letter = mongoose.model('Letter', letterSchema);

// Routes - Support both /api/letters and /letters to match frontend
const createLetterHandler = async (req, res) => {
  try {
    const { from, to, secretCode, text, signature } = req.body;
    
    if (!from || !to || !secretCode || !text || !signature) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Check for existing letter with same secret code
    const existingLetter = await Letter.findOne({ secretCode });
    if (existingLetter) {
      return res.status(400).json({ message: 'Secret code already in use' });
    }

    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    const newLetter = new Letter({
      from,
      to,
      secretCode,
      text,
      signature,
      expires
    });
    
    await newLetter.save();
    
    res.status(201).json({ 
      message: 'Letter sent successfully',
      expiresAt: expires
    });
  } catch (error) {
    console.error('Error sending letter:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const getLetterHandler = async (req, res) => {
  try {
    const { secretCode } = req.params;
    const letter = await Letter.findOne({ secretCode });
    
    if (!letter) {
      return res.status(404).json({ message: 'No letter found with this code' });
    }
    
    if (new Date() > letter.expires) {
      await Letter.findByIdAndDelete(letter._id);
      return res.status(404).json({ message: 'Letter has expired' });
    }
    
    res.json(letter);
  } catch (error) {
    console.error('Error retrieving letter:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const replyLetterHandler = async (req, res) => {
  try {
    const { secretCode } = req.params;
    const { text, signature } = req.body;
    
    if (!text || !signature) {
      return res.status(400).json({ message: 'Text and signature are required' });
    }
    
    const letter = await Letter.findOne({ secretCode });
    
    if (!letter) {
      return res.status(404).json({ message: 'No letter found with this code' });
    }
    
    if (new Date() > letter.expires) {
      return res.status(400).json({ message: 'Letter has expired' });
    }
    
    letter.hasReply = true;
    letter.reply = {
      text,
      signature,
      sent: new Date()
    };
    
    await letter.save();
    
    res.json({ message: 'Reply sent successfully' });
  } catch (error) {
    console.error('Error sending reply:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Set up routes with both paths to handle frontend API calls
// API format routes
app.post('/api/letters', createLetterHandler);
app.get('/api/letters/:secretCode', getLetterHandler);
app.post('/api/letters/:secretCode/reply', replyLetterHandler);

// Direct routes (matching frontend)
app.post('/letters', createLetterHandler);
app.get('/letters/:secretCode', getLetterHandler);
app.post('/letters/:secretCode/reply', replyLetterHandler);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Catch-all route to handle client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});