/**
 * ExampleBackendService.js
 * 
 * Demonstrates how the TransactionRegistryClient integrates with CRUD operations.
 * This shows the Layer 2 (Backend) in action.
 */

const TransactionRegistryClient = require("./TransactionRegistryClient");

/**
 * Example: A User Service that uses TransactionRegistryClient
 * for validating Create, Update, Delete operations
 */
class UserService {
  constructor(registryClient, database) {
    this.registryClient = registryClient;
    this.database = database; // Local database (simulated)
  }

  /**
   * CREATE: Add a new user
   * 
   * Workflow:
   * 1. Prepare the data
   * 2. Call validateAndSubmit() on blockchain
   * 3. If approved (true), write to local database
   * 4. If rejected (false), return error to user
   */
  async createUser(userId, userData) {
    console.log(`\n[CREATE] Attempting to create user ${userId}`);
    
    const timestamp = Math.floor(Date.now() / 1000);
    
    // Step 1: Validate with blockchain
    const isApproved = await this.registryClient.validateAndSubmit(
      "Create",
      userId,
      timestamp
    );

    // Step 2: Only proceed if blockchain approved
    if (!isApproved) {
      console.error(`[CREATE FAILED] User ${userId} creation rejected - duplicate operation or error`);
      return {
        success: false,
        message: "Operation rejected. This user creation may have been attempted before.",
        userId,
      };
    }

    // Step 3: Write to local database
    this.database[userId] = {
      ...userData,
      createdAt: timestamp,
      createdBy: this.registryClient.getPublicAddress(),
    };

    console.log(`[CREATE SUCCESS] User ${userId} created and recorded`);
    return {
      success: true,
      message: `User ${userId} created successfully`,
      userId,
      data: this.database[userId],
    };
  }

  /**
   * READ: Retrieve a user and verify authenticity
   * 
   * Workflow:
   * 1. Retrieve from local database
   * 2. Query blockchain for who created this user
   * 3. Return data with audit trail
   */
  async readUser(userId) {
    console.log(`\n[READ] Retrieving user ${userId}`);

    const userData = this.database[userId];
    if (!userData) {
      console.log(`[READ] User ${userId} not found`);
      return {
        success: false,
        message: `User ${userId} not found`,
        userId,
      };
    }

    // Query blockchain for creation proof
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

  /**
   * UPDATE: Modify a user
   * 
   * Workflow:
   * 1. Validate with blockchain (prevents duplicate updates)
   * 2. Update local database only if approved
   */
  async updateUser(userId, updatedData) {
    console.log(`\n[UPDATE] Attempting to update user ${userId}`);

    if (!this.database[userId]) {
      console.error(`[UPDATE FAILED] User ${userId} does not exist`);
      return {
        success: false,
        message: `User ${userId} does not exist`,
        userId,
      };
    }

    const timestamp = Math.floor(Date.now() / 1000);

    // Validate with blockchain
    const isApproved = await this.registryClient.validateAndSubmit(
      "Update",
      userId,
      timestamp
    );

    if (!isApproved) {
      console.error(`[UPDATE FAILED] User ${userId} update rejected`);
      return {
        success: false,
        message: "Operation rejected. This update may have been attempted before.",
        userId,
      };
    }

    // Update local database
    this.database[userId] = {
      ...this.database[userId],
      ...updatedData,
      updatedAt: timestamp,
      updatedBy: this.registryClient.getPublicAddress(),
    };

    console.log(`[UPDATE SUCCESS] User ${userId} updated`);
    return {
      success: true,
      message: `User ${userId} updated successfully`,
      userId,
      data: this.database[userId],
    };
  }

  /**
   * DELETE: Remove a user
   * 
   * Workflow:
   * 1. Validate with blockchain
   * 2. Remove from local database only if approved
   */
  async deleteUser(userId) {
    console.log(`\n[DELETE] Attempting to delete user ${userId}`);

    if (!this.database[userId]) {
      console.error(`[DELETE FAILED] User ${userId} does not exist`);
      return {
        success: false,
        message: `User ${userId} does not exist`,
        userId,
      };
    }

    const timestamp = Math.floor(Date.now() / 1000);

    // Validate with blockchain
    const isApproved = await this.registryClient.validateAndSubmit(
      "Delete",
      userId,
      timestamp
    );

    if (!isApproved) {
      console.error(`[DELETE FAILED] User ${userId} deletion rejected`);
      return {
        success: false,
        message: "Operation rejected. This deletion may have been attempted before.",
        userId,
      };
    }

    // Remove from database
    delete this.database[userId];

    console.log(`[DELETE SUCCESS] User ${userId} deleted`);
    return {
      success: true,
      message: `User ${userId} deleted successfully`,
      userId,
    };
  }

  /**
   * Get audit trail for a specific user's operations
   */
  async getAuditTrail(userAddress) {
    console.log(`\n[AUDIT] Retrieving audit trail for ${userAddress}`);
    const history = await this.registryClient.retrieveTransactionHistory(userAddress);
    return {
      userAddress,
      operationCount: history.length,
      operations: history,
    };
  }
}

// ===== EXAMPLE USAGE =====
// This demonstrates the complete workflow

async function demonstrateSystem() {
  console.log("========================================");
  console.log("  CRUD dApp with Blockchain Layer");
  console.log("  Layer 2: Backend Service Example");
  console.log("========================================");

  // Initialize the registry client
  // In a real scenario, these would come from environment variables
  const client = new TransactionRegistryClient(
    "http://localhost:7545",
    [], // ABI would be imported from compiled contract
    "0xYourDeployedContractAddress",
    "0xYourPrivateKeyInHex"
  );

  // Create a simulated database
  const simulatedDatabase = {};

  // Create the user service
  const userService = new UserService(client, simulatedDatabase);

  // Demonstrate CRUD operations
  try {
    // CREATE
    await userService.createUser("user_001", {
      name: "John Doe",
      email: "john@example.com",
    });

    // READ
    await userService.readUser("user_001");

    // UPDATE
    await userService.updateUser("user_001", {
      email: "john.doe@example.com",
    });

    // Attempt duplicate UPDATE (should fail)
    await userService.updateUser("user_001", {
      email: "john.doe@example.com",
    });

    // DELETE
    await userService.deleteUser("user_001");

    // Get audit trail
    await userService.getAuditTrail(client.getPublicAddress());
  } catch (error) {
    console.error("Error during demonstration:", error);
  }
}

module.exports = { UserService, demonstrateSystem };
