/**
 * Web3 Integration for AI Image Voting Platform
 * Handles MetaMask connection, blockchain voting, and transaction management
 */

// Contract ABI (only the functions we need)
const CONTRACT_ABI = [
    {
        "inputs": [{"internalType": "uint256", "name": "imageId", "type": "uint256"}, {"internalType": "bool", "name": "isAI", "type": "bool"}],
        "name": "vote",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "uint256", "name": "imageId", "type": "uint256"}],
        "name": "getVotes",
        "outputs": [{"internalType": "uint256", "name": "aiVotes", "type": "uint256"}, {"internalType": "uint256", "name": "humanVotes", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "uint256", "name": "imageId", "type": "uint256"}, {"internalType": "address", "name": "voter", "type": "address"}],
        "name": "hasUserVoted",
        "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "uint256", "name": "imageId", "type": "uint256"}],
        "name": "getImage",
        "outputs": [{
            "components": [
                {"internalType": "string", "name": "sha256Hash", "type": "string"},
                {"internalType": "uint256", "name": "timestamp", "type": "uint256"},
                {"internalType": "bool", "name": "isAI", "type": "bool"},
                {"internalType": "uint8", "name": "aiScore", "type": "uint8"},
                {"internalType": "string", "name": "analysisExplanation", "type": "string"},
                {"internalType": "uint256", "name": "aiVotes", "type": "uint256"},
                {"internalType": "uint256", "name": "humanVotes", "type": "uint256"},
                {"internalType": "bool", "name": "exists", "type": "bool"},
                {"internalType": "address", "name": "uploader", "type": "address"}
            ],
            "internalType": "struct AIImageVoting.ImageData",
            "name": "",
            "type": "tuple"
        }],
        "stateMutability": "view",
        "type": "function"
    }
];

// Configuration
const SEPOLIA_CHAIN_ID = '0xaa36a7'; // 11155111 in hex
const SEPOLIA_CHAIN_NAME = 'Sepolia';
const SEPOLIA_RPC_URL = 'https://sepolia.infura.io/v3/';

class Web3Manager {
    constructor() {
        this.provider = null;
        this.signer = null;
        this.contract = null;
        this.account = null;
        this.contractAddress = null;
    }

    /**
     * Check if MetaMask is installed
     */
    isMetaMaskInstalled() {
        return typeof window.ethereum !== 'undefined';
    }

    /**
     * Get contract address from backend
     */
    async getContractAddress() {
        try {
            const response = await fetch('/blockchain/status');
            const data = await response.json();
            if (data.enabled && data.contract_address) {
                this.contractAddress = data.contract_address;
                return this.contractAddress;
            }
            throw new Error('Blockchain not enabled or contract address not found');
        } catch (error) {
            console.error('Failed to get contract address:', error);
            throw error;
        }
    }

    /**
     * Connect to MetaMask wallet
     */
    async connectWallet() {
        console.log('🔵 [Web3Manager] connectWallet called');
        
        if (!this.isMetaMaskInstalled()) {
            console.error('❌ MetaMask not installed');
            throw new Error('MetaMask is not installed. Please install MetaMask to vote on blockchain.');
        }
        
        console.log('✅ MetaMask detected');

        // Check if ethers is loaded
        if (typeof ethers === 'undefined') {
            console.error('❌ Ethers.js not loaded');
            throw new Error('Ethers.js library not loaded. Please refresh the page.');
        }
        
        console.log('✅ Ethers.js loaded');

        try {
            // Get contract address first
            console.log('🔵 Getting contract address...');
            await this.getContractAddress();
            console.log('✅ Contract address:', this.contractAddress);

            // Request account access
            console.log('🔵 Requesting account access from MetaMask...');
            const accounts = await window.ethereum.request({ 
                method: 'eth_requestAccounts' 
            });
            
            this.account = accounts[0];
            console.log('✅ Account connected:', this.account);

            // Initialize ethers provider and signer
            console.log('🔵 Initializing provider...');
            this.provider = new ethers.providers.Web3Provider(window.ethereum);
            this.signer = this.provider.getSigner();
            console.log('✅ Provider initialized');

            // Check network
            console.log('🔵 Checking network...');
            const network = await this.provider.getNetwork();
            console.log('✅ Current network:', network.name, 'Chain ID:', network.chainId);
            
            if (network.chainId !== 11155111) {
                console.log('⚠️ Not on Sepolia, switching...');
                await this.switchToSepolia();
            }

            // Initialize contract
            console.log('🔵 Initializing contract...');
            this.contract = new ethers.Contract(
                this.contractAddress,
                CONTRACT_ABI,
                this.signer
            );
            console.log('✅ Contract initialized');

            // Listen for account changes
            window.ethereum.on('accountsChanged', (accounts) => {
                if (accounts.length === 0) {
                    this.disconnect();
                } else {
                    this.account = accounts[0];
                    window.location.reload();
                }
            });

            // Listen for chain changes
            window.ethereum.on('chainChanged', () => {
                window.location.reload();
            });

            console.log('✅ [Web3Manager] Connection complete!');
            return this.account;
        } catch (error) {
            console.error('❌ Failed to connect wallet:', error);
            throw error;
        }
    }

    /**
     * Switch to Sepolia network
     */
    async switchToSepolia() {
        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: SEPOLIA_CHAIN_ID }],
            });
        } catch (switchError) {
            // This error code indicates that the chain has not been added to MetaMask
            if (switchError.code === 4902) {
                try {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [{
                            chainId: SEPOLIA_CHAIN_ID,
                            chainName: SEPOLIA_CHAIN_NAME,
                            nativeCurrency: {
                                name: 'SepoliaETH',
                                symbol: 'ETH',
                                decimals: 18
                            },
                            rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
                            blockExplorerUrls: ['https://sepolia.etherscan.io']
                        }]
                    });
                } catch (addError) {
                    throw new Error('Failed to add Sepolia network');
                }
            } else {
                throw switchError;
            }
        }
    }

    /**
     * Disconnect wallet
     */
    disconnect() {
        this.provider = null;
        this.signer = null;
        this.contract = null;
        this.account = null;
    }

    /**
     * Get account balance
     */
    async getBalance() {
        if (!this.provider || !this.account) {
            throw new Error('Wallet not connected');
        }
        const balance = await this.provider.getBalance(this.account);
        return ethers.utils.formatEther(balance);
    }

    /**
     * Get current network name
     */
    async getNetwork() {
        if (!this.provider) {
            throw new Error('Wallet not connected');
        }
        const network = await this.provider.getNetwork();
        return network.name;
    }

    /**
     * Vote on an image
     */
    async voteOnImage(blockchainId, isAI) {
        if (!this.contract) {
            throw new Error('Contract not initialized. Please connect wallet first.');
        }

        try {
            // Estimate gas
            const gasEstimate = await this.contract.estimateGas.vote(blockchainId, isAI);
            const gasLimit = gasEstimate.mul(120).div(100); // Add 20% buffer

            // Send transaction
            const tx = await this.contract.vote(blockchainId, isAI, {
                gasLimit: gasLimit
            });

            return {
                hash: tx.hash,
                wait: () => tx.wait()
            };
        } catch (error) {
            console.error('Vote transaction failed:', error);
            throw this.parseError(error);
        }
    }

    /**
     * Check if user has voted on an image
     */
    async hasVoted(blockchainId, address = null) {
        if (!this.contract) {
            throw new Error('Contract not initialized');
        }

        const voterAddress = address || this.account;
        if (!voterAddress) {
            throw new Error('No address provided');
        }

        try {
            return await this.contract.hasUserVoted(blockchainId, voterAddress);
        } catch (error) {
            console.error('Failed to check vote status:', error);
            return false;
        }
    }

    /**
     * Get vote counts from blockchain
     */
    async getVotes(blockchainId) {
        if (!this.contract) {
            throw new Error('Contract not initialized');
        }

        try {
            const [aiVotes, humanVotes] = await this.contract.getVotes(blockchainId);
            return {
                ai: aiVotes.toNumber(),
                human: humanVotes.toNumber()
            };
        } catch (error) {
            console.error('Failed to get votes:', error);
            throw error;
        }
    }

    /**
     * Get image data from blockchain
     */
    async getImage(blockchainId) {
        if (!this.contract) {
            throw new Error('Contract not initialized');
        }

        try {
            const data = await this.contract.getImage(blockchainId);
            return {
                sha256Hash: data[0],
                timestamp: data[1].toNumber(),
                isAI: data[2],
                aiScore: data[3],
                analysisExplanation: data[4],
                aiVotes: data[5].toNumber(),
                humanVotes: data[6].toNumber(),
                exists: data[7],
                uploader: data[8]
            };
        } catch (error) {
            console.error('Failed to get image data:', error);
            throw error;
        }
    }

    /**
     * Parse error messages
     */
    parseError(error) {
        if (error.code === 4001) {
            return new Error('Transaction rejected by user');
        }
        if (error.message.includes('Already voted')) {
            return new Error('You have already voted on this image');
        }
        if (error.message.includes('Image does not exist')) {
            return new Error('Image not found on blockchain');
        }
        return error;
    }

    /**
     * Format address for display
     */
    formatAddress(address) {
        if (!address) return '';
        return `${address.substring(0, 6)}...${address.substring(38)}`;
    }

    /**
     * Get Etherscan link
     */
    getEtherscanLink(txHash) {
        return `https://sepolia.etherscan.io/tx/${txHash}`;
    }
}

// Wait for ethers.js to load before initializing
function initWeb3Manager() {
    if (typeof ethers !== 'undefined') {
        console.log('✅ [Web3Manager] Ethers.js loaded, initializing...');
        window.web3Manager = new Web3Manager();
        console.log('✅ [Web3Manager] Instance created');
    } else {
        console.warn('⚠️ [Web3Manager] Ethers.js not loaded yet, waiting...');
        setTimeout(initWeb3Manager, 100);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWeb3Manager);
} else {
    initWeb3Manager();
}
