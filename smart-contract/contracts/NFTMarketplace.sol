// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract NFTMarketplace is Ownable {
    struct Listing {
        address seller;
        address buyer;        // Added buyer field
        address nftContract;
        uint256 tokenId;
        uint256 price;
        string imageURL;
        bool sold;
        bool redeemed;
    }

    mapping(uint256 => Listing) public listings;
    uint256 public listingCount;

    event NFTListed(uint256 indexed listingId, address indexed seller, address indexed nftContract, uint256 tokenId, uint256 price, string imageURL);
    event NFTPurchased(uint256 indexed listingId, address indexed buyer);
    event NFTRedeemed(uint256 indexed listingId, address indexed redeemer);

    function listNFT(address _nftContract, uint256 _tokenId, uint256 _price, string memory _imageURL) external {
        IERC721 nft = IERC721(_nftContract);
        require(nft.ownerOf(_tokenId) == msg.sender, "You are not the owner");
        require(nft.getApproved(_tokenId) == address(this), "Contract not approved");

        listings[listingCount] = Listing(msg.sender, address(0), _nftContract, _tokenId, _price, _imageURL, false, false);
        emit NFTListed(listingCount, msg.sender, _nftContract, _tokenId, _price, _imageURL);
        listingCount++;
    }

    function createAndListNFT(uint256 _price, string memory _imageURL) external {
        listings[listingCount] = Listing(
            msg.sender,
            address(0),       // Initialize buyer as zero address
            address(0),
            listingCount,
            _price,
            _imageURL,
            false,
            false
        );

        emit NFTListed(listingCount, msg.sender, address(0), listingCount, _price, _imageURL);
        listingCount++;
    }

    function buyNFT(uint256 _listingId) external payable {
        Listing storage listing = listings[_listingId];
        require(!listing.sold, "NFT already sold");
        require(msg.value == listing.price, "Incorrect price");

        listing.sold = true;
        listing.buyer = msg.sender;  // Set the buyer address
        payable(listing.seller).transfer(msg.value);
        
        if (listing.nftContract != address(0)) {
            IERC721(listing.nftContract).safeTransferFrom(listing.seller, msg.sender, listing.tokenId);
        }

        emit NFTPurchased(_listingId, msg.sender);
    }

    function redeemNFT(uint256 _listingId) external {
        Listing storage listing = listings[_listingId];
        require(listing.sold, "NFT must be purchased first");
        require(!listing.redeemed, "NFT already redeemed");
        require(msg.sender == listing.buyer, "Only the buyer can redeem");  // Added check

        listing.redeemed = true;
        emit NFTRedeemed(_listingId, msg.sender);
    }
    
    // Optional: Add a function to check if an address is the buyer of a specific NFT
    function isBuyer(uint256 _listingId, address _address) external view returns (bool) {
        return listings[_listingId].buyer == _address;
    }
}