const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  retryWrites: true,
  retryReads: true
}).then(() => {
  console.log('Connected to MongoDB');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

// Letter Model with image support
const letterSchema = new mongoose.Schema({
  secretCode: { type: String, required: true, unique: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  text: { type: String, required: true },
  signature: { type: String, required: true },
  image: { type: String },
  sent: { type: Date, default: Date.now },
  expires: { type: Date, required: true },
  hasReply: { type: Boolean, default: false },
  reply: {
    text: String,
    signature: String,
    image: String,
    sent: Date
  }
});

const Letter = mongoose.model('Letter', letterSchema);

// Create a letter
const createLetterHandler = async (req, res) => {
  try {
    const { from, to, secretCode, text, signature, image } = req.body;
    
    if (!from || !to || !secretCode || !text || !signature) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (image && image.length > 5000000) {
      return res.status(400).json({ message: 'Image too large. Please use a smaller image.' });
    }

    const existingLetter = await Letter.findOne({ secretCode });
    if (existingLetter) {
      return res.status(400).json({ message: 'Secret code already in use' });
    }

    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    const newLetter = new Letter({
      from,
      to,
      secretCode,
      text,
      signature,
      image,
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

// Get a letter
const getLetterHandler = async (req, res) => {
  try {
    const { secretCode } = req.params;
    
    if (!secretCode) {
      return res.status(400).json({ message: 'Secret code is required' });
    }
    
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

// Reply to a letter
const replyLetterHandler = async (req, res) => {
  try {
    const { secretCode } = req.params;
    const { text, signature, image } = req.body;
    
    if (!text || !signature) {
      return res.status(400).json({ message: 'Text and signature are required' });
    }
    
    if (image && image.length > 5000000) {
      return res.status(400).json({ message: 'Image too large. Please use a smaller image.' });
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
      image,
      sent: new Date()
    };
    
    await letter.save();
    
    res.json({ message: 'Reply sent successfully' });
  } catch (error) {
    console.error('Error sending reply:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Clean up expired letters
async function cleanupExpiredLetters() {
  try {
    const now = new Date();
    const result = await Letter.deleteMany({ expires: { $lt: now } });
    console.log(`Cleaned up ${result.deletedCount} expired letters`);
  } catch (error) {
    console.error('Error cleaning up expired letters:', error);
  }
}

// Run cleanup every hour
setInterval(cleanupExpiredLetters, 60 * 60 * 1000);

// Routes
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

// Catch-all route for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  cleanupExpiredLetters(); // Initial cleanup
});