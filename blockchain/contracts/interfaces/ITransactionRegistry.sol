// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/**
 * @title ITransactionRegistry
 * @notice Registry for validating operation uniqueness and maintaining an audit trail.
 */
interface ITransactionRegistry {

    /*
     * @dev Emitted when a transaction is successfully validated.
     * @param signer The address of the user who initiated the transaction. Indexed for filtering.
     * @param txnHash The computed hash of the operation data.
     * @param timestamp The timestamp associated with the operation.
     */
    event TransactionExecuted(
        address indexed signer, 
        bytes32 txnHash, 
        uint256 timestamp
    );
    
    // Event to track validation results
    event ValidationResult(bool success);

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
    ) external returns (bool);

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
    ) external view returns (address);
}