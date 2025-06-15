const { expect } = require("chai");
const hre = require("hardhat");
const { ethers } = hre;

describe("NFTMarketplace", function () {
  let NFTMarketplace, marketplace, MockNFT, mockNFT;
  let owner, seller, buyer, other;
  const price = ethers.utils.parseEther("1");
  const imageURL = "ipfs://testCID";

  beforeEach(async function () {
    [owner, seller, buyer, other] = await ethers.getSigners();

    // Deploy MockNFT
    MockNFT = await ethers.getContractFactory("MockNFT");
    mockNFT = await MockNFT.deploy();
    await mockNFT.deployed();

    // Deploy NFTMarketplace
    NFTMarketplace = await ethers.getContractFactory("NFTMarketplace");
    marketplace = await NFTMarketplace.deploy();
    await marketplace.deployed();

    // Mint an NFT to seller
    await mockNFT.connect(seller).mint(seller.address, 1);
  });

  describe("listNFT", function () {
    it("should list an NFT", async function () {
      await mockNFT.connect(seller).approve(marketplace.address, 1);
      await expect(marketplace.connect(seller).listNFT(mockNFT.address, 1, price, imageURL))
        .to.emit(marketplace, "NFTListed")
        .withArgs(0, seller.address, mockNFT.address, 1, price, imageURL);

      const listing = await marketplace.listings(0);
      expect(listing.seller).to.equal(seller.address);
      expect(listing.tokenId).to.equal(1);
      expect(listing.price).to.equal(price);
      expect(listing.imageURL).to.equal(imageURL);
      expect(listing.sold).to.be.false;
    });

    it("should fail if not owner", async function () {
      await expect(marketplace.connect(buyer).listNFT(mockNFT.address, 1, price, imageURL))
        .to.be.revertedWith("You are not the owner");
    });
  });

  describe("createAndListNFT", function () {
    it("should create and list a non-ERC721 NFT", async function () {
      await expect(marketplace.connect(seller).createAndListNFT(price, imageURL))
        .to.emit(marketplace, "NFTListed")
        .withArgs(0, seller.address, ethers.constants.AddressZero, 0, price, imageURL);

      const listing = await marketplace.listings(0);
      expect(listing.seller).to.equal(seller.address);
      expect(listing.nftContract).to.equal(ethers.constants.AddressZero);
      expect(listing.tokenId).to.equal(0);
      expect(listing.price).to.equal(price);
      expect(listing.imageURL).to.equal(imageURL);
      expect(listing.sold).to.be.false;
    });
  });

  describe("buyNFT", function () {
    it("should buy an ERC721 NFT", async function () {
      await mockNFT.connect(seller).approve(marketplace.address, 1);
      await marketplace.connect(seller).listNFT(mockNFT.address, 1, price, imageURL);

      await expect(marketplace.connect(buyer).buyNFT(0, { value: price }))
        .to.emit(marketplace, "NFTPurchased")
        .withArgs(0, buyer.address);

      const listing = await marketplace.listings(0);
      expect(listing.sold).to.be.true;
      expect(listing.buyer).to.equal(buyer.address);
      expect(await mockNFT.ownerOf(1)).to.equal(buyer.address);
    });

    it("should buy a non-ERC721 NFT", async function () {
      await marketplace.connect(seller).createAndListNFT(price, imageURL);
      await expect(marketplace.connect(buyer).buyNFT(0, { value: price }))
        .to.emit(marketplace, "NFTPurchased")
        .withArgs(0, buyer.address);

      const listing = await marketplace.listings(0);
      expect(listing.sold).to.be.true;
      expect(listing.buyer).to.equal(buyer.address);
    });

    it("should fail if incorrect price", async function () {
      await marketplace.connect(seller).createAndListNFT(price, imageURL);
      await expect(marketplace.connect(buyer).buyNFT(0, { value: ethers.utils.parseEther("0.5") }))
        .to.be.revertedWith("Incorrect price sent");
    });
  });

  describe("isBuyer", function () {
    it("should return true for buyer", async function () {
      await marketplace.connect(seller).createAndListNFT(price, imageURL);
      await marketplace.connect(buyer).buyNFT(0, { value: price });
      expect(await marketplace.isBuyer(0, buyer.address)).to.be.true;
    });

    it("should return false for non-buyer", async function () {
      await marketplace.connect(seller).createAndListNFT(price, imageURL);
      expect(await marketplace.isBuyer(0, buyer.address)).to.be.false;
    });
  });

  describe("relistNFT", function () {
    it("should relist an NFT", async function () {
      await mockNFT.connect(seller).approve(marketplace.address, 1);
      await marketplace.connect(seller).listNFT(mockNFT.address, 1, price, imageURL);
      await marketplace.connect(buyer).buyNFT(0, { value: price });

      await mockNFT.connect(buyer).approve(marketplace.address, 1);
      const newPrice = ethers.utils.parseEther("2");
      await expect(marketplace.connect(buyer).relistNFT(0, newPrice))
        .to.emit(marketplace, "NFTListed")
        .withArgs(0, buyer.address, mockNFT.address, 1, newPrice, imageURL);

      const listing = await marketplace.listings(0);
      expect(listing.seller).to.equal(buyer.address);
      expect(listing.price).to.equal(newPrice);
      expect(listing.sold).to.be.false;
      expect(listing.buyer).to.equal(ethers.constants.AddressZero);
    });

    it("should fail if not owner", async function () {
      await mockNFT.connect(seller).approve(marketplace.address, 1);
      await marketplace.connect(seller).listNFT(mockNFT.address, 1, price, imageURL);
      await expect(marketplace.connect(other).relistNFT(0, price))
        .to.be.revertedWith("Only the owner can relist");
    });
  });
});