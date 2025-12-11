// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;
import "./interfaces/ITransactionRegistry.sol";

/**
 * @title TransactionRegistry
 * @notice Maintains an immutable record of all validated transactions.
 * @dev Implements ITransactionRegistry to provide operation uniqueness validation
 * and cryptographic proof of who performed each operation.
 */
contract TransactionRegistry is ITransactionRegistry {

    /**
     * @dev Maps operation hashes to the address of the signer who first performed them.
     * Format: keccak256(abi.encodePacked(operation, recordId, timestamp)) => signer address
     */
    mapping(bytes32 => address) private signatureRegistry;

    /**
     * @notice Validates that an operation signature is unique and locks it to the sender.
     * @dev Generates a hash from inputs and checks against signatureRegistry.
     * If the hash exists, returns false (duplicate).
     * If the hash is new, records msg.sender and emits TransactionExecuted.
     * @param operation The operation type (e.g., "Create", "Update").
     * @param recordId The unique identifier of the target record.
     * @param timestamp The timestamp/nonce of the operation.
     * @return bool True if the transaction is new and accepted; otherwise false.
     */
    function validateTransaction(
        string calldata operation, 
        string calldata recordId, 
        uint256 timestamp
    ) external override returns (bool) {
        // Generate the hash of this operation
        bytes32 txnHash = keccak256(abi.encodePacked(operation, recordId, timestamp));
        
        // Check if this operation hash has already been recorded
        if (signatureRegistry[txnHash] != address(0)) {
            // Hash already exists - this is a duplicate
            emit ValidationResult(false);
            return false;
        }
        
        // Record the signer for this operation hash
        signatureRegistry[txnHash] = msg.sender;
        
        // Emit event to log the successful transaction
        emit TransactionExecuted(msg.sender, txnHash, timestamp);
        emit ValidationResult(true);
        
        // Return true to indicate success
        return true;
    }

    /**
     * @notice Retrieves the address responsible for a specific operation.
     * @param operation The operation type.
     * @param recordId The unique identifier of the target record.
     * @param timestamp The timestamp/nonce of the operation.
     * @return address The address of the signer, or address(0) if the transaction does not exist.
     */
    function getSigner(
        string calldata operation, 
        string calldata recordId, 
        uint256 timestamp
    ) external view override returns (address) {
        // Generate the hash of this operation
        bytes32 txnHash = keccak256(abi.encodePacked(operation, recordId, timestamp));
        
        // Return the signer address from the registry (or address(0) if not found)
        return signatureRegistry[txnHash];
    }
}