// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AIImageVoting
 * @dev Smart contract for decentralized AI image detection voting
 * @notice Users can vote on whether images are AI-generated, with gas fees preventing spam
 */
contract AIImageVoting is Ownable, ReentrancyGuard {
    
    // ============ Structs ============
    
    struct ImageData {
        string sha256Hash;          // SHA-256 hash of image
        uint256 timestamp;          // Registration timestamp
        bool isAI;                  // Gemini's AI detection result
        uint8 aiScore;              // AI confidence score (0-100)
        string analysisExplanation; // Gemini's explanation
        uint256 aiVotes;            // Number of "AI-generated" votes
        uint256 humanVotes;         // Number of "human-made" votes
        bool exists;                // Whether image exists
        address uploader;           // Address that registered the image
    }
    
    // ============ State Variables ============
    
    mapping(uint256 => ImageData) public images;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => mapping(address => bool)) public voteStance;
    mapping(string => uint256) public sha256ToImageId; // Prevent duplicate images
    
    uint256 public imageCount;
    uint256 public totalVotes;
    
    // ============ Events ============
    
    event ImageRegistered(
        uint256 indexed imageId,
        string sha256Hash,
        address indexed uploader,
        bool isAI,
        uint8 aiScore,
        uint256 timestamp
    );
    
    event VoteCast(
        uint256 indexed imageId,
        address indexed voter,
        bool isAI,
        uint256 timestamp,
        uint256 aiVotesTotal,
        uint256 humanVotesTotal
    );
    
    event AnalysisUpdated(
        uint256 indexed imageId,
        bool isAI,
        uint8 aiScore,
        string explanation
    );
    
    // ============ Modifiers ============
    
    modifier imageExists(uint256 imageId) {
        require(images[imageId].exists, "Image does not exist");
        _;
    }
    
    modifier hasNotVoted(uint256 imageId) {
        require(!hasVoted[imageId][msg.sender], "Already voted on this image");
        _;
    }
    
    // ============ Constructor ============
    
    constructor() Ownable(msg.sender) {
        imageCount = 0;
        totalVotes = 0;
    }
    
    // ============ Image Registration Functions ============
    
    /**
     * @dev Register a new image with AI analysis results
     * @param sha256Hash SHA-256 hash of the image
     * @param isAI Whether Gemini detected it as AI-generated
     * @param aiScore AI confidence score (0-100)
     * @param explanation Gemini's explanation
     * @return imageId The ID of the registered image
     */
    function registerImage(
        string calldata sha256Hash,
        bool isAI,
        uint8 aiScore,
        string calldata explanation
    ) external onlyOwner returns (uint256) {
        require(bytes(sha256Hash).length == 64, "Invalid SHA-256 hash length");
        require(aiScore <= 100, "AI score must be between 0 and 100");
        require(bytes(explanation).length > 0, "Explanation cannot be empty");
        require(bytes(explanation).length <= 1000, "Explanation too long");
        require(sha256ToImageId[sha256Hash] == 0, "Image already registered");
        
        imageCount++;
        
        images[imageCount] = ImageData({
            sha256Hash: sha256Hash,
            timestamp: block.timestamp,
            isAI: isAI,
            aiScore: aiScore,
            analysisExplanation: explanation,
            aiVotes: 0,
            humanVotes: 0,
            exists: true,
            uploader: msg.sender
        });
        
        sha256ToImageId[sha256Hash] = imageCount;
        
        emit ImageRegistered(
            imageCount,
            sha256Hash,
            msg.sender,
            isAI,
            aiScore,
            block.timestamp
        );
        
        return imageCount;
    }
    
    /**
     * @dev Update AI analysis for an existing image
     * @param imageId ID of the image to update
     * @param isAI New AI detection result
     * @param aiScore New AI confidence score
     * @param explanation New explanation
     */
    function updateAnalysis(
        uint256 imageId,
        bool isAI,
        uint8 aiScore,
        string calldata explanation
    ) external onlyOwner imageExists(imageId) {
        require(aiScore <= 100, "AI score must be between 0 and 100");
        require(bytes(explanation).length > 0, "Explanation cannot be empty");
        require(bytes(explanation).length <= 1000, "Explanation too long");
        
        images[imageId].isAI = isAI;
        images[imageId].aiScore = aiScore;
        images[imageId].analysisExplanation = explanation;
        
        emit AnalysisUpdated(imageId, isAI, aiScore, explanation);
    }
    
    // ============ Voting Functions ============
    
    /**
     * @dev Cast a vote on whether an image is AI-generated
     * @param imageId ID of the image to vote on
     * @param isAI Vote stance (true = AI-generated, false = human-made)
     * @notice Requires gas fee, prevents spam and double voting
     */
    function vote(uint256 imageId, bool isAI)
        external
        imageExists(imageId)
        hasNotVoted(imageId)
        nonReentrant
    {
        // Mark as voted
        hasVoted[imageId][msg.sender] = true;
        voteStance[imageId][msg.sender] = isAI;
        
        // Update vote counts
        if (isAI) {
            images[imageId].aiVotes++;
        } else {
            images[imageId].humanVotes++;
        }
        
        totalVotes++;
        
        emit VoteCast(
            imageId,
            msg.sender,
            isAI,
            block.timestamp,
            images[imageId].aiVotes,
            images[imageId].humanVotes
        );
    }
    
    // ============ View Functions ============
    
    /**
     * @dev Get image data
     * @param imageId ID of the image
     * @return ImageData struct
     */
    function getImage(uint256 imageId)
        external
        view
        imageExists(imageId)
        returns (ImageData memory)
    {
        return images[imageId];
    }
    
    /**
     * @dev Get vote counts for an image
     * @param imageId ID of the image
     * @return aiVotes Number of AI votes
     * @return humanVotes Number of human votes
     */
    function getVotes(uint256 imageId)
        external
        view
        imageExists(imageId)
        returns (uint256 aiVotes, uint256 humanVotes)
    {
        return (images[imageId].aiVotes, images[imageId].humanVotes);
    }
    
    /**
     * @dev Check if an address has voted on an image
     * @param imageId ID of the image
     * @param voter Address to check
     * @return Whether the address has voted
     */
    function hasUserVoted(uint256 imageId, address voter)
        external
        view
        returns (bool)
    {
        return hasVoted[imageId][voter];
    }
    
    /**
     * @dev Get a user's vote stance on an image
     * @param imageId ID of the image
     * @param voter Address to check
     * @return stance Vote stance (true = AI, false = human)
     * @return voted Whether user has voted
     */
    function getUserVote(uint256 imageId, address voter)
        external
        view
        returns (bool stance, bool voted)
    {
        return (voteStance[imageId][voter], hasVoted[imageId][voter]);
    }
    
    /**
     * @dev Get image ID by SHA-256 hash
     * @param sha256Hash SHA-256 hash of the image
     * @return imageId ID of the image (0 if not found)
     */
    function getImageIdByHash(string calldata sha256Hash)
        external
        view
        returns (uint256)
    {
        return sha256ToImageId[sha256Hash];
    }
    
    /**
     * @dev Get contract statistics
     * @return totalImages Total number of images registered
     * @return totalVotesCount Total number of votes cast
     */
    function getStats()
        external
        view
        returns (uint256 totalImages, uint256 totalVotesCount)
    {
        return (imageCount, totalVotes);
    }
    
    /**
     * @dev Get multiple images at once
     * @param startId Starting image ID
     * @param count Number of images to retrieve
     * @return ImageData[] Array of image data
     */
    function getImages(uint256 startId, uint256 count)
        external
        view
        returns (ImageData[] memory)
    {
        require(startId > 0 && startId <= imageCount, "Invalid start ID");
        require(count > 0 && count <= 100, "Count must be 1-100");
        
        uint256 endId = startId + count - 1;
        if (endId > imageCount) {
            endId = imageCount;
        }
        
        uint256 actualCount = endId - startId + 1;
        ImageData[] memory result = new ImageData[](actualCount);
        
        for (uint256 i = 0; i < actualCount; i++) {
            result[i] = images[startId + i];
        }
        
        return result;
    }
}
