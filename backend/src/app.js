require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// Initialize Express app
const app = express();

// Middleware
app.use(cors({ origin: ['http://localhost:3000', 'https://3percentclub-hackathon.vercel.app'] }));
app.use(express.json());

// MongoDB connection
const MONGO_URI = 'mongodb+srv://bunnychokkam:bunnychokkam@cluster0.iu0myns.mongodb.net/';

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection failed:', error);
    throw error;
  }
};

// Mongoose Schema
const ListingSchema = new mongoose.Schema({
  listingId: { type: Number, required: true, unique: true },
  productName: { type: String, required: true, trim: true },
  productDescription: { type: String, required: true, trim: true },
  productCategory: {
    type: String,
    required: true,
    enum: ['Sneakers', 'Apparel', 'Watches'],
  },
  imageUrls: [{ type: String, required: true }],
  seller: { type: String, required: true },
  price: { type: Number, required: true },
  status: {
    type: String,
    required: true,
    enum: ['Pending', 'Listed', 'Cancelled'],
    default: 'Pending',
  },
  saleType: {
    type: String,
    required: true,
    enum: ['Retail', 'Resell'],
  },
  purchaseHistory: [
    {
      buyer: { type: String },
      price: { type: Number },
      tokenId: { type: Number },
      timestamp: { type: Date, default: Date.now },
    },
  ],
}, { timestamps: true });

ListingSchema.index({ status: 1 });
const Listing = mongoose.model('Listing', ListingSchema);

// API Routes

app.post('/api/listings', async (req, res) => {
  try {
    const {
      productName,
      productDescription,
      productCategory,
      price,
      imageUrls,
      seller,
      saleType,
    } = req.body;

    if (!['Sneakers', 'Apparel', 'Watches'].includes(productCategory)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    if (!['Retail', 'Resell'].includes(saleType)) {
      return res.status(400).json({ error: 'Invalid sale type' });
    }
    if (!productName || !productDescription || !price || !imageUrls || imageUrls.length === 0 || !seller) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const lastListing = await Listing.findOne().sort({ listingId: -1 });
    const listingId = lastListing ? lastListing.listingId + 1 : 1;

    const listing = new Listing({
      listingId,
      productName,
      productDescription,
      productCategory,
      imageUrls,
      seller,
      price,
      status: 'Pending',
      saleType,
      purchaseHistory: [],
    });

    await listing.save();
    res.status(201).json({ listingId, message: 'Pending listing created' });
  } catch (error) {
    console.error('Error creating listing:', error);
    res.status(500).json({ error: 'Failed to create listing' });
  }
});

app.put('/api/listings/:listingId', async (req, res) => {
  try {
    const { listingId } = req.params;
    const { status, buyer, price, tokenId } = req.body;

    if (status && !['Pending', 'Listed', 'Cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updateData = {};
    if (status) updateData.status = status;
    if (buyer && price && tokenId) {
      updateData.$push = {
        purchaseHistory: {
          buyer,
          price,
          tokenId,
          timestamp: new Date(),
        },
      };
    }

    const listing = await Listing.findOneAndUpdate(
      { listingId: parseInt(listingId) },
      updateData,
      { new: true }
    );

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    res.json({ message: 'Listing updated', listing });
  } catch (error) {
    console.error('Error updating listing:', error);
    res.status(500).json({ error: 'Failed to update listing' });
  }
});

app.get('/api/listings', async (req, res) => {
  try {
    const listings = await Listing.find({ status: 'Listed' });
    res.json(listings);
  } catch (error) {
    console.error('Error fetching listings:', error);
    res.status(500).json({ error: 'Failed to fetch listings' });
  }
});

app.get('/api/listings/:listingId', async (req, res) => {
  try {
    const { listingId } = req.params;
    const listing = await Listing.findOne({ listingId: parseInt(listingId) });
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    res.json(listing);
  } catch (error) {
    console.error('Error fetching listing:', error);
    res.status(500).json({ error: 'Failed to fetch listing' });
  }
});

app.delete('/api/listings/:listingId', async (req, res) => {
  try {
    const { listingId } = req.params;
    const { seller } = req.body;

    if (!seller) {
      return res.status(400).json({ error: 'Seller address is required' });
    }

    const listing = await Listing.findOne({ listingId: parseInt(listingId) });
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    if (listing.seller.toLowerCase() !== seller.toLowerCase()) {
      return res.status(403).json({ error: 'Only the seller can delete this listing' });
    }

    await Listing.deleteOne({ listingId: parseInt(listingId) });
    res.json({ message: 'Listing deleted successfully' });
  } catch (error) {
    console.error('Error deleting listing:', error);
    res.status(500).json({ error: 'Failed to delete listing' });
  }
});

app.get('/api/listings/collection/:wallet', async (req, res) => {
  try {
    const listings = await Listing.find({
      'purchaseHistory.buyer': req.params.wallet,
    });
    res.json(listings);
  } catch (error) {
    console.error('Error fetching collection:', error);
    res.status(500).json({ error: 'Failed to fetch collection' });
  }
});

app.post('/api/resale-purchases', async (req, res) => {
  try {
    const { listingId, buyer, price, tokenId } = req.body;

    if (!listingId || !buyer || !price || !tokenId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const listing = await Listing.findOne({
      'purchaseHistory.tokenId': tokenId,
    });

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    listing.purchaseHistory.push({
      buyer,
      price,
      tokenId,
      timestamp: new Date(),
    });

    await listing.save();
    res.json({ message: 'Resale purchase recorded' });
  } catch (error) {
    console.error('Error recording resale purchase:', error);
    res.status(500).json({ error: 'Failed to record resale purchase' });
  }
});

module.exports = app;
