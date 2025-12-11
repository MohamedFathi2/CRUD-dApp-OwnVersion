/**
 * TransactionRegistryClient
 * 
 * This is the Layer 2 (Backend) component that sits between the user-facing API
 * and the blockchain (Ganache). It manages:
 * 1. Cryptographic signing of operations
 * 2. Validation against the blockchain ledger
 * 3. Queue management to prevent race conditions
 * 4. Audit trail retrieval
 */

const Web3 = require("web3");
const crypto = require("crypto");

class TransactionRegistryClient {
  /**
   * Initialize the client with connection to Ganache and the smart contract
   * @param {string} ganacheUrl - URL to Ganache (default: http://localhost:7545)
   * @param {string} contractABI - The ABI of TransactionRegistry contract
   * @param {string} contractAddress - Deployed contract address
   * @param {string} secretSigningKey - Private key for signing operations (in hex format)
   */
  constructor(ganacheUrl, contractABI, contractAddress, secretSigningKey) {
    this.web3 = new Web3(ganacheUrl || "http://localhost:7545");
    this.contract = new this.web3.eth.Contract(contractABI, contractAddress);
    this.secretSigningKey = secretSigningKey; // Private key for signing
    this.account = this.web3.eth.accounts.privateKeyToAccount(secretSigningKey);
    this.operationQueue = {}; // Queue to manage pending operations
  }

  /**
   * Validates and submits an operation to the blockchain
   * This is the core method called by Create, Update, Delete operations
   * 
   * @param {string} operation - Operation type (e.g., "Create", "Update", "Delete")
   * @param {string} recordId - Unique identifier of the target record
   * @param {number} timestamp - Timestamp/nonce of the operation (usually current time)
   * @returns {Promise<boolean>} - true if operation is new and accepted, false if duplicate
   */
  async validateAndSubmit(operation, recordId, timestamp) {
    try {
      // Add to queue to prevent race conditions
      const queueKey = `${operation}:${recordId}:${timestamp}`;
      
      if (this.operationQueue[queueKey]) {
        console.log(`[QUEUE] Operation ${queueKey} is already pending`);
        return this.operationQueue[queueKey];
      }

      // Create promise for this operation
      const operationPromise = (async () => {
        console.log(
          `[VALIDATING] ${operation} operation on record ${recordId} at timestamp ${timestamp}`
        );

        // Call the smart contract's validateTransaction function
        const result = await this.contract.methods
          .validateTransaction(operation, recordId, timestamp)
          .call({ from: this.account.address });

        if (result) {
          console.log(`[SUCCESS] Operation ${queueKey} validated and recorded on blockchain`);
        } else {
          console.log(`[DUPLICATE] Operation ${queueKey} is a duplicate, rejecting`);
        }

        return result;
      })();

      // Store in queue
      this.operationQueue[queueKey] = operationPromise;

      // Wait for result and remove from queue
      const result = await operationPromise;
      delete this.operationQueue[queueKey];

      return result;
    } catch (error) {
      console.error(`[ERROR] validateAndSubmit failed:`, error);
      return false;
    }
  }

  /**
   * Retrieves the address (signer) who performed a specific operation
   * Useful for audit trails
   * 
   * @param {string} operation - Operation type
   * @param {string} recordId - Record identifier
   * @param {number} timestamp - Operation timestamp
   * @returns {Promise<string>} - Ethereum address of the signer, or 0x0...0 if not found
   */
  async findSignerByData(operation, recordId, timestamp) {
    try {
      const signer = await this.contract.methods
        .getSigner(operation, recordId, timestamp)
        .call();

      if (signer === "0x0000000000000000000000000000000000000000") {
        console.log(`[NOT FOUND] No signer found for ${operation}:${recordId}:${timestamp}`);
        return null;
      }

      console.log(
        `[FOUND] Signer for ${operation}:${recordId}:${timestamp} is ${signer}`
      );
      return signer;
    } catch (error) {
      console.error(`[ERROR] findSignerByData failed:`, error);
      return null;
    }
  }

  /**
   * Retrieves transaction history for verification purposes
   * Note: This is a simplified implementation. A full implementation would
   * listen to contract events or query from an event log database
   * 
   * @param {string} userAddress - User's Ethereum address to filter by
   * @returns {Promise<Array>} - Array of transactions performed by this address
   */
  async retrieveTransactionHistory(userAddress) {
    try {
      console.log(`[HISTORY] Retrieving transaction history for ${userAddress}`);

      // In a production system, you would listen to TransactionExecuted events
      // Here's a simplified approach using web3 getPastLogs
      const eventSignature = this.web3.utils.keccak256(
        "TransactionExecuted(address,bytes32,uint256)"
      );

      const logs = await this.web3.eth.getPastLogs({
        address: this.contract.options.address,
        topics: [eventSignature, this.web3.utils.padLeft(userAddress, 64)],
      });

      const transactions = logs.map((log) => {
        const decoded = this.contract._decodeMethodReturn(this.contract.methods.validateTransaction(
          "dummy",
          "dummy",
          0
        ).encodeABI(), log.data);

        return {
          transactionHash: log.transactionHash,
          blockNumber: log.blockNumber,
          signer: userAddress,
          timestamp: parseInt(log.topics[3], 16),
        };
      });

      console.log(`[HISTORY] Found ${transactions.length} transactions for ${userAddress}`);
      return transactions;
    } catch (error) {
      console.error(`[ERROR] retrieveTransactionHistory failed:`, error);
      return [];
    }
  }

  /**
   * Utility: Signs data using the secret signing key
   * This demonstrates the cryptographic signing capability
   * 
   * @param {string} operation - Operation type
   * @param {string} recordId - Record ID
   * @param {number} timestamp - Timestamp
   * @returns {string} - Signature hash
   */
  signOperation(operation, recordId, timestamp) {
    const dataToSign = `${operation}:${recordId}:${timestamp}`;
    const hash = crypto.createHash("sha256").update(dataToSign).digest("hex");
    console.log(`[SIGNED] Operation hash: ${hash}`);
    return hash;
  }

  /**
   * Utility: Generate deterministic hash of operation data
   * Matches what the smart contract does internally
   * 
   * @param {string} operation - Operation type
   * @param {string} recordId - Record ID
   * @param {number} timestamp - Timestamp
   * @returns {string} - Deterministic hash
   */
  generateOperationHash(operation, recordId, timestamp) {
    const data = this.web3.utils.encodePacked(operation, recordId, timestamp.toString());
    const hash = this.web3.utils.keccak256(data);
    console.log(`[HASH] Generated hash: ${hash}`);
    return hash;
  }

  /**
   * Gets the public address derived from the secret signing key
   * @returns {string} - Public Ethereum address
   */
  getPublicAddress() {
    return this.account.address;
  }

  /**
   * Checks if there are any pending operations in the queue
   * @returns {number} - Number of operations in queue
   */
  getPendingOperationCount() {
    return Object.keys(this.operationQueue).length;
  }
}

module.exports = TransactionRegistryClient;
