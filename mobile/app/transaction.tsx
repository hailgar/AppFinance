import { router } from "expo-router";
import { TransactionEditor } from "../src/components/TransactionEditor";
import { useFinancialCommand } from "../src/components/useFinancialCommand";
export default function NewTransaction() {
  const mutation = useFinancialCommand();
  return (
    <TransactionEditor
      mutation={mutation}
      onReviewed={() => router.replace("/(tabs)/history")}
    />
  );
}
