const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTMarketplace", function () {
  let NFTMarketplace, marketplace, nftMock, owner, seller, buyer;

  beforeEach(async function () {
    [owner, seller, buyer] = await ethers.getSigners();

    // Deploy NFT Marketplace
    NFTMarketplace = await ethers.getContractFactory("NFTMarketplace");
    marketplace = await NFTMarketplace.deploy();
    await marketplace.deployed();

    // Deploy a mock ERC721 contract
    const ERC721Mock = await ethers.getContractFactory("ERC721Mock");
    nftMock = await ERC721Mock.deploy("MockNFT", "MNFT");
    await nftMock.deployed();

    // Mint an NFT to the seller
    await nftMock.connect(seller).mint(1);
  });

  it("Should allow seller to list NFT", async function () {
    await nftMock.connect(seller).approve(marketplace.address, 1);
    await marketplace.connect(seller).listNFT(nftMock.address, 1, ethers.utils.parseEther("1"));

    const listing = await marketplace.listings(0);
    expect(listing.seller).to.equal(seller.address);
    expect(listing.price).to.equal(ethers.utils.parseEther("1"));
  });

  it("Should allow buyer to purchase NFT", async function () {
    await nftMock.connect(seller).approve(marketplace.address, 1);
    await marketplace.connect(seller).listNFT(nftMock.address, 1, ethers.utils.parseEther("1"));

    await marketplace.connect(buyer).buyNFT(0, { value: ethers.utils.parseEther("1") });

    const listing = await marketplace.listings(0);
    expect(listing.sold).to.be.true;
    expect(await nftMock.ownerOf(1)).to.equal(buyer.address);
  });

  it("Should allow NFT to be redeemed", async function () {
    await nftMock.connect(seller).approve(marketplace.address, 1);
    await marketplace.connect(seller).listNFT(nftMock.address, 1, ethers.utils.parseEther("1"));
    await marketplace.connect(buyer).buyNFT(0, { value: ethers.utils.parseEther("1") });

    await marketplace.connect(buyer).redeemNFT(0);
    const listing = await marketplace.listings(0);
    expect(listing.redeemed).to.be.true;
  });
});
