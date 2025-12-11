const TransactionRegistry = artifacts.require("TransactionRegistry");

contract("TransactionRegistry", (accounts) => {
  let registryInstance;
  const deployer = accounts[0];
  const user1 = accounts[1];
  const user2 = accounts[2];

  beforeEach(async () => {
    registryInstance = await TransactionRegistry.new();
  });

  describe("validateTransaction", () => {
    it("should accept a new transaction and return true", async () => {
      const operation = "Create";
      const recordId = "user_123";
      const timestamp = Math.floor(Date.now() / 1000);

      const tx = await registryInstance.validateTransaction(
        operation,
        recordId,
        timestamp,
        { from: user1 }
      );

      const validationEvent = tx.logs.find(log => log.event === 'ValidationResult');
      assert.isTrue(validationEvent.args.success, "First transaction should be accepted");
    });

    it("should reject duplicate transactions and return false", async () => {
      const operation = "Update";
      const recordId = "product_456";
      const timestamp = Math.floor(Date.now() / 1000);

      // First call should succeed
      const firstTx = await registryInstance.validateTransaction(
        operation,
        recordId,
        timestamp,
        { from: user1 }
      );
      const firstValidationEvent = firstTx.logs.find(log => log.event === 'ValidationResult');
      assert.isTrue(firstValidationEvent.args.success, "First transaction should succeed");

      // Second call with same parameters should fail
      const secondTx = await registryInstance.validateTransaction(
        operation,
        recordId,
        timestamp,
        { from: user1 }
      );
      const secondValidationEvent = secondTx.logs.find(log => log.event === 'ValidationResult');
      assert.isFalse(secondValidationEvent.args.success, "Duplicate transaction should be rejected");
    });

    it("should emit TransactionExecuted event on success", async () => {
      const operation = "Delete";
      const recordId = "order_789";
      const timestamp = Math.floor(Date.now() / 1000);

      const tx = await registryInstance.validateTransaction(
        operation,
        recordId,
        timestamp,
        { from: user1 }
      );

      const txnEvent = tx.logs.find(log => log.event === 'TransactionExecuted');
      assert.isDefined(txnEvent, "Should have TransactionExecuted event");
      assert.equal(txnEvent.args.signer, user1, "Signer should be user1");
      assert.equal(
        txnEvent.args.timestamp.toNumber(),
        timestamp,
        "Timestamp should match"
      );
    });

    it("should allow different users to perform the same operation on different records", async () => {
      const operation = "Create";
      const timestamp = Math.floor(Date.now() / 1000);

      const result1Tx = await registryInstance.validateTransaction(
        operation,
        "record_1",
        timestamp,
        { from: user1 }
      );
      const result1Event = result1Tx.logs.find(log => log.event === 'ValidationResult');

      const result2Tx = await registryInstance.validateTransaction(
        operation,
        "record_2",
        timestamp,
        { from: user2 }
      );
      const result2Event = result2Tx.logs.find(log => log.event === 'ValidationResult');

      assert.isTrue(result1Event.args.success, "User1's operation should succeed");
      assert.isTrue(result2Event.args.success, "User2's operation should succeed");
    });

    it("should allow same record to be operated on at different timestamps", async () => {
      const operation = "Update";
      const recordId = "data_xyz";
      const timestamp1 = Math.floor(Date.now() / 1000);
      const timestamp2 = timestamp1 + 100; // 100 seconds later

      const result1Tx = await registryInstance.validateTransaction(
        operation,
        recordId,
        timestamp1,
        { from: user1 }
      );
      const result1Event = result1Tx.logs.find(log => log.event === 'ValidationResult');

      const result2Tx = await registryInstance.validateTransaction(
        operation,
        recordId,
        timestamp2,
        { from: user1 }
      );
      const result2Event = result2Tx.logs.find(log => log.event === 'ValidationResult');

      assert.isTrue(result1Event.args.success, "First operation should succeed");
      assert.isTrue(result2Event.args.success, "Second operation at different time should succeed");
    });
  });

  describe("getSigner", () => {
    it("should return the correct signer for a validated transaction", async () => {
      const operation = "Create";
      const recordId = "user_999";
      const timestamp = Math.floor(Date.now() / 1000);

      await registryInstance.validateTransaction(
        operation,
        recordId,
        timestamp,
        { from: user1 }
      );

      const signer = await registryInstance.getSigner(
        operation,
        recordId,
        timestamp
      );

      assert.equal(signer, user1, "Signer should be user1");
    });

    it("should return zero address for non-existent transaction", async () => {
      const operation = "Delete";
      const recordId = "non_existent";
      const timestamp = Math.floor(Date.now() / 1000);

      const signer = await registryInstance.getSigner(
        operation,
        recordId,
        timestamp
      );

      assert.equal(
        signer,
        "0x0000000000000000000000000000000000000000",
        "Should return zero address for non-existent transaction"
      );
    });

    it("should correctly distinguish between different transactions", async () => {
      const timestamp = Math.floor(Date.now() / 1000);

      // Create three different transactions
      await registryInstance.validateTransaction("Create", "record_a", timestamp, {
        from: user1,
      });
      await registryInstance.validateTransaction("Update", "record_a", timestamp, {
        from: user2,
      });
      await registryInstance.validateTransaction("Create", "record_b", timestamp, {
        from: user2,
      });

      // Verify each signer
      const signer1 = await registryInstance.getSigner("Create", "record_a", timestamp);
      const signer2 = await registryInstance.getSigner("Update", "record_a", timestamp);
      const signer3 = await registryInstance.getSigner("Create", "record_b", timestamp);

      assert.equal(signer1, user1, "First transaction signer should be user1");
      assert.equal(signer2, user2, "Second transaction signer should be user2");
      assert.equal(signer3, user2, "Third transaction signer should be user2");
    });
  });

  describe("Integration Tests", () => {
    it("should handle a realistic CRUD workflow", async () => {
      const recordId = "customer_001";
      const baseTimestamp = Math.floor(Date.now() / 1000);

      // Create
      const createTx = await registryInstance.validateTransaction(
        "Create",
        recordId,
        baseTimestamp,
        { from: user1 }
      );
      const createEvent = createTx.logs.find(log => log.event === 'ValidationResult');
      assert.isTrue(createEvent.args.success, "Create should succeed");

      // Update
      const updateTx = await registryInstance.validateTransaction(
        "Update",
        recordId,
        baseTimestamp + 10,
        { from: user1 }
      );
      const updateEvent = updateTx.logs.find(log => log.event === 'ValidationResult');
      assert.isTrue(updateEvent.args.success, "Update should succeed");

      // Delete
      const deleteTx = await registryInstance.validateTransaction(
        "Delete",
        recordId,
        baseTimestamp + 20,
        { from: user1 }
      );
      const deleteEvent = deleteTx.logs.find(log => log.event === 'ValidationResult');
      assert.isTrue(deleteEvent.args.success, "Delete should succeed");

      // Verify all three operations are recorded with correct signers
      const createSigner = await registryInstance.getSigner(
        "Create",
        recordId,
        baseTimestamp
      );
      const updateSigner = await registryInstance.getSigner(
        "Update",
        recordId,
        baseTimestamp + 10
      );
      const deleteSigner = await registryInstance.getSigner(
        "Delete",
        recordId,
        baseTimestamp + 20
      );

      assert.equal(createSigner, user1);
      assert.equal(updateSigner, user1);
      assert.equal(deleteSigner, user1);
    });
  });
});
