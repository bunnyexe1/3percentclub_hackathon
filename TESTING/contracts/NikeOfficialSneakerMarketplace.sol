// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

contract NikeOfficialSneakerMarketplace is Ownable {
    constructor(address _nikeTreasury) Ownable(msg.sender) {
        nikeTreasury = _nikeTreasury;
    }

    // Nike's treasury address for royalties
    address public nikeTreasury;
    uint256 public constant ROYALTY_PERCENTAGE = 5; // 5% royalty on resales

    // Struct to represent a sneaker model
    struct Model {
        string sneakerModel;
        uint256 totalSupply;
        uint256 currentSupply;
        bool exists;
    }

    // Struct to represent a sneaker NFT
    struct Sneaker {
        address seller;
        address buyer;
        uint256 tokenId;
        uint256 modelId;
        uint256 price;
        string imageURL;
        bool sold;
        bool active;
    }

    // Struct to store purchase history
    struct Purchase {
        uint256 tokenId;
        address buyer;
        address seller;
        uint256 price;
        uint256 timestamp;
    }

    // Mappings
    mapping(uint256 => Sneaker) public sneakers;               // Token ID to Sneaker details
    mapping(uint256 => Purchase[]) public purchaseHistory;     // Token ID to purchase history
    mapping(uint256 => uint256) public purchaseCount;          // Number of purchases per token
    mapping(string => uint256) public modelNameToId;           // Model name to Model ID
    mapping(uint256 => Model) public models;                   // Model ID to Model details
    mapping(uint256 => uint256[]) public modelToTokens;        // Model ID to list of token IDs
    uint256 public modelCount;                                 // Total number of models
    uint256 public sneakerCount;                               // Total number of sneakers

    // Events
    event ModelCreated(
        uint256 indexed modelId,
        string sneakerModel,
        uint256 totalSupply,
        uint256 timestamp
    );

    event SneakerListed(
        uint256 indexed tokenId,
        uint256 indexed modelId,
        address indexed seller,
        uint256 price,
        string imageURL,
        uint256 timestamp
    );

    event SneakerPurchased(
        uint256 indexed tokenId,
        address indexed buyer,
        address indexed seller,
        uint256 price,
        uint256 royaltyPaid,
        uint256 timestamp
    );

    event SneakerRelisted(
        uint256 indexed tokenId,
        address indexed seller,
        uint256 newPrice,
        uint256 timestamp
    );

    event SneakerDeactivated(
        uint256 indexed tokenId,
        uint256 timestamp
    );

    // Create a new sneaker model (Nike only)
    function createSneakerModel(
        string memory _sneakerModel,
        uint256 _totalSupply
    ) external onlyOwner {
        require(bytes(_sneakerModel).length > 0, "Sneaker model cannot be empty");
        require(_totalSupply > 0, "Total supply must be greater than 0");
        require(modelNameToId[_sneakerModel] == 0, "Model already exists");

        models[modelCount] = Model(
            _sneakerModel,
            _totalSupply,
            0,
            true
        );
        modelNameToId[_sneakerModel] = modelCount;

        emit ModelCreated(modelCount, _sneakerModel, _totalSupply, block.timestamp);
        modelCount++;
    }

    // Create and list a new sneaker under an existing model (Nike only)
    function createAndListSneaker(
        string memory _sneakerModel,
        uint256 _price,
        string memory _imageURL
    ) external onlyOwner {
        require(bytes(_sneakerModel).length > 0, "Sneaker model cannot be empty");
        uint256 modelId = modelNameToId[_sneakerModel];
        require(models[modelId].exists, "Model does not exist");

        Model storage model = models[modelId];
        require(model.currentSupply < model.totalSupply, "Exceeds total supply for this model");

        // Increment current supply
        model.currentSupply++;

        sneakers[sneakerCount] = Sneaker(
            msg.sender,        // Seller (Nike)
            address(0),        // Buyer (initially none)
            sneakerCount,      // Token ID
            modelId,           // Model ID
            _price,            // Price in wei
            _imageURL,         // IPFS link to image
            false,             // Not sold initially
            true               // Active listing
        );

        modelToTokens[modelId].push(sneakerCount);

        emit SneakerListed(
            sneakerCount,
            modelId,
            msg.sender,
            _price,
            _imageURL,
            block.timestamp
        );
        sneakerCount++;
    }

    // Buy a sneaker
    function buySneaker(uint256 _tokenId) external payable {
        Sneaker storage sneaker = sneakers[_tokenId];
        require(sneaker.active, "Sneaker listing is not active");
        require(!sneaker.sold, "Sneaker already sold");
        require(msg.value == sneaker.price, "Incorrect price sent");
        require(msg.sender != sneaker.seller, "Seller cannot buy their own sneaker");

        // Calculate royalty if this is a resale (not Nike as seller)
        uint256 royaltyAmount = 0;
        if (sneaker.seller != owner()) {
            royaltyAmount = (sneaker.price * ROYALTY_PERCENTAGE) / 100;
        }
        uint256 sellerProceeds = sneaker.price - royaltyAmount;

        // Mark as sold and update buyer
        sneaker.sold = true;
        sneaker.buyer = msg.sender;

        // Transfer royalty to Nike treasury and proceeds to seller
        if (royaltyAmount > 0) {
            payable(nikeTreasury).transfer(royaltyAmount);
        }
        payable(sneaker.seller).transfer(sellerProceeds);

        // Record the purchase
        purchaseHistory[_tokenId].push(Purchase(
            _tokenId,
            msg.sender,
            sneaker.seller,
            sneaker.price,
            block.timestamp
        ));
        purchaseCount[_tokenId]++;

        emit SneakerPurchased(
            _tokenId,
            msg.sender,
            sneaker.seller,
            sneaker.price,
            royaltyAmount,
            block.timestamp
        );
    }

    // Relist a sneaker
    function relistSneaker(uint256 _tokenId, uint256 _newPrice) external {
        Sneaker storage sneaker = sneakers[_tokenId];
        require(sneaker.buyer == msg.sender, "Only the buyer can relist");
        require(sneaker.sold, "Sneaker must be sold to relist");
        require(sneaker.active, "Sneaker listing is not active");

        // Update listing for relisting
        sneaker.seller = msg.sender;
        sneaker.price = _newPrice;
        sneaker.buyer = address(0);
        sneaker.sold = false;

        emit SneakerRelisted(_tokenId, msg.sender, _newPrice, block.timestamp);
    }

    // Get purchase history for a specific sneaker
    function getPurchaseHistory(uint256 _tokenId) external view returns (Purchase[] memory) {
        return purchaseHistory[_tokenId];
    }

    // Deactivate a sneaker listing (Nike only)
    function deactivateSneaker(uint256 _tokenId) external onlyOwner {
        Sneaker storage sneaker = sneakers[_tokenId];
        require(sneaker.active, "Sneaker is already inactive");
        sneaker.active = false;
        emit SneakerDeactivated(_tokenId, block.timestamp);
    }

    // Update Nike treasury address (Nike only)
    function updateTreasuryAddress(address _newTreasury) external onlyOwner {
        require(_newTreasury != address(0), "Invalid treasury address");
        nikeTreasury = _newTreasury;
    }
}