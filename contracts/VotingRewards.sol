// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./AIImageVoting.sol";
import "./AIVoteToken.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title VotingRewards
 * @dev Manages reward distribution for accurate voters in the AI Image Voting Platform
 * 
 * Features:
 * - 7-day voting period per image
 * - Winner determination based on majority vote
 * - Fixed reward per correct vote
 * - Reward claiming with wallet authentication
 */
contract VotingRewards is Ownable, ReentrancyGuard {
    
    AIImageVoting public votingContract;
    AIVoteToken public rewardToken;
    
    // Reward amount per correct vote (in tokens with 18 decimals)
    uint256 public rewardPerVote = 10 * 10**18; // 10 AIVT tokens
    
    // Voting period duration (7 days)
    uint256 public constant VOTING_PERIOD = 7 days;
    
    // Image voting period tracking
    struct VotingPeriod {
        uint256 startTime;          // When voting started
        uint256 endTime;            // When voting ends (startTime + 7 days)
        bool isFinalized;           // Whether results are finalized
        bool correctAnswer;         // True if AI-generated, False if human-created
        uint256 totalCorrectVotes;  // Number of correct votes
        uint256 totalRewardsDistributed; // Total rewards given out
    }
    
    // Image ID => VotingPeriod
    mapping(uint256 => VotingPeriod) public votingPeriods;
    
    // Track if a voter has claimed reward for an image
    // imageId => voter => hasClaimed
    mapping(uint256 => mapping(address => bool)) public hasClaimedReward;
    
    // User statistics
    struct UserStats {
        uint256 totalVotes;
        uint256 correctVotes;
        uint256 totalRewardsEarned;
        uint256 pendingRewards;
    }
    
    // Wallet address => UserStats
    mapping(address => UserStats) public userStats;
    
    // Events
    event VotingPeriodStarted(uint256 indexed imageId, uint256 startTime, uint256 endTime);
    event VotingPeriodFinalized(uint256 indexed imageId, bool correctAnswer, uint256 totalCorrectVotes);
    event RewardClaimed(address indexed voter, uint256 indexed imageId, uint256 amount);
    event RewardPerVoteUpdated(uint256 oldAmount, uint256 newAmount);
    
    constructor(
        address _votingContract,
        address _rewardToken
    ) Ownable(msg.sender) {
        require(_votingContract != address(0), "Invalid voting contract");
        require(_rewardToken != address(0), "Invalid reward token");
        
        votingContract = AIImageVoting(_votingContract);
        rewardToken = AIVoteToken(_rewardToken);
    }
    
    /**
     * @dev Start voting period for a new image
     * Called when image is uploaded to blockchain
     */
    function startVotingPeriod(uint256 imageId) external onlyOwner {
        require(votingPeriods[imageId].startTime == 0, "Voting period already started");
        
        uint256 startTime = block.timestamp;
        uint256 endTime = startTime + VOTING_PERIOD;
        
        votingPeriods[imageId] = VotingPeriod({
            startTime: startTime,
            endTime: endTime,
            isFinalized: false,
            correctAnswer: false,
            totalCorrectVotes: 0,
            totalRewardsDistributed: 0
        });
        
        emit VotingPeriodStarted(imageId, startTime, endTime);
    }
    
    /**
     * @dev Finalize voting period after 7 days and determine correct answer
     * Can be called by anyone after period ends
     */
    function finalizeVotingPeriod(uint256 imageId) external {
        VotingPeriod storage period = votingPeriods[imageId];
        
        require(period.startTime > 0, "Voting period not started");
        require(!period.isFinalized, "Already finalized");
        require(block.timestamp >= period.endTime, "Voting period not ended yet");
        
        // Get vote counts from voting contract
        (uint256 aiVotes, uint256 humanVotes) = votingContract.getVotes(imageId);
        
        // Determine correct answer (majority wins)
        bool correctAnswer = aiVotes > humanVotes;
        uint256 correctVoteCount = correctAnswer ? aiVotes : humanVotes;
        
        // Update period
        period.isFinalized = true;
        period.correctAnswer = correctAnswer;
        period.totalCorrectVotes = correctVoteCount;
        
        emit VotingPeriodFinalized(imageId, correctAnswer, correctVoteCount);
    }
    
    /**
     * @dev Claim reward for correct vote
     */
    function claimReward(uint256 imageId) external nonReentrant {
        VotingPeriod storage period = votingPeriods[imageId];
        
        require(period.isFinalized, "Voting period not finalized");
        require(!hasClaimedReward[imageId][msg.sender], "Reward already claimed");
        
        // Check if voter voted correctly
        bool voterChoice = votingContract.getVoterChoice(imageId, msg.sender);
        require(voterChoice == period.correctAnswer, "Incorrect vote");
        
        // Check if voter actually voted
        require(votingContract.hasVoted(imageId, msg.sender), "No vote recorded");
        
        // Mark as claimed
        hasClaimedReward[imageId][msg.sender] = true;
        
        // Update user stats
        UserStats storage stats = userStats[msg.sender];
        stats.totalRewardsEarned += rewardPerVote;
        stats.correctVotes += 1;
        
        // Update period stats
        period.totalRewardsDistributed += rewardPerVote;
        
        // Mint and transfer reward tokens
        rewardToken.mint(msg.sender, rewardPerVote);
        
        emit RewardClaimed(msg.sender, imageId, rewardPerVote);
    }
    
    /**
     * @dev Batch claim rewards for multiple images
     */
    function claimMultipleRewards(uint256[] calldata imageIds) external {
        for (uint256 i = 0; i < imageIds.length; i++) {
            if (!hasClaimedReward[imageIds[i]][msg.sender]) {
                try this.claimReward(imageIds[i]) {
                    // Success
                } catch {
                    // Skip if claim fails
                }
            }
        }
    }
    
    /**
     * @dev Check if user can claim reward for an image
     */
    function canClaimReward(uint256 imageId, address voter) external view returns (bool) {
        VotingPeriod storage period = votingPeriods[imageId];
        
        if (!period.isFinalized) return false;
        if (hasClaimedReward[imageId][voter]) return false;
        if (!votingContract.hasVoted(imageId, voter)) return false;
        
        bool voterChoice = votingContract.getVoterChoice(imageId, voter);
        return voterChoice == period.correctAnswer;
    }
    
    /**
     * @dev Get pending rewards for a user across all images
     */
    function getPendingRewards(address voter, uint256[] calldata imageIds) external view returns (uint256 totalPending, uint256[] memory claimableImages) {
        uint256 count = 0;
        uint256[] memory temp = new uint256[](imageIds.length);
        
        for (uint256 i = 0; i < imageIds.length; i++) {
            uint256 imageId = imageIds[i];
            VotingPeriod storage period = votingPeriods[imageId];
            
            if (period.isFinalized && 
                !hasClaimedReward[imageId][voter] && 
                votingContract.hasVoted(imageId, voter)) {
                
                bool voterChoice = votingContract.getVoterChoice(imageId, voter);
                if (voterChoice == period.correctAnswer) {
                    totalPending += rewardPerVote;
                    temp[count] = imageId;
                    count++;
                }
            }
        }
        
        // Resize array to actual count
        claimableImages = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            claimableImages[i] = temp[i];
        }
    }
    
    /**
     * @dev Get user statistics
     */
    function getUserStats(address user) external view returns (
        uint256 totalVotes,
        uint256 correctVotes,
        uint256 totalRewardsEarned,
        uint256 accuracyRate
    ) {
        UserStats storage stats = userStats[user];
        totalVotes = stats.totalVotes;
        correctVotes = stats.correctVotes;
        totalRewardsEarned = stats.totalRewardsEarned;
        
        // Calculate accuracy rate (as percentage with 2 decimals)
        if (totalVotes > 0) {
            accuracyRate = (correctVotes * 10000) / totalVotes; // e.g., 7500 = 75.00%
        } else {
            accuracyRate = 0;
        }
    }
    
    /**
     * @dev Check voting period status
     */
    function getVotingPeriodStatus(uint256 imageId) external view returns (
        bool hasStarted,
        bool hasEnded,
        bool isFinalized,
        uint256 timeRemaining
    ) {
        VotingPeriod storage period = votingPeriods[imageId];
        
        hasStarted = period.startTime > 0;
        hasEnded = block.timestamp >= period.endTime;
        isFinalized = period.isFinalized;
        
        if (hasStarted && !hasEnded) {
            timeRemaining = period.endTime - block.timestamp;
        } else {
            timeRemaining = 0;
        }
    }
    
    /**
     * @dev Update reward amount per vote (owner only)
     */
    function setRewardPerVote(uint256 newAmount) external onlyOwner {
        uint256 oldAmount = rewardPerVote;
        rewardPerVote = newAmount;
        emit RewardPerVoteUpdated(oldAmount, newAmount);
    }
    
    /**
     * @dev Record vote (called by backend after vote is cast)
     */
    function recordVote(address voter) external onlyOwner {
        userStats[voter].totalVotes += 1;
    }
}
