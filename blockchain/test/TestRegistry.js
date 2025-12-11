const TransactionRegistry = artifacts.require("TransactionRegistry");

contract("TransactionRegistry", (accounts) => {
  let registry;
  
  // الحسابات اللي هنستخدمها في التست
  const user1 = accounts[0]; // المستخدم الأصلي
  const user2 = accounts[1]; // المستخدم المقلد (الهاكر)

  // بيانات عملية وهمية للتجربة
  const operation = "CreateUser";
  const recordId = "User_101";
  const timestamp = 123456789;

  // قبل أي اختبار، هات لنا نسخة من العقد المرفوع
  before(async () => {
    registry = await TransactionRegistry.deployed();
  });

  // الاختبار الأول: هل العقد بيقبل العملية الجديدة؟
  it("Should validate and record a new transaction", async () => {
    // 1. تنفيذ العملية من حساب user1
    const result = await registry.validateTransaction(operation, recordId, timestamp, { from: user1 });

    // 2. التأكد من الأحداث (Events)
    // العقد بيطلع حدثين، محتاجين نتأكد إن النتيجة true
    // نبحث في الـ logs عن حدث ValidationResult
    const log = result.logs.find(e => e.event === "ValidationResult");
    
    assert.equal(log.args.success, true, "Transaction should be accepted");
    console.log("   ✅ First transaction accepted successfully");
  });

  // الاختبار الثاني: هل العقد سجل مين صاحب العملية صح؟
  it("Should return the correct signer address", async () => {
    // نسأل العقد: مين اللي عمل العملية دي؟
    const signer = await registry.getSigner(operation, recordId, timestamp);
    
    assert.equal(signer, user1, "Signer should be user1");
    console.log("   ✅ Signer recorded correctly: " + signer);
  });

  // الاختبار الثالث: محاولة تكرار نفس العملية (Double Spending)
  it("Should REJECT duplicate transaction", async () => {
    // 1. محاولة تنفيذ نفس العملية تاني (حتى لو من نفس الشخص أو شخص تاني)
    const result = await registry.validateTransaction(operation, recordId, timestamp, { from: user2 });

    // 2. فحص النتيجة
    const log = result.logs.find(e => e.event === "ValidationResult");
    
    // المفروض النتيجة تكون false المرة دي
    assert.equal(log.args.success, false, "Duplicate transaction should be rejected");
    console.log("   ✅ Duplicate transaction blocked successfully");
  });
});
