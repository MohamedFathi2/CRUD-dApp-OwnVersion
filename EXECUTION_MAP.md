# 🗺️ CRUD dApp Execution Map - Complete Flow Guide

This document shows **exactly what executes after what** so you understand the entire system flow.

---

## 📊 System Overview - 3 Layers

```
┌────────────────────────────────────────────────────────┐
│ LAYER 1: USER ACTION                                   │
│ Frontend/API receives: Create, Read, Update, Delete    │
└────────────────────┬─────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────┐
│ LAYER 2: BACKEND (Node.js)                             │
│ • ExampleBackendService.js                             │
│ • TransactionRegistryClient.js                         │
│ ↓ Validates with blockchain                            │
│ ↓ Queue management                                     │
│ ↓ Cryptographic signing                                │
└────────────────────┬─────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────┐
│ LAYER 3: BLOCKCHAIN (Ganache)                          │
│ TransactionRegistry Smart Contract (Solidity)          │
│ ↓ Check for duplicates                                 │
│ ↓ Record operation                                     │
│ ↓ Emit events                                          │
└────────────────────────────────────────────────────────┘
```

---

# 🚀 EXECUTION FLOW - START TO FINISH

## **SCENARIO: User wants to CREATE a new record**

### STEP 1️⃣: User initiates request (Frontend/API)
```javascript
// In your API or frontend code:
const userService = new UserService(registryClient, database);
await userService.createUser("user_123", { name: "John", email: "john@example.com" });
```

**File:** `backend/ExampleBackendService.js` (Line 27-45)
```javascript
async createUser(userId, userData) {
  console.log(`\n[CREATE] Attempting to create user ${userId}`);
  
  const timestamp = Math.floor(Date.now() / 1000);  // ⬅️ Gets current time
  
  // Step 1: Validate with blockchain
  const isApproved = await this.registryClient.validateAndSubmit(
    "Create",
    userId,
    timestamp
  );
```

**What happens:**
- Service creates a timestamp
- Calls `validateAndSubmit()` with operation type, record ID, and timestamp
- **PAUSES HERE** and waits for blockchain response

---

### STEP 2️⃣: TransactionRegistryClient processes the request

**File:** `backend/TransactionRegistryClient.js` (Line 40-78)
```javascript
async validateAndSubmit(operation, recordId, timestamp) {
  try {
    // Add to queue to prevent race conditions
    const queueKey = `${operation}:${recordId}:${timestamp}`;
    // e.g., "Create:user_123:1765416108"
    
    if (this.operationQueue[queueKey]) {
      // Already being processed, return existing promise
      return this.operationQueue[queueKey];
    }

    const operationPromise = (async () => {
      console.log(`[VALIDATING] ${operation} operation...`);

      // Call the smart contract ⬅️ THIS IS KEY!
      const result = await this.contract.methods
        .validateTransaction(operation, recordId, timestamp)
        .call({ from: this.account.address });

      if (result) {
        console.log(`[SUCCESS] Operation validated`);
      } else {
        console.log(`[DUPLICATE] Operation is a duplicate`);
      }

      return result;
    })();

    this.operationQueue[queueKey] = operationPromise;
    const result = await operationPromise;
    delete this.operationQueue[queueKey];

    return result;
  } catch (error) {
    console.error(`[ERROR]`, error);
    return false;
  }
}
```

**What happens:**
1. Creates a queue key: `"Create:user_123:1765416108"`
2. Checks if this exact operation is already pending
3. **Calls the smart contract** via Web3
4. Waits for blockchain response
5. Returns `true` or `false`

---

### STEP 3️⃣: Smart Contract executes on Ganache

**File:** `blockchain/contracts/TransactionRegistry.sol` (Line 25-50)
```solidity
function validateTransaction(
    string calldata operation, 
    string calldata recordId, 
    uint256 timestamp
) external override returns (bool) {
    // Step A: Generate hash of the operation
    bytes32 txnHash = keccak256(abi.encodePacked(operation, recordId, timestamp));
    // e.g., "Create" + "user_123" + "1765416108" = hash

    // Step B: Check if this exact operation was already done
    if (signatureRegistry[txnHash] != address(0)) {
        // YES it exists → DUPLICATE!
        emit ValidationResult(false);
        return false;  ⬅️ DUPLICATE DETECTED
    }
    
    // Step C: Never seen this before → RECORD IT!
    signatureRegistry[txnHash] = msg.sender;
    // Stores: hash → address of who did this operation
    
    // Step D: Emit events for audit trail
    emit TransactionExecuted(msg.sender, txnHash, timestamp);
    emit ValidationResult(true);
    
    // Step E: Return success
    return true;  ⬅️ NEW OPERATION ACCEPTED
}
```

**What happens:**
1. **Generates unique hash** from operation + recordId + timestamp
2. **Looks up in storage** (`signatureRegistry` mapping)
   - If hash exists → return `false` (duplicate)
   - If hash doesn't exist → continue
3. **Records who did it** by storing the address
4. **Emits events** for logging and audit trail
5. **Returns** `true` (operation accepted)

---

### STEP 4️⃣: Response travels back through the layers

**Back in TransactionRegistryClient:**
```javascript
const result = await this.contract.methods
  .validateTransaction(operation, recordId, timestamp)
  .call({ from: this.account.address });
  // result = true or false ⬅️ RECEIVED FROM BLOCKCHAIN

return result;  // Pass it back to ExampleBackendService
```

---

### STEP 5️⃣: Backend Service decides what to do with the response

**File:** `backend/ExampleBackendService.js` (Line 38-53)
```javascript
const isApproved = await this.registryClient.validateAndSubmit(
  "Create",
  userId,
  timestamp
);

// Now we have the blockchain's decision
if (!isApproved) {
  // Blockchain said NO (duplicate or error)
  console.error(`[CREATE FAILED] User ${userId} creation rejected`);
  return {
    success: false,
    message: "Operation rejected. Duplicate or error.",
    userId,
  };
}

// Blockchain said YES (new operation accepted)
this.database[userId] = {
  ...userData,
  createdAt: timestamp,
  createdBy: this.registryClient.getPublicAddress(),
};

console.log(`[CREATE SUCCESS] User ${userId} created`);
return {
  success: true,
  message: `User ${userId} created successfully`,
  userId,
  data: this.database[userId],
};
```

**What happens:**
- If `isApproved = true`: Write to local database ✅
- If `isApproved = false`: Return error message ❌

---

## **SCENARIO: User wants to READ a record**

**File:** `backend/ExampleBackendService.js` (Line 57-85)
```javascript
async readUser(userId) {
  console.log(`\n[READ] Retrieving user ${userId}`);

  const userData = this.database[userId];
  if (!userData) {
    return {
      success: false,
      message: `User ${userId} not found`,
    };
  }

  // Query blockchain for who created this record
  const creator = await this.registryClient.findSignerByData(
    "Create",
    userId,
    userData.createdAt
  );

  console.log(`[READ SUCCESS] Retrieved user ${userId}`);
  return {
    success: true,
    message: `User ${userId} retrieved`,
    data: userData,
    auditTrail: {
      createdBy: creator,
      createdAt: userData.createdAt,
    },
  };
}
```

**Execution sequence:**
1. Retrieve from local database
2. Call `findSignerByData()` to query blockchain
3. Get back the address of who created it
4. Return data with audit trail

---

### What `findSignerByData()` does:

**File:** `backend/TransactionRegistryClient.js` (Line 88-110)
```javascript
async findSignerByData(operation, recordId, timestamp) {
  try {
    // Query the smart contract's getSigner function
    const signer = await this.contract.methods
      .getSigner(operation, recordId, timestamp)
      .call();

    if (signer === "0x0000000000000000000000000000000000000000") {
      console.log(`[NOT FOUND] No signer found`);
      return null;
    }

    console.log(`[FOUND] Signer: ${signer}`);
    return signer;
  } catch (error) {
    console.error(`[ERROR] findSignerByData failed:`, error);
    return null;
  }
}
```

**Calls the smart contract's `getSigner()` function:**

**File:** `blockchain/contracts/TransactionRegistry.sol` (Line 54-70)
```solidity
function getSigner(
    string calldata operation, 
    string calldata recordId, 
    uint256 timestamp
) external view override returns (address) {
    // Generate the same hash as before
    bytes32 txnHash = keccak256(abi.encodePacked(operation, recordId, timestamp));
    
    // Look it up in our registry
    return signatureRegistry[txnHash];
    // Returns the address or 0x000... if not found
}
```

**What happens:**
1. Generates the same hash
2. Looks it up in `signatureRegistry` mapping
3. Returns the address or zero address

---

## **SCENARIO: Duplicate operation detection**

User tries to create the same record TWICE:

### First attempt:
```
Hash: keccak256("Create" + "user_123" + "1765416108")
  ↓
Check: Is "Hash" in signatureRegistry? NO
  ↓
Record it: signatureRegistry[Hash] = msg.sender
  ↓
Return: true ✅
```

### Second attempt (same operation, same timestamp):
```
Hash: keccak256("Create" + "user_123" + "1765416108")
  ↓ (Same hash!)
Check: Is "Hash" in signatureRegistry? YES! (from first attempt)
  ↓
Return: false ❌ DUPLICATE!
```

**The blockchain prevents the duplicate write!**

---

## **SCENARIO: Same operation, different timestamp**

User tries to create the same record at a different time:

### First attempt:
```
Hash_v1: keccak256("Create" + "user_123" + "1765416108") = "abc123..."
  ↓
Record it
```

### Second attempt (different timestamp):
```
Hash_v2: keccak256("Create" + "user_123" + "1765416199") = "def456..."
  ↓ (Different hash because timestamp is different!)
Check: Is "Hash_v2" in signatureRegistry? NO
  ↓
Record it: signatureRegistry[Hash_v2] = msg.sender
  ↓
Return: true ✅ NEW OPERATION
```

**Different timestamp = Different hash = Treated as new operation**

---

## **SCENARIO: UPDATE operation**

**File:** `backend/ExampleBackendService.js` (Line 89-120)
```javascript
async updateUser(userId, updateData) {
  console.log(`\n[UPDATE] Attempting to update user ${userId}`);
  
  const timestamp = Math.floor(Date.now() / 1000);
  
  // Step 1: Validate UPDATE operation (not CREATE)
  const isApproved = await this.registryClient.validateAndSubmit(
    "Update",  // ⬅️ Different from CREATE!
    userId,
    timestamp
  );

  if (!isApproved) {
    console.error(`[UPDATE FAILED] Update rejected`);
    return { success: false, message: "Update rejected" };
  }

  // Step 2: Update in database
  if (!this.database[userId]) {
    return { success: false, message: "User not found" };
  }

  this.database[userId] = {
    ...this.database[userId],
    ...updateData,
    updatedAt: timestamp,
    updatedBy: this.registryClient.getPublicAddress(),
  };

  console.log(`[UPDATE SUCCESS] User ${userId} updated`);
  return { success: true, message: `User ${userId} updated`, userId };
}
```

**Execution:**
```
Operation: "Update" (not "Create")
  ↓
Hash: keccak256("Update" + "user_123" + "1765416200")
  ↓
This is different from the CREATE hash!
  ↓
Check blockchain: New hash? YES
  ↓
Return: true ✅
```

**You can Create, Update, and Delete the same record because they're different operations!**

---

## **SCENARIO: DELETE operation**

**File:** `backend/ExampleBackendService.js` (Line 124-155)
```javascript
async deleteUser(userId) {
  console.log(`\n[DELETE] Attempting to delete user ${userId}`);
  
  const timestamp = Math.floor(Date.now() / 1000);
  
  const isApproved = await this.registryClient.validateAndSubmit(
    "Delete",  // ⬅️ Different from CREATE and UPDATE!
    userId,
    timestamp
  );

  if (!isApproved) {
    return { success: false, message: "Delete rejected" };
  }

  delete this.database[userId];

  console.log(`[DELETE SUCCESS] User ${userId} deleted`);
  return {
    success: true,
    message: `User ${userId} deleted`,
    userId,
  };
}
```

**Same pattern but with "Delete" operation type**

---

## **SCENARIO: Queue management (Race condition prevention)**

User tries to CREATE two identical operations at exactly the same time:

### Request 1 arrives:
```
validateAndSubmit("Create", "user_123", 1765416108)
  ↓
queueKey = "Create:user_123:1765416108"
  ↓
operationQueue[queueKey] = PROCESSING...
  ↓
Calls blockchain
  ↓
Returns true, removes from queue
```

### Request 2 arrives (while Request 1 is still processing):
```
validateAndSubmit("Create", "user_123", 1765416108)
  ↓
queueKey = "Create:user_123:1765416108"  (Same!)
  ↓
Check: Is queueKey already in operationQueue? YES!
  ↓
Return the existing promise (wait for it to complete)
  ↓
Return the same result as Request 1
```

**Race condition prevented! Both requests get the same result.**

---

## **SCENARIO: Audit Trail (getting history)**

**File:** `backend/TransactionRegistryClient.js` (Line 130-160)
```javascript
async retrieveTransactionHistory(userAddress) {
  try {
    console.log(`[AUDIT] Retrieving transaction history for ${userAddress}`);

    // Get all TransactionExecuted events from the blockchain
    const events = await this.contract.getPastEvents(
      "TransactionExecuted",
      {
        filter: { signer: userAddress },  // Only events from this user
        fromBlock: 0,
        toBlock: "latest",
      }
    );

    console.log(`[AUDIT] Found ${events.length} transactions for ${userAddress}`);
    return events;
  } catch (error) {
    console.error(`[ERROR] retrieveTransactionHistory failed:`, error);
    return [];
  }
}
```

**What happens:**
1. Queries blockchain for all `TransactionExecuted` events
2. Filters by user address
3. Returns complete audit trail
4. Shows: who did what, when, with proof

---

## **EXECUTION FLOW DIAGRAM - COMPLETE LOOP**

```
┌─────────────────────────────────────────────────────────────────┐
│ USER REQUEST: Create new user                                   │
│ Input: userId="user_123", userData={...}                        │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ ExampleBackendService.createUser()                              │
│ 1. Prepare timestamp = now()                                    │
│ 2. Call: validateAndSubmit("Create", "user_123", timestamp)     │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ TransactionRegistryClient.validateAndSubmit()                   │
│ 1. Create queueKey = "Create:user_123:1765416108"               │
│ 2. Check queue (prevent duplicates)                             │
│ 3. Call smart contract: contract.validateTransaction()          │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ Web3 connection to Ganache at 127.0.0.1:7545                    │
│ Sends transaction to blockchain                                 │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ GANACHE BLOCKCHAIN                                              │
│ Executes: TransactionRegistry.validateTransaction()             │
│                                                                  │
│ 1. Hash = keccak256("Create:user_123:1765416108")               │
│ 2. Check: Is Hash in signatureRegistry? NO                      │
│ 3. Record: signatureRegistry[Hash] = msg.sender                 │
│ 4. Emit: TransactionExecuted event                              │
│ 5. Emit: ValidationResult event                                 │
│ 6. Return: true                                                 │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼ (result = true)
┌─────────────────────────────────────────────────────────────────┐
│ TransactionRegistryClient (receives response)                   │
│ Return: true                                                    │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼ (isApproved = true)
┌─────────────────────────────────────────────────────────────────┐
│ ExampleBackendService (decision point)                          │
│ if (isApproved) {                                               │
│   ✅ Write to local database                                    │
│   ✅ Return success response                                    │
│ }                                                               │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ USER RESPONSE: Success! User created                            │
│ Output: { success: true, userId: "user_123", data: {...} }      │
└─────────────────────────────────────────────────────────────────┘
```

---

## **SIMULATION EXECUTION FLOW**

**File:** `simulation/TransactionRegistry_simulation.py`

The Python simulation **mirrors exactly the same logic** but without Ganache:

```python
# Step 1: Create registry (mimics smart contract)
registry = SimulatedTransactionRegistry()

# Step 2: Create CRUD service
service = SimulatedCRUDService(registry)

# Step 3: User 1 creates a record
result1 = service.create("customer_001", user="user_001")
# ↓ Internally calls:
#   ├─ Hash operation
#   ├─ Check if hash exists (NO)
#   ├─ Store hash → user_001
#   ├─ Emit event
#   └─ Return true

# Step 4: User 1 updates the record
result2 = service.update("customer_001", user="user_001")
# ↓ Internally:
#   ├─ Different operation type (Update, not Create)
#   ├─ Different hash
#   ├─ Check if hash exists (NO)
#   ├─ Store hash → user_001
#   ├─ Emit event
#   └─ Return true

# Step 5: User 1 tries to update with same timestamp
result3 = service.update("customer_001", user="user_001", timestamp=1765416108)
# ↓ Internally:
#   ├─ Same hash as previous update
#   ├─ Check if hash exists (YES!)
#   ├─ Emit duplicate event
#   └─ Return false ❌ DUPLICATE!

# Step 6: Get audit trail
history = registry.get_transaction_history("user_001")
# Returns all operations performed by user_001
```

---

## 📋 File Execution Order Summary

### When User performs CREATE:
```
1. USER initiates createUser()
   ↓
2. ExampleBackendService.createUser()
   ↓
3. TransactionRegistryClient.validateAndSubmit()
   ↓
4. Web3 calls smart contract on Ganache
   ↓
5. TransactionRegistry.validateTransaction() (Solidity)
   ↓
6. Returns boolean result
   ↓
7. Backend decides: write to DB or reject
   ↓
8. RESPONSE to user
```

### When User performs READ:
```
1. USER initiates readUser()
   ↓
2. ExampleBackendService.readUser()
   ↓
3. Read from local database
   ↓
4. TransactionRegistryClient.findSignerByData()
   ↓
5. Web3 calls smart contract on Ganache
   ↓
6. TransactionRegistry.getSigner() (Solidity)
   ↓
7. Returns address of who did the operation
   ↓
8. Backend returns data + audit trail
   ↓
9. RESPONSE to user with proof
```

### When User performs UPDATE/DELETE:
```
1. USER initiates updateUser() or deleteUser()
   ↓
2. ExampleBackendService.updateUser() or deleteUser()
   ↓
3. TransactionRegistryClient.validateAndSubmit()
   ↓ (Same flow as CREATE)
4. Blockchain validates new operation type
   ↓
5. Returns true/false
   ↓
6. Backend updates/deletes from database
   ↓
7. RESPONSE to user
```

---

## 🔑 Key Concepts to Remember

### **Hash Uniqueness**
```
Hash = keccak256(operation + recordId + timestamp)

Create user_123 at 1765416108 = Hash_A
Update user_123 at 1765416108 = Hash_B (different!)
Create user_123 at 1765416200 = Hash_C (different!)
Create user_123 at 1765416108 = Hash_A (same → DUPLICATE!)
```

### **Queue Management**
Prevents race conditions by tracking in-flight requests:
```
Request 1: Create:user_123:1765416108 → PROCESSING
Request 2: Create:user_123:1765416108 → WAITING (same key!)
Response 1: true → Remove from queue
Response 2: return cached result (true)
```

### **Layer Separation**
```
Frontend → only sees boolean (success/fail)
Backend → sees blockchain responses + manages queue
Blockchain → immutable ledger of all operations
Database → only updated if blockchain approves
```

### **Audit Trail**
```
Every validated operation = Event emitted
Events stored on blockchain forever
Query by user address = get all their operations
Proves who did what, when
```

---

## 📝 File Cross-Reference

| File | Purpose | Called By | Calls |
|------|---------|-----------|-------|
| `ExampleBackendService.js` | CRUD operations | Frontend/API | `TransactionRegistryClient.js` |
| `TransactionRegistryClient.js` | Blockchain communication | `ExampleBackendService.js` | `Web3` → Ganache |
| `TransactionRegistry.sol` | Smart contract logic | Web3/Ganache | N/A (on blockchain) |
| `ITransactionRegistry.sol` | Contract interface | `TransactionRegistry.sol` | N/A |
| `TransactionRegistry_simulation.py` | Local testing (no blockchain) | Manual execution | N/A |

---

## 🎯 Study Guide

### To understand CREATE flow:
1. Read `ExampleBackendService.createUser()` (Line 27-53)
2. Read `TransactionRegistryClient.validateAndSubmit()` (Line 40-78)
3. Read `TransactionRegistry.validateTransaction()` Solidity (Line 25-50)
4. Trace back the response through all three files

### To understand READ flow:
1. Read `ExampleBackendService.readUser()` (Line 57-85)
2. Read `TransactionRegistryClient.findSignerByData()` (Line 88-110)
3. Read `TransactionRegistry.getSigner()` Solidity (Line 54-70)

### To understand duplicate detection:
1. Review hash generation in Solidity
2. Review `signatureRegistry` mapping
3. See how same operation → same hash → duplicate detected

### To understand everything together:
1. Run the Python simulation: `python TransactionRegistry_simulation.py`
2. Watch the console output showing each step
3. See the audit trail at the end showing all operations
4. Now understand: blockchain does the same thing
