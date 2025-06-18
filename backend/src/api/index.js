// api/index.js
const mongoose = require('mongoose');

// MongoDB URI from environment variables
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://bunnychokkam:bunnychokkam@cluster0.iu0myns.mongodb.net/';

let isConnected = false;

async function connectToDatabase() {
  if (isConnected) {
    return;
  }

  try {
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    isConnected = true;
    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    throw error;
  }
}

// Listing Schema
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
}, {
  timestamps: true,
});

ListingSchema.index({ status: 1 });
const Listing = mongoose.models.Listing || mongoose.model('Listing', ListingSchema);

// Helper function to set CORS headers
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Main handler function
export default async function handler(req, res) {
  setCorsHeaders(res);

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Connect to database
  try {
    await connectToDatabase();
  } catch (error) {
    return res.status(500).json({ error: 'Database connection failed' });
  }

  const { url, method } = req;

  try {
    // Route: GET /api/ping
    if (url === '/api/ping' && method === 'GET') {
      return res.status(200).send('pong');
    }

    // Route: POST /api/listings - Create a pending listing
    if (url === '/api/listings' && method === 'POST') {
      const {
        productName,
        productDescription,
        productCategory,
        price,
        imageUrls,
        seller,
        saleType,
      } = req.body;

      if (!['Sneakers', 'Apparel', 'Watches'].includes(productCategory))
        return res.status(400).json({ error: 'Invalid category' });

      if (!['Retail', 'Resell'].includes(saleType))
        return res.status(400).json({ error: 'Invalid sale type' });

      if (!productName || !productDescription || !price || !imageUrls || imageUrls.length === 0 || !seller)
        return res.status(400).json({ error: 'Missing required fields' });

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
      return res.status(201).json({ listingId, message: 'Pending listing created' });
    }

    // Route: GET /api/listings - Get all listed items
    if (url === '/api/listings' && method === 'GET') {
      const listings = await Listing.find({ status: 'Listed' });
      return res.json(listings);
    }

    // Route: PUT /api/listings/:listingId - Update listing
    if (url.startsWith('/api/listings/') && method === 'PUT') {
      const listingId = url.split('/')[3];
      const { status, buyer, price, tokenId } = req.body;

      if (status && !['Pending', 'Listed', 'Cancelled'].includes(status))
        return res.status(400).json({ error: 'Invalid status' });

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

      if (!listing)
        return res.status(404).json({ error: 'Listing not found' });

      return res.json({ message: 'Listing updated', listing });
    }

    // Route: GET /api/listings/:listingId - Get listing by ID
    if (url.startsWith('/api/listings/') && method === 'GET' && !url.includes('/collection/')) {
      const listingId = url.split('/')[3];
      const listing = await Listing.findOne({ listingId: parseInt(listingId) });
      
      if (!listing)
        return res.status(404).json({ error: 'Listing not found' });
      
      return res.json(listing);
    }

    // Route: DELETE /api/listings/:listingId - Delete listing
    if (url.startsWith('/api/listings/') && method === 'DELETE') {
      const listingId = url.split('/')[3];
      const { seller } = req.body;

      if (!seller)
        return res.status(400).json({ error: 'Seller address is required' });

      const listing = await Listing.findOne({ listingId: parseInt(listingId) });
      if (!listing)
        return res.status(404).json({ error: 'Listing not found' });

      if (listing.seller.toLowerCase() !== seller.toLowerCase())
        return res.status(403).json({ error: 'Only the seller can delete this listing' });

      await Listing.deleteOne({ listingId: parseInt(listingId) });
      return res.json({ message: 'Listing deleted successfully' });
    }

    // Route: GET /api/listings/collection/:wallet - Get collection by wallet
    if (url.startsWith('/api/listings/collection/') && method === 'GET') {
      const wallet = url.split('/')[4];
      const listings = await Listing.find({
        'purchaseHistory.buyer': wallet,
      });
      return res.json(listings);
    }

    // Route: POST /api/resale-purchases - Record resale purchase
    if (url === '/api/resale-purchases' && method === 'POST') {
      const { listingId, buyer, price, tokenId } = req.body;

      if (!listingId || !buyer || !price || !tokenId)
        return res.status(400).json({ error: 'Missing required fields' });

      const listing = await Listing.findOne({
        'purchaseHistory.tokenId': tokenId,
      });

      if (!listing)
        return res.status(404).json({ error: 'Listing not found' });

      listing.purchaseHistory.push({
        buyer,
        price,
        tokenId,
        timestamp: new Date(),
      });

      await listing.save();
      return res.json({ message: 'Resale purchase recorded' });
    }

    // Route not found
    return res.status(404).json({ error: 'Route not found' });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}
