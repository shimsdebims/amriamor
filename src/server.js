const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors({
  origin: '*' // Allow all origins for now, tighten this for production
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));


// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB Atlas'))
.catch(err => console.error('MongoDB connection error:', err));

// Letter Model and Routes (same as before)
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

// Routes
app.post('/api/letters', async (req, res) => {
  try {
    const { from, to, secretCode, text, signature } = req.body;
    
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
});

app.get('/api/letters/:secretCode', async (req, res) => {
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
});

app.post('/api/letters/:secretCode/reply', async (req, res) => {
  try {
    const { secretCode } = req.params;
    const { text, signature } = req.body;
    
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
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});