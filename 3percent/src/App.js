import React, { useState, useEffect, useCallback } from "react";
import { BrowserRouter as Router, Route, Routes, Link, useParams } from "react-router-dom";
import axios from "axios";
import { ethers } from "ethers";
import Web3Modal from "web3modal";
import NFTMarketplace from "./NFTMarketplace.json";
import "./AppStyles.css";

const CONTRACT_ADDRESS = "0x49ba56E36bf91E8C3745e95A5229bF2B74b21313";
const BACKEND_URL = "http://localhost:5000/api";

function Header({ walletAddress, setHoveredButton, hoveredButton }) {
  return (
    <header className="header">
      <h1 className="headerTitle">Authentix</h1>
      <div className="headerActions">
        <div className="walletAddress">
          {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : "Not Connected"}
        </div>
        {["/", "/collection", "/admin", "/about", "/how-to-use"].map((path, index) => {
          const labels = ["Marketplace", "My Collection", "Admin", "About", "How to Use"];
          return (
            <Link
              key={path}
              to={path}
              className="adminButton"
              onMouseEnter={() => setHoveredButton(labels[index].toLowerCase())}
              onMouseLeave={() => setHoveredButton(null)}
            >
              {labels[index]}
            </Link>
          );
        })}
      </div>
    </header>
  );
}

function Home() {
  const [listings, setListings] = useState([]);
  const [relistedNFTs, setRelistedNFTs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [walletAddress, setWalletAddress] = useState("");
  const [hoveredButton, setHoveredButton] = useState(null);
  const [error, setError] = useState(null); // Added for better error handling

  const connectWallet = useCallback(async () => {
    try {
      if (!window.ethereum) throw new Error("Please install MetaMask");
      const web3Modal = new Web3Modal();
      const connection = await web3Modal.connect();
      const provider = new ethers.providers.Web3Provider(connection);
      const signer = provider.getSigner();
      const address = await signer.getAddress();
      setWalletAddress(address.toLowerCase());
      return address.toLowerCase();
    } catch (error) {
      console.error("Wallet connection failed:", error);
      setError("Failed to connect wallet. Ensure MetaMask is installed and unlocked.");
      return null;
    }
  }, []);

  const loadListings = useCallback(async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/listings`);
      setListings(response.data);
    } catch (error) {
      console.error("Error loading listings:", error);
      setError("Failed to load listings. Please try again later.");
    }
  }, []);

  const loadRelistedNFTs = useCallback(async () => {
    try {
      const web3Modal = new Web3Modal();
      const connection = await web3Modal.connect();
      const provider = new ethers.providers.Web3Provider(connection);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, NFTMarketplace.abi, provider);
      const relisted = await contract.getRelistedNFTs();
      setRelistedNFTs(
        relisted.map((purchase) => ({
          listingId: purchase.listingId.toString(),
          tokenId: purchase.tokenId.toString(),
          price: ethers.utils.formatEther(purchase.price),
          imageUrl: purchase.imageURL || "https://via.placeholder.com/280", // Fallback for invalid URLs
          seller: purchase.buyer,
        }))
      );
    } catch (error) {
      console.error("Error loading relisted NFTs:", error);
      setError("Failed to load relisted NFTs.");
    }
  }, []);

  const deleteListing = useCallback(
    async (listingId) => {
      try {
        await axios.delete(`${BACKEND_URL}/listings/${listingId}`, {
          data: { seller: walletAddress },
        });
        alert("Listing deleted successfully!");
        loadListings();
      } catch (error) {
        console.error("Error deleting listing:", error);
        alert(error.response?.data?.error || "Failed to delete listing.");
      }
    },
    [walletAddress, loadListings]
  );

  useEffect(() => {
    async function initialize() {
      setLoading(true);
      const address = await connectWallet();
      if (address) {
        await Promise.all([loadListings(), loadRelistedNFTs()]);
      }
      setLoading(false);
    }
    initialize();
  }, [connectWallet, loadListings, loadRelistedNFTs]);

  const buyNFT = useCallback(
    async (listingId, price, imageUrl) => {
      try {
        const web3Modal = new Web3Modal();
        const connection = await web3Modal.connect();
        const provider = new ethers.providers.Web3Provider(connection);
        const signer = provider.getSigner();
        const contract = new ethers.Contract(CONTRACT_ADDRESS, NFTMarketplace.abi, signer);

        const estimatedGas = await contract.estimateGas.buyNFT(listingId, imageUrl, {
          value: ethers.utils.parseEther(price.toString()),
        });
        const tx = await contract.buyNFT(listingId, imageUrl, {
          value: ethers.utils.parseEther(price.toString()),
          gasLimit: estimatedGas.mul(12).div(10), // 20% buffer
        });
        await tx.wait();

        const purchases = await contract.getPurchasesByBuyer(walletAddress);
        const latestPurchase = purchases[purchases.length - 1];
        await axios.put(`${BACKEND_URL}/listings/${listingId}`, {
          buyer: walletAddress,
          price,
          tokenId: latestPurchase.tokenId.toString(),
        });

        alert("NFT Purchased!");
        await Promise.all([loadListings(), loadRelistedNFTs()]);
      } catch (error) {
        console.error("Transaction failed:", error);
        alert(error.reason || error.message || "Failed to purchase NFT.");
      }
    },
    [walletAddress, loadListings, loadRelistedNFTs]
  );

  const buyRelistedNFT = useCallback(
    async (tokenId) => {
      try {
        const web3Modal = new Web3Modal();
        const connection = await web3Modal.connect();
        const provider = new ethers.providers.Web3Provider(connection);
        const signer = provider.getSigner();
        const contract = new ethers.Contract(CONTRACT_ADDRESS, NFTMarketplace.abi, signer);

        const purchase = relistedNFTs.find((nft) => nft.tokenId === tokenId);
        if (!purchase) throw new Error("Relisted NFT not found");

        const estimatedGas = await contract.estimateGas.buyRelistedNFT(tokenId, {
          value: ethers.utils.parseEther(purchase.price),
        });
        const tx = await contract.buyRelistedNFT(tokenId, {
          value: ethers.utils.parseEther(purchase.price),
          gasLimit: estimatedGas.mul(12).div(10),
        });
        await tx.wait();

        await axios.post(`${BACKEND_URL}/resale-purchases`, {
          listingId: purchase.listingId,
          buyer: walletAddress,
          price: purchase.price,
          tokenId,
        });

        alert("Relisted NFT Purchased!");
        loadRelistedNFTs();
      } catch (error) {
        console.error("Transaction failed:", error);
        alert(error.reason || error.message || "Failed to purchase relisted NFT.");
      }
    },
    [walletAddress, relistedNFTs, loadRelistedNFTs]
  );

  return (
    <div className="container">
      <Header walletAddress={walletAddress} setHoveredButton={setHoveredButton} hoveredButton={hoveredButton} />
      <main className="mainContent">
        {error && <div className="errorMessage">{error}</div>}
        {loading ? (
          <div className="loadingContainer">
            <div className="spinner"></div>
          </div>
        ) : listings.length === 0 && relistedNFTs.length === 0 ? (
          <div className="emptyState">
            <h2 className="emptyStateTitle">No NFTs available.</h2>
            <p className="emptyStateText">Visit the Admin page to list some!</p>
            <Link
              to="/admin"
              className="emptyStateButton"
              onMouseEnter={() => setHoveredButton("emptyAdmin")}
              onMouseLeave={() => setHoveredButton(null)}
            >
              Go to Admin
            </Link>
          </div>
        ) : (
          <div className="cardGrid">
            {listings.map((listing) => (
              <div key={listing.listingId} className="card">
                <Link to={`/product/${listing.listingId}`} style={{ textDecoration: "none" }}>
                  <div className="imageContainer">
                    <img
                      src={listing.imageUrls?.[0] || "https://via.placeholder.com/280"}
                      alt={listing.productName}
                      className="image"
                    />
                  </div>
                  <div className="cardContent">
                    <div className="cardHeader">
                      <div className="tokenId">{listing.productName}</div>
                      <div className="price">{listing.price} ETH</div>
                    </div>
                    <div className="sellerInfo">
                      <div className="address">
                        Seller: {listing.seller.slice(0, 6)}...{listing.seller.slice(-4)}
                      </div>
                    </div>
                  </div>
                </Link>
                <div className="cardActions">
                  <button
                    onClick={() => buyNFT(listing.listingId, listing.price, listing.imageUrls?.[0])}
                    className={`buyButton ${hoveredButton === `buy-${listing.listingId}` ? "buyButtonHover" : ""}`}
                    onMouseEnter={() => setHoveredButton(`buy-${listing.listingId}`)}
                    onMouseLeave={() => setHoveredButton(null)}
                    disabled={!walletAddress}
                  >
                    Buy Now
                  </button>
                  {walletAddress?.toLowerCase() === listing.seller.toLowerCase() && (
                    <button
                      onClick={() => deleteListing(listing.listingId)}
                      className={`editButton ${hoveredButton === `delete-${listing.listingId}` ? "editButtonHover" : ""}`}
                      onMouseEnter={() => setHoveredButton(`delete-${listing.listingId}`)}
                      onMouseLeave={() => setHoveredButton(null)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
            {relistedNFTs.map((nft) => (
              <div key={nft.tokenId} className="card">
                <Link to={`/product/${nft.listingId}`} style={{ textDecoration: "none" }}>
                  <div className="imageContainer">
                    <img src={nft.imageUrl} alt={`NFT ${nft.tokenId}`} className="image" />
                    <div className="statusBadge">Relisted</div>
                  </div>
                  <div className="cardContent">
                    <div className="cardHeader">
                      <div className="tokenId">Token ID: {nft.tokenId}</div>
                      <div className="price">{nft.price} ETH</div>
                    </div>
                    <div className="sellerInfo">
                      <div className="address">
                        Seller: {nft.seller.slice(0, 6)}...{nft.seller.slice(-4)}
                      </div>
                    </div>
                  </div>
                </Link>
                <div className="cardActions">
                  <button
                    onClick={() => buyRelistedNFT(nft.tokenId)}
                    className={`buyButton ${hoveredButton === `buy-relisted-${nft.tokenId}` ? "buyButtonHover" : ""}`}
                    onMouseEnter={() => setHoveredButton(`buy-relisted-${nft.tokenId}`)}
                    onMouseLeave={() => setHoveredButton(null)}
                    disabled={!walletAddress}
                  >
                    Buy Now
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function ProductDetails() {
  const { listingId } = useParams();
  const [details, setDetails] = useState(null);
  const [isRelisted, setIsRelisted] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [hoveredButton, setHoveredButton] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const connectWallet = useCallback(async () => {
    try {
      if (!window.ethereum) throw new Error("Please install MetaMask");
      const web3Modal = new Web3Modal();
      const connection = await web3Modal.connect();
      const provider = new ethers.providers.Web3Provider(connection);
      const signer = provider.getSigner();
      const address = await signer.getAddress();
      setWalletAddress(address.toLowerCase());
      return address.toLowerCase();
    } catch (error) {
      console.error("Wallet connection failed:", error);
      setError("Failed to connect wallet. Ensure MetaMask is installed and unlocked.");
      return null;
    }
  }, []);

  const fetchDetails = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${BACKEND_URL}/listings/${listingId}`);
      setDetails(response.data);
      setIsRelisted(false);
    } catch (error) {
      try {
        const web3Modal = new Web3Modal();
        const connection = await web3Modal.connect();
        const provider = new ethers.providers.Web3Provider(connection);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, NFTMarketplace.abi, provider);
        const relisted = await contract.getRelistedNFTs();
        const relistedNFT = relisted.find((nft) => nft.listingId.toString() === listingId);
        if (relistedNFT) {
          setDetails({
            listingId: relistedNFT.listingId.toString(),
            tokenId: relistedNFT.tokenId.toString(),
            price: ethers.utils.formatEther(relistedNFT.price),
            imageUrls: [relistedNFT.imageURL || "https://via.placeholder.com/400"],
            seller: relistedNFT.buyer,
            productName: `NFT ${relistedNFT.tokenId}`,
            productDescription: "Relisted NFT",
            productCategory: "Unknown",
            saleType: "Resell",
          });
          setIsRelisted(true);
        } else {
          throw new Error("Listing not found");
        }
      } catch (relistError) {
        console.error("Error fetching details:", relistError);
        setError("Listing not found.");
      }
    }
    setLoading(false);
  }, [listingId]);

  useEffect(() => {
    async function initialize() {
      const address = await connectWallet();
      if (address) await fetchDetails();
    }
    initialize();
  }, [connectWallet, fetchDetails]);

  const buyNFT = useCallback(async () => {
    try {
      const web3Modal = new Web3Modal();
      const connection = await web3Modal.connect();
      const provider = new ethers.providers.Web3Provider(connection);
      const signer = provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, NFTMarketplace.abi, signer);

      let tx;
      if (isRelisted) {
        const estimatedGas = await contract.estimateGas.buyRelistedNFT(details.tokenId, {
          value: ethers.utils.parseEther(details.price.toString()),
        });
        tx = await contract.buyRelistedNFT(details.tokenId, {
          value: ethers.utils.parseEther(details.price.toString()),
          gasLimit: estimatedGas.mul(12).div(10),
        });
        await tx.wait();
        await axios.post(`${BACKEND_URL}/resale-purchases`, {
          listingId: details.listingId,
          buyer: walletAddress,
          price: details.price,
          tokenId: details.tokenId,
        });
        alert("Relisted NFT Purchased!");
      } else {
        const estimatedGas = await contract.estimateGas.buyNFT(details.listingId, details.imageUrls[0], {
          value: ethers.utils.parseEther(details.price.toString()),
        });
        tx = await contract.buyNFT(details.listingId, details.imageUrls[0], {
          value: ethers.utils.parseEther(details.price.toString()),
          gasLimit: estimatedGas.mul(12).div(10),
        });
        await tx.wait();
        const purchases = await contract.getPurchasesByBuyer(walletAddress);
        const latestPurchase = purchases[purchases.length - 1];
        await axios.put(`${BACKEND_URL}/listings/${details.listingId}`, {
          buyer: walletAddress,
          price: details.price,
          tokenId: latestPurchase.tokenId.toString(),
        });
        alert("NFT Purchased!");
      }
    } catch (error) {
      console.error("Transaction failed:", error);
      alert(error.reason || error.message || "Failed to purchase NFT.");
    }
  }, [details, isRelisted, walletAddress]);

  if (loading) {
    return (
      <div className="container">
        <Header walletAddress={walletAddress} setHoveredButton={setHoveredButton} hoveredButton={hoveredButton} />
        <div className="loadingContainer">
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="container">
        <Header walletAddress={walletAddress} setHoveredButton={setHoveredButton} hoveredButton={hoveredButton} />
        <div className="emptyState">
          <h2 className="emptyStateTitle">{error || "Product Not Found"}</h2>
          <Link to="/" className="emptyStateButton">
            Back to Marketplace
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <Header walletAddress={walletAddress} setHoveredButton={setHoveredButton} hoveredButton={hoveredButton} />
      <main className="productDetailsContainer">
        <div className="productDetailsContent">
          <div className="productImageContainer">
            <img
              src={details.imageUrls?.[0] || "https://via.placeholder.com/400"}
              alt={details.productName}
              className="productImage"
            />
            {isRelisted && <div className="statusBadge">Relisted</div>}
          </div>
          <div className="productInfo">
            <h1 className="productTitle">{details.productName}</h1>
            <p className="productDescription">{details.productDescription || "No description available"}</p>
            <div className="productMeta">
              <p><strong>Price:</strong> {details.price} ETH</p>
              <p><strong>Category:</strong> {details.productCategory || "Unknown"}</p>
              <p><strong>Sale Type:</strong> {details.saleType || "Unknown"}</p>
              <p><strong>Seller:</strong> {details.seller.slice(0, 6)}...{details.seller.slice(-4)}</p>
              {details.tokenId && <p><strong>Token ID:</strong> {details.tokenId}</p>}
              <p><strong>Listing ID:</strong> {details.listingId}</p>
            </div>
            <button
              onClick={buyNFT}
              className={`buyButton ${hoveredButton === "buy-details" ? "buyButtonHover" : ""}`}
              onMouseEnter={() => setHoveredButton("buy-details")}
              onMouseLeave={() => setHoveredButton(null)}
              disabled={!walletAddress}
            >
              Buy Now
            </button>
            <Link to="/" className="backButton">
              Back to Marketplace
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function Admin() {
  const [walletAddress, setWalletAddress] = useState("");
  const [productName, setProductName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [productCategory, setProductCategory] = useState("Sneakers");
  const [price, setPrice] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [saleType, setSaleType] = useState("Resell");
  const [hoveredButton, setHoveredButton] = useState(null);
  const [error, setError] = useState(null);

  const connectWallet = useCallback(async () => {
    try {
      if (!window.ethereum) throw new Error("Please install MetaMask");
      const web3Modal = new Web3Modal();
      const connection = await web3Modal.connect();
      const provider = new ethers.providers.Web3Provider(connection);
      const signer = provider.getSigner();
      const address = await signer.getAddress();
      setWalletAddress(address.toLowerCase());
      return address.toLowerCase();
    } catch (error) {
      console.error("Wallet connection failed:", error);
      setError("Failed to connect wallet. Ensure MetaMask is installed and unlocked.");
      return null;
    }
  }, []);

  useEffect(() => {
    connectWallet();
  }, [connectWallet]);

  const listProduct = useCallback(async () => {
    if (!productName || !productDescription || !price || !imageUrl || !walletAddress) {
      setError("Please fill all fields");
      return;
    }
    if (isNaN(price) || parseFloat(price) <= 0) {
      setError("Price must be a positive number");
      return;
    }
    try {
      const response = await axios.post(`${BACKEND_URL}/listings`, {
        productName,
        productDescription,
        productCategory,
        price: parseFloat(price),
        imageUrls: [imageUrl],
        seller: walletAddress,
        saleType,
      });

      const { listingId } = response.data;
      await axios.put(`${BACKEND_URL}/listings/${listingId}`, { status: "Listed" });

      setProductName("");
      setProductDescription("");
      setProductCategory("Sneakers");
      setPrice("");
      setImageUrl("");
      setSaleType("Resell");
      setError(null);
      alert("Product Listed Successfully!");
    } catch (error) {
      console.error("Error listing product:", error);
      setError(error.response?.data?.error || "Failed to list product.");
    }
  }, [productName, productDescription, productCategory, price, imageUrl, saleType, walletAddress]);

  return (
    <div className="container">
      <Header walletAddress={walletAddress} setHoveredButton={setHoveredButton} hoveredButton={hoveredButton} />
      <main className="adminContainer">
        <div className="formContainer">
          <h1 className="formTitle">List New Product</h1>
          {error && <div className="errorMessage">{error}</div>}
          <div className="formContent">
            <div className="formGroup">
              <label className="label">Product Name</label>
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className="input"
                placeholder="Enter product name"
              />
            </div>
            <div className="formGroup">
              <label className="label">Description</label>
              <textarea
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value)}
                className="input"
                placeholder="Enter product description"
              />
            </div>
            <div className="formGroup">
              <label className="label">Category</label>
              <select
                value={productCategory}
                onChange={(e) => setProductCategory(e.target.value)}
                className="input"
              >
                <option value="Sneakers">Sneakers</option>
                <option value="Apparel">Apparel</option>
                <option value="Watches">Watches</option>
              </select>
            </div>
            <div className="formGroup">
              <label className="label">Price (ETH)</label>
              <input
                type="text"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="input"
                placeholder="0.05"
              />
            </div>
            <div className="formGroup">
              <label className="label">Image URL</label>
              <input
                type="text"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="input"
                placeholder="https://example.com/image.jpg"
              />
            </div>
            <div className="formGroup">
              <label className="label">Sale Type</label>
              <select value={saleType} onChange={(e) => setSaleType(e.target.value)} className="input">
                <option value="Retail">Retail</option>
                <option value="Resell">Resell</option>
              </select>
            </div>
            <button
              onClick={listProduct}
              className={`buyButton ${hoveredButton === "list" ? "buyButtonHover" : ""}`}
              onMouseEnter={() => setHoveredButton("list")}
              onMouseLeave={() => setHoveredButton(null)}
              disabled={!productName || !productDescription || !price || !imageUrl || !walletAddress}
            >
              List Product
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function Collection() {
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [walletAddress, setWalletAddress] = useState("");
  const [hoveredButton, setHoveredButton] = useState(null);
  const [relistPrice, setRelistPrice] = useState({});
  const [relisting, setRelisting] = useState({});
  const [error, setError] = useState(null);

  const connectWallet = useCallback(async () => {
    try {
      if (!window.ethereum) throw new Error("Please install MetaMask");
      const web3Modal = new Web3Modal();
      const connection = await web3Modal.connect();
      const provider = new ethers.providers.Web3Provider(connection);
      const signer = provider.getSigner();
      const address = await signer.getAddress();
      setWalletAddress(address.toLowerCase());
      return address.toLowerCase();
    } catch (error) {
      console.error("Wallet connection failed:", error);
      setError("Failed to connect wallet. Ensure MetaMask is installed and unlocked.");
      return null;
    }
  }, []);

  const loadPurchases = useCallback(
    async (address) => {
      if (!address) return;
      setLoading(true);
      try {
        const web3Modal = new Web3Modal();
        const connection = await web3Modal.connect();
        const provider = new ethers.providers.Web3Provider(connection);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, NFTMarketplace.abi, provider);
        const contractPurchases = await contract.getPurchasesByBuyer(address);

        const response = await axios.get(`${BACKEND_URL}/listings/collection/${address}`);
        const listings = response.data;

        const purchases = contractPurchases.map((purchase) => {
          const listing = listings.find((l) => l.listingId === purchase.listingId.toString()) || {};
          return {
            listingId: purchase.listingId.toString(),
            productName: listing.productName || `NFT ${purchase.tokenId}`,
            price: ethers.utils.formatEther(purchase.price),
            tokenId: purchase.tokenId.toString(),
            imageUrl: purchase.imageURL || "https://via.placeholder.com/280",
            timestamp: purchase.timestamp.toString(),
            isListed: purchase.isListed,
          };
        });
        setPurchases(purchases);
      } catch (error) {
        console.error("Error loading purchases:", error);
        setError("Failed to load collection.");
      }
      setLoading(false);
    },
    []
  );

  const relistNFT = useCallback(
    async (listingId, tokenId, imageUrl, newPrice) => {
      if (!newPrice || isNaN(newPrice) || parseFloat(newPrice) <= 0) {
        setError("Please enter a valid price");
        return;
      }
      try {
        setRelisting((prev) => ({ ...prev, [tokenId]: true }));
        const web3Modal = new Web3Modal();
        const connection = await web3Modal.connect();
        const provider = new ethers.providers.Web3Provider(connection);
        const signer = provider.getSigner();
        const contract = new ethers.Contract(CONTRACT_ADDRESS, NFTMarketplace.abi, signer);

        const priceInWei = ethers.utils.parseEther(newPrice.toString());
        const estimatedGas = await contract.estimateGas.relistNFT(tokenId, listingId, priceInWei);
        const tx = await contract.relistNFT(tokenId, listingId, priceInWei, {
          gasLimit: estimatedGas.mul(12).div(10),
        });
        await tx.wait();

        setRelistPrice((prev) => ({ ...prev, [tokenId]: "" }));
        alert("NFT Relisted Successfully!");
        loadPurchases(walletAddress);
      } catch (error) {
        console.error("Error relisting NFT:", error);
        setError(error.reason || error.message || "Failed to relist NFT.");
      } finally {
        setRelisting((prev) => ({ ...prev, [tokenId]: false }));
      }
    },
    [loadPurchases, walletAddress]
  );

  useEffect(() => {
    async function initialize() {
      const address = await connectWallet();
      if (address) await loadPurchases(address);
    }
    initialize();
  }, [connectWallet, loadPurchases]);

  return (
    <div className="container">
      <Header walletAddress={walletAddress} setHoveredButton={setHoveredButton} hoveredButton={hoveredButton} />
      <main className="mainContent">
        {error && <div className="errorMessage">{error}</div>}
        {loading ? (
          <div className="loadingContainer">
            <div className="spinner"></div>
          </div>
        ) : purchases.length === 0 ? (
          <div className="emptyState">
            <h2 className="emptyStateTitle">No NFTs in your collection.</h2>
            <p className="emptyStateText">Visit the Marketplace to buy some!</p>
            <Link
              to="/"
              className="emptyStateButton"
              onMouseEnter={() => setHoveredButton("emptyMarketplace")}
              onMouseLeave={() => setHoveredButton(null)}
            >
              Go to Marketplace
            </Link>
          </div>
        ) : (
          <div className="cardGrid">
            {purchases.map((purchase) => (
              <div key={`${purchase.listingId}-${purchase.tokenId}`} className="card">
                <div className="imageContainer">
                  <img src={purchase.imageUrl} alt={purchase.productName} className="image" />
                  {purchase.isListed && <div className="statusBadge">Listed</div>}
                </div>
                <div className="cardContent">
                  <div className="cardHeader">
                    <div className="tokenId">{purchase.productName}</div>
                    <div className="price">Purchased for {purchase.price} ETH</div>
                  </div>
                  <div className="sellerInfo">
                    <div className="address">Token ID: {purchase.tokenId}</div>
                  </div>
                  {!purchase.isListed && (
                    <div className="relistSection">
                      <input
                        type="text"
                        placeholder="New Price (ETH)"
                        value={relistPrice[purchase.tokenId] || ""}
                        onChange={(e) =>
                          setRelistPrice((prev) => ({ ...prev, [purchase.tokenId]: e.target.value }))
                        }
                        className="input"
                        style={{ marginBottom: "8px" }}
                      />
                      <button
                        onClick={() =>
                          relistNFT(purchase.listingId, purchase.tokenId, purchase.imageUrl, relistPrice[purchase.tokenId])
                        }
                        disabled={relisting[purchase.tokenId] || !relistPrice[purchase.tokenId]}
                        className={`buyButton ${hoveredButton === `relist-${purchase.tokenId}` ? "buyButtonHover" : ""}`}
                        onMouseEnter={() => setHoveredButton(`relist-${purchase.tokenId}`)}
                        onMouseLeave={() => setHoveredButton(null)}
                      >
                        {relisting[purchase.tokenId] ? "Relisting..." : "Relist NFT"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function About() {
  const [walletAddress, setWalletAddress] = useState("");
  const [hoveredButton, setHoveredButton] = useState(null);
  const [error, setError] = useState(null);

  const connectWallet = useCallback(async () => {
    try {
      if (!window.ethereum) throw new Error("Please install MetaMask");
      const web3Modal = new Web3Modal();
      const connection = await web3Modal.connect();
      const provider = new ethers.providers.Web3Provider(connection);
      const signer = provider.getSigner();
      const address = await signer.getAddress();
      setWalletAddress(address.toLowerCase());
    } catch (error) {
      console.error("Wallet connection failed:", error);
      setError("Failed to connect wallet. Ensure MetaMask is installed and unlocked.");
    }
  }, []);

  useEffect(() => {
    connectWallet();
  }, [connectWallet]);

  return (
    <div className="container">
      <Header walletAddress={walletAddress} setHoveredButton={setHoveredButton} hoveredButton={hoveredButton} />
      <main className="aboutContainer">
        {error && <div className="errorMessage">{error}</div>}
        <div className="aboutHero">
          <h1 className="aboutTitle">About Authentix</h1>
          <p className="aboutSubtitle">Your Trusted Decentralized NFT Marketplace</p>
        </div>
        <div className="aboutContent">
          <div className="aboutSection">
            <h2 className="sectionTitle">Our Mission</h2>
            <p className="sectionText">
              Authentix is dedicated to providing a secure, transparent platform for buying, selling, and trading NFTs.
              Leveraging blockchain technology, we ensure authenticity and ownership for every digital asset.
            </p>
          </div>
          <div className="aboutSection">
            <h2 className="sectionTitle">Features</h2>
            <div className="featureGrid">
              <div className="featureCard">
                <h3>Secure Transactions</h3>
                <p>Smart contracts ensure safe and trustless NFT purchases.</p>
              </div>
              <div className="featureCard">
                <h3>Easy Listing</h3>
                <p>List your NFTs with a simple, user-friendly interface.</p>
              </div>
              <div className="featureCard">
                <h3>Relisting Options</h3>
                <p>Resell your purchased NFTs with flexible pricing.</p>
              </div>
            </div>
          </div>
          <div className="ctaSection">
            <h2 className="ctaTitle">Join the Authentix Community</h2>
            <p className="ctaText">Start exploring, buying, and selling NFTs today!</p>
            <Link to="/" className="ctaButton">
              Explore Marketplace
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function HowToUse() {
  const [walletAddress, setWalletAddress] = useState("");
  const [hoveredButton, setHoveredButton] = useState(null);
  const [error, setError] = useState(null);

  const connectWallet = useCallback(async () => {
    try {
      if (!window.ethereum) throw new Error("Please install MetaMask");
      const web3Modal = new Web3Modal();
      const connection = await web3Modal.connect();
      const provider = new ethers.providers.Web3Provider(connection);
      const signer = provider.getSigner();
      const address = await signer.getAddress();
      setWalletAddress(address.toLowerCase());
    } catch (error) {
      console.error("Wallet connection failed:", error);
      setError("Failed to connect wallet. Ensure MetaMask is installed and unlocked.");
    }
  }, []);

  useEffect(() => {
    connectWallet();
  }, [connectWallet]);

  return (
    <div className="container">
      <Header walletAddress={walletAddress} setHoveredButton={setHoveredButton} hoveredButton={hoveredButton} />
      <main className="howToUseContainer">
        {error && <div className="errorMessage">{error}</div>}
        <div className="howToUseHero">
          <h1 className="howToUseTitle">How to Use Authentix</h1>
          <p className="howToUseSubtitle">Get started with our NFT marketplace in a few simple steps</p>
        </div>
        <div className="stepsContainer">
          <div className="stepCard">
            <div className="stepNumber">1</div>
            <div className="stepContent">
              <h3>Connect Your Wallet</h3>
              <p>Use a Web3 wallet like MetaMask to connect to Authentix.</p>
            </div>
          </div>
          <div className="stepCard">
            <div className="stepNumber">2</div>
            <div className="stepContent">
              <h3>List or Buy NFTs</h3>
              <p>
                Visit the <Link to="/admin" className="stepLink">Admin</Link> page to list your NFTs or browse the{" "}
                <Link to="/" className="stepLink">Marketplace</Link> to purchase.
              </p>
            </div>
          </div>
          <div className="stepCard">
            <div className="stepNumber">3</div>
            <div className="stepContent">
              <h3>Manage Your Collection</h3>
              <p>
                View and relist your NFTs in your <Link to="/collection" className="stepLink">Collection</Link>.
              </p>
            </div>
          </div>
        </div>
        <div className="troubleshooting">
          <h2 className="troubleshootingTitle">Troubleshooting</h2>
          <div className="troubleshootingContent">
            <div className="issueCard">
              <h3>Wallet Not Connecting</h3>
              <p>Ensure MetaMask is installed and unlocked. Try refreshing the page.</p>
            </div>
            <div className="issueCard">
              <h3>Transaction Failed</h3>
              <p>Check your ETH balance and ensure sufficient gas fees.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/collection" element={<Collection />} />
        <Route path="/about" element={<About />} />
        <Route path="/how-to-use" element={<HowToUse />} />
        <Route path="/product/:listingId" element={<ProductDetails />} />
      </Routes>
    </Router>
  );
}

export default App;