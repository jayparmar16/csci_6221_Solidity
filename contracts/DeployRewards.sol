// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./AIVoteToken.sol";
import "./VotingRewards.sol";
import "./AIImageVoting.sol";

/**
 * @title Deploy Script for Reward System
 * @dev This script deploys AIVoteToken and VotingRewards contracts
 */
contract DeployRewards {
    AIVoteToken public token;
    VotingRewards public rewards;
    
    event ContractsDeployed(
        address tokenAddress,
        address rewardsAddress,
        address votingContract
    );
    
    constructor(address _votingContractAddress) {
        require(_votingContractAddress != address(0), "Invalid voting contract address");
        
        // Deploy AIVoteToken
        token = new AIVoteToken();
        
        // Deploy VotingRewards
        rewards = new VotingRewards(_votingContractAddress, address(token));
        
        // Add VotingRewards as minter
        token.addMinter(address(rewards));
        
        emit ContractsDeployed(
            address(token),
            address(rewards),
            _votingContractAddress
        );
    }
}
