// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AIVoteToken
 * @dev ERC-20 token for rewarding accurate voters in the AI Image Voting Platform
 * Symbol: AIVT
 * Decimals: 18
 */
contract AIVoteToken is ERC20, Ownable {
    
    // Minter role - only the VotingRewards contract can mint tokens
    mapping(address => bool) public minters;
    
    // Events
    event MinterAdded(address indexed minter);
    event MinterRemoved(address indexed minter);
    event TokensMinted(address indexed to, uint256 amount);
    event TokensBurned(address indexed from, uint256 amount);
    
    constructor() ERC20("AI Vote Token", "AIVT") Ownable(msg.sender) {
        // Mint initial supply to owner (for testing)
        _mint(msg.sender, 1000000 * 10**decimals()); // 1 million tokens
    }
    
    /**
     * @dev Add a minter (typically the VotingRewards contract)
     */
    function addMinter(address minter) external onlyOwner {
        require(minter != address(0), "Invalid minter address");
        minters[minter] = true;
        emit MinterAdded(minter);
    }
    
    /**
     * @dev Remove a minter
     */
    function removeMinter(address minter) external onlyOwner {
        minters[minter] = false;
        emit MinterRemoved(minter);
    }
    
    /**
     * @dev Mint tokens - only callable by minters
     */
    function mint(address to, uint256 amount) external {
        require(minters[msg.sender], "Caller is not a minter");
        require(to != address(0), "Cannot mint to zero address");
        _mint(to, amount);
        emit TokensMinted(to, amount);
    }
    
    /**
     * @dev Burn tokens from sender's account
     */
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
        emit TokensBurned(msg.sender, amount);
    }
    
    /**
     * @dev Check if address is a minter
     */
    function isMinter(address account) external view returns (bool) {
        return minters[account];
    }
}
