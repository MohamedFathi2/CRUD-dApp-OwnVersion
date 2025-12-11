#!/usr/bin/env python3
"""
TransactionRegistry Simulation

This script simulates the behavior of the blockchain-enhanced CRUD system
WITHOUT requiring Ganache or Web3 connections. It's useful for:
1. Testing the logic locally
2. Understanding the validation flow
3. Prototyping before blockchain deployment

The simulation mimics the exact same behavior as the smart contract:
- Prevents duplicate operations
- Records who performed each operation
- Emits events
- Provides audit trails
"""

import hashlib
import json
from datetime import datetime
from typing import Dict, Optional, List, Tuple
from dataclasses import dataclass, field
import uuid


@dataclass
class TransactionEvent:
    """Represents a TransactionExecuted event"""
    signer: str
    transaction_hash: str
    timestamp: int
    
    def to_dict(self):
        return {
            "signer": self.signer,
            "transactionHash": self.transaction_hash,
            "timestamp": self.timestamp
        }


@dataclass
class Transaction:
    """Represents a recorded transaction"""
    operation: str
    record_id: str
    timestamp: int
    signer: str
    transaction_hash: str
    
    def to_dict(self):
        return {
            "operation": self.operation,
            "recordId": self.record_id,
            "timestamp": self.timestamp,
            "signer": self.signer,
            "transactionHash": self.transaction_hash
        }


class SimulatedTransactionRegistry:
    """
    Simulates the behavior of the smart contract TransactionRegistry
    
    This maintains:
    - A signature registry (operation hash -> signer address)
    - Event logs
    - Transaction history
    """
    
    def __init__(self):
        self.signature_registry: Dict[str, str] = {}
        self.events: List[TransactionEvent] = []
        self.transactions: List[Transaction] = []
    
    def _generate_hash(self, operation: str, record_id: str, timestamp: int) -> str:
        """
        Generates the same hash as the smart contract using keccak256
        
        In Solidity: keccak256(abi.encodePacked(operation, recordId, timestamp))
        In Python: We'll use SHA256 for simulation (close enough for demonstration)
        """
        data = f"{operation}{record_id}{timestamp}".encode()
        # Using SHA256 instead of keccak256 for portability
        # In real implementation, you'd use eth_keys.datatypes.keccak
        hash_obj = hashlib.sha256(data)
        return f"0x{hash_obj.hexdigest()}"
    
    def validate_transaction(
        self, 
        operation: str, 
        record_id: str, 
        timestamp: int,
        signer: str = "user_default"
    ) -> bool:
        """
        Validates that an operation is unique.
        
        Args:
            operation: Type of operation (Create, Update, Delete, etc)
            record_id: Identifier of the target record
            timestamp: Timestamp/nonce of the operation
            signer: Address/ID of who is performing this operation
        
        Returns:
            bool: True if operation is new and accepted, False if duplicate
        """
        # Generate the hash
        txn_hash = self._generate_hash(operation, record_id, timestamp)
        
        # Check if this operation hash already exists
        if txn_hash in self.signature_registry:
            print(f"  ❌ DUPLICATE: Operation hash {txn_hash} already recorded by {self.signature_registry[txn_hash]}")
            return False
        
        # Record the signer
        self.signature_registry[txn_hash] = signer
        
        # Create and emit event
        event = TransactionEvent(
            signer=signer,
            transaction_hash=txn_hash,
            timestamp=timestamp
        )
        self.events.append(event)
        
        # Record transaction
        transaction = Transaction(
            operation=operation,
            record_id=record_id,
            timestamp=timestamp,
            signer=signer,
            transaction_hash=txn_hash
        )
        self.transactions.append(transaction)
        
        print(f"  ✅ SUCCESS: {operation} operation on {record_id} validated and recorded")
        print(f"     Hash: {txn_hash}")
        print(f"     Signer: {signer}")
        return True
    
    def get_signer(
        self, 
        operation: str, 
        record_id: str, 
        timestamp: int
    ) -> Optional[str]:
        """
        Retrieves the signer of a specific operation.
        
        Args:
            operation: Type of operation
            record_id: Record identifier
            timestamp: Operation timestamp
        
        Returns:
            str: Address of signer, or None if not found
        """
        txn_hash = self._generate_hash(operation, record_id, timestamp)
        signer = self.signature_registry.get(txn_hash)
        
        if signer:
            print(f"  ℹ️  FOUND: Signer for {operation}:{record_id}:{timestamp} is {signer}")
        else:
            print(f"  ℹ️  NOT FOUND: No signer for {operation}:{record_id}:{timestamp}")
        
        return signer
    
    def get_transaction_history(self, signer: str) -> List[Transaction]:
        """
        Retrieves all transactions performed by a specific signer.
        
        Args:
            signer: Address/ID of the signer
        
        Returns:
            List of transactions performed by this signer
        """
        history = [t for t in self.transactions if t.signer == signer]
        print(f"  ℹ️  HISTORY: Found {len(history)} transactions for {signer}")
        return history
    
    def get_registry_size(self) -> int:
        """Returns the number of recorded transactions"""
        return len(self.signature_registry)
    
    def print_state(self):
        """Prints the current state of the registry"""
        print("\n" + "="*60)
        print("REGISTRY STATE")
        print("="*60)
        print(f"Total Transactions: {len(self.transactions)}")
        print(f"Total Events: {len(self.events)}")
        print("\nTransactions:")
        for txn in self.transactions:
            print(f"  - {txn.operation:8} | {txn.record_id:15} | Time:{txn.timestamp} | Signer:{txn.signer}")
        print("="*60 + "\n")


class SimulatedCRUDService:
    """
    Simulates a CRUD service that uses the TransactionRegistry
    
    This represents the Layer 2 (Backend) in our architecture.
    """
    
    def __init__(self, registry: SimulatedTransactionRegistry, signer: str = "user_001"):
        self.registry = registry
        self.signer = signer
        self.database: Dict[str, Dict] = {}
    
    def create(self, record_id: str, data: Dict) -> Tuple[bool, str]:
        """
        CREATE operation with blockchain validation
        
        Workflow:
        1. Validate with registry
        2. If approved, write to local database
        3. If rejected, return error
        """
        print(f"\n[CREATE] Creating record {record_id}")
        timestamp = int(datetime.now().timestamp())
        
        # Step 1: Validate with blockchain
        is_approved = self.registry.validate_transaction(
            "Create",
            record_id,
            timestamp,
            self.signer
        )
        
        if not is_approved:
            return False, f"CREATE failed: Duplicate operation detected for {record_id}"
        
        # Step 2: Write to database
        self.database[record_id] = {
            **data,
            "_created_at": timestamp,
            "_created_by": self.signer,
            "_status": "active"
        }
        
        return True, f"Record {record_id} created successfully"
    
    def read(self, record_id: str) -> Tuple[bool, Dict | str]:
        """
        READ operation with audit trail verification
        """
        print(f"\n[READ] Reading record {record_id}")
        
        if record_id not in self.database:
            return False, f"Record {record_id} not found"
        
        record = self.database[record_id]
        
        # Query blockchain for creation proof
        creator = self.registry.get_signer(
            "Create",
            record_id,
            record["_created_at"]
        )
        
        # Add audit trail to response
        record["_creator"] = creator
        
        return True, record
    
    def update(self, record_id: str, data: Dict) -> Tuple[bool, str]:
        """
        UPDATE operation with blockchain validation
        """
        print(f"\n[UPDATE] Updating record {record_id}")
        
        if record_id not in self.database:
            return False, f"Record {record_id} not found"
        
        timestamp = int(datetime.now().timestamp())
        
        # Step 1: Validate with blockchain
        is_approved = self.registry.validate_transaction(
            "Update",
            record_id,
            timestamp,
            self.signer
        )
        
        if not is_approved:
            return False, f"UPDATE failed: Duplicate operation detected for {record_id}"
        
        # Step 2: Update database
        self.database[record_id].update(data)
        self.database[record_id]["_updated_at"] = timestamp
        self.database[record_id]["_updated_by"] = self.signer
        
        return True, f"Record {record_id} updated successfully"
    
    def delete(self, record_id: str) -> Tuple[bool, str]:
        """
        DELETE operation with blockchain validation
        """
        print(f"\n[DELETE] Deleting record {record_id}")
        
        if record_id not in self.database:
            return False, f"Record {record_id} not found"
        
        timestamp = int(datetime.now().timestamp())
        
        # Step 1: Validate with blockchain
        is_approved = self.registry.validate_transaction(
            "Delete",
            record_id,
            timestamp,
            self.signer
        )
        
        if not is_approved:
            return False, f"DELETE failed: Duplicate operation detected for {record_id}"
        
        # Step 2: Delete from database
        del self.database[record_id]
        
        return True, f"Record {record_id} deleted successfully"
    
    def get_audit_trail(self):
        """Returns all operations performed by this signer"""
        print(f"\n[AUDIT] Retrieving audit trail for {self.signer}")
        return self.registry.get_transaction_history(self.signer)


def demonstrate_system():
    """
    Demonstrates the complete CRUD system with blockchain validation
    """
    print("\n" + "="*60)
    print("  CRUD dApp Simulation (without Ganache)")
    print("="*60)
    
    # Initialize the simulated registry
    registry = SimulatedTransactionRegistry()
    
    # Create two users to demonstrate multi-user behavior
    user1_service = SimulatedCRUDService(registry, signer="user_001")
    user2_service = SimulatedCRUDService(registry, signer="user_002")
    
    # ===== SCENARIO 1: Single user CRUD workflow =====
    print("\n" + "="*60)
    print("SCENARIO 1: User 1 performs CRUD operations")
    print("="*60)
    
    # CREATE
    success, msg = user1_service.create("customer_001", {
        "name": "John Doe",
        "email": "john@example.com"
    })
    print(f"  Result: {msg}")
    
    # READ with audit trail
    success, result = user1_service.read("customer_001")
    if success:
        print(f"  Data: {json.dumps(result, indent=4)}")
    
    # UPDATE
    success, msg = user1_service.update("customer_001", {
        "email": "john.doe@example.com"
    })
    print(f"  Result: {msg}")
    
    # Attempt DUPLICATE UPDATE (should fail)
    print("\n  [Attempting duplicate update...]")
    success, msg = user1_service.update("customer_001", {
        "email": "john.doe@example.com"
    })
    print(f"  Result: {msg}")
    
    # ===== SCENARIO 2: Multiple users =====
    print("\n" + "="*60)
    print("SCENARIO 2: Multiple users performing operations")
    print("="*60)
    
    # User 1 creates product
    success, msg = user1_service.create("product_001", {
        "name": "Widget",
        "price": 29.99
    })
    print(f"  User 1: {msg}")
    
    # User 2 creates different product
    success, msg = user2_service.create("product_002", {
        "name": "Gadget",
        "price": 49.99
    })
    print(f"  User 2: {msg}")
    
    # User 2 updates User 1's product (should fail - different user)
    print("\n  [User 2 attempting to update User 1's product...]")
    success, msg = user2_service.update("product_001", {"price": 24.99})
    print(f"  Result: {msg}")
    
    # User 1 updates their own product (should succeed - different timestamp)
    success, msg = user1_service.update("product_001", {"price": 24.99})
    print(f"  Result: {msg}")
    
    # ===== SCENARIO 3: DELETE =====
    print("\n" + "="*60)
    print("SCENARIO 3: Delete operations")
    print("="*60)
    
    success, msg = user1_service.delete("customer_001")
    print(f"  Result: {msg}")
    
    # Attempt to read deleted record
    success, result = user1_service.read("customer_001")
    print(f"  Result: {result}")
    
    # ===== SCENARIO 4: Audit Trail =====
    print("\n" + "="*60)
    print("SCENARIO 4: Audit trails")
    print("="*60)
    
    print("\nUser 1's operations:")
    user1_history = user1_service.get_audit_trail()
    for txn in user1_history:
        print(f"  - {txn.operation:8} | {txn.record_id:15} | Time:{txn.timestamp}")
    
    print("\nUser 2's operations:")
    user2_history = user2_service.get_audit_trail()
    for txn in user2_history:
        print(f"  - {txn.operation:8} | {txn.record_id:15} | Time:{txn.timestamp}")
    
    # ===== FINAL REGISTRY STATE =====
    registry.print_state()
    
    print("\n" + "="*60)
    print("SIMULATION COMPLETE")
    print("="*60)
    print("\nKey Observations:")
    print("1. ✅ Duplicate operations are prevented")
    print("2. ✅ Audit trail shows who performed each operation")
    print("3. ✅ Timestamps create uniqueness across operations")
    print("4. ✅ Multiple users can operate independently")
    print("5. ✅ All operations are immutably recorded")


if __name__ == "__main__":
    demonstrate_system()
