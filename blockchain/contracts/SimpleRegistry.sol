// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

contract SimpleRegistry {
    mapping(bytes32 => address) private signatureRegistry;
    
    event TransactionExecuted(address indexed signer, bytes32 txnHash, uint256 timestamp);
    
    function validateTransaction(
        string calldata operation, 
        string calldata recordId, 
        uint256 timestamp
    ) external returns (bool) {
        bytes32 txnHash = keccak256(abi.encodePacked(operation, recordId, timestamp));
        
        if (signatureRegistry[txnHash] != address(0)) {
            return false;
        }
        
        signatureRegistry[txnHash] = msg.sender;
        emit TransactionExecuted(msg.sender, txnHash, timestamp);
        return true;
    }
    
    function getSigner(
        string calldata operation, 
        string calldata recordId, 
        uint256 timestamp
    ) external view returns (address) {
        bytes32 txnHash = keccak256(abi.encodePacked(operation, recordId, timestamp));
        return signatureRegistry[txnHash];
    }
}
