// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract NFTMarketplace is ERC721, ReentrancyGuard {
    uint256 private _tokenIds;
    uint256 private _listingIds;

    struct Listing {
        uint256 listingId;
        uint256 tokenId;
        address seller;
        uint256 price;
        bool active;
    }

    struct ResaleListing {
        uint256 listingId;
        uint256 tokenId;
        address seller;
        uint256 price;
        bool active;
    }

    mapping(uint256 => Listing) public listings;
    mapping(uint256 => ResaleListing) public resaleListings;
    mapping(address => uint256[]) private buyerPurchases;

    event NFTListed(uint256 indexed listingId, uint256 indexed tokenId, address seller, uint256 price);
    event NFTBought(uint256 indexed listingId, uint256 indexed tokenId, address buyer, uint256 price);
    event NFTResaleListed(uint256 indexed listingId, uint256 indexed tokenId, address seller, uint256 price);
    event NFTResaleBought(uint256 indexed listingId, uint256 indexed tokenId, address buyer, uint256 price);
    event ListingCancelled(uint256 indexed listingId, uint256 indexed tokenId);

    constructor() ERC721("VeriFiNFT", "VFNT") {
        _tokenIds = 0;
        _listingIds = 0;
    }

    function listNFT(uint256 price) external nonReentrant returns (uint256) {
        require(price > 0, "Price must be greater than zero");

        _tokenIds++;
        uint256 tokenId = _tokenIds;
        _listingIds++;
        uint256 listingId = _listingIds;

        _mint(msg.sender, tokenId);
        listings[listingId] = Listing(listingId, tokenId, msg.sender, price, true);

        emit NFTListed(listingId, tokenId, msg.sender, price);
        return listingId;
    }

    function buyNFT(uint256 listingId) external payable nonReentrant {
        Listing storage listing = listings[listingId];
        require(listing.active, "Listing is not active");
        require(msg.value >= listing.price, "Insufficient payment");

        address seller = listing.seller;
        uint256 tokenId = listing.tokenId;

        listing.active = false;
        _transfer(seller, msg.sender, tokenId);
        buyerPurchases[msg.sender].push(tokenId);

        payable(seller).transfer(listing.price);
        if (msg.value > listing.price) {
            payable(msg.sender).transfer(msg.value - listing.price);
        }

        emit NFTBought(listingId, tokenId, msg.sender, listing.price);
    }

    function listNFTForResale(uint256 tokenId, uint256 price) external nonReentrant returns (uint256) {
        require(ownerOf(tokenId) == msg.sender, "Not the owner");
        require(price > 0, "Price must be greater than zero");

        _listingIds++;
        uint256 listingId = _listingIds;

        resaleListings[listingId] = ResaleListing(listingId, tokenId, msg.sender, price, true);
        _setApprovalForAll(msg.sender, address(this), true);

        emit NFTResaleListed(listingId, tokenId, msg.sender, price);
        return listingId;
    }

    function buyResaleNFT(uint256 listingId) external payable nonReentrant {
        ResaleListing storage listing = resaleListings[listingId];
        require(listing.active, "Resale listing is not active");
        require(msg.value >= listing.price, "Insufficient payment");

        address seller = listing.seller;
        uint256 tokenId = listing.tokenId;

        listing.active = false;
        _transfer(seller, msg.sender, tokenId);
        buyerPurchases[msg.sender].push(tokenId);

        payable(seller).transfer(listing.price);
        if (msg.value > listing.price) {
            payable(msg.sender).transfer(msg.value - listing.price);
        }

        emit NFTResaleBought(listingId, tokenId, msg.sender, listing.price);
    }

    function cancelListing(uint256 listingId, bool isResale) external nonReentrant {
        if (isResale) {
            ResaleListing storage listing = resaleListings[listingId];
            require(listing.seller == msg.sender, "Not the seller");
            require(listing.active, "Listing is not active");
            listing.active = false;
            emit ListingCancelled(listingId, listing.tokenId);
        } else {
            Listing storage listing = listings[listingId];
            require(listing.seller == msg.sender, "Not the seller");
            require(listing.active, "Listing is not active");
            listing.active = false;
            emit ListingCancelled(listingId, listing.tokenId);
        }
    }

    function getPurchasesByBuyer(address buyer) external view returns (uint256[] memory) {
        return buyerPurchases[buyer];
    }

    function getActiveResaleListings() external view returns (ResaleListing[] memory) {
        uint256 activeCount = 0;
        for (uint256 i = 1; i <= _listingIds; i++) {
            if (resaleListings[i].active) {
                activeCount++;
            }
        }

        ResaleListing[] memory activeListings = new ResaleListing[](activeCount);
        uint256 index = 0;
        for (uint256 i = 1; i <= _listingIds; i++) {
            if (resaleListings[i].active) {
                activeListings[index] = resaleListings[i];
                index++;
            }
        }
        return activeListings;
    }
}
