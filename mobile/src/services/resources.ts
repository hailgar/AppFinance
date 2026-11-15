import type { Category, Page, TransactionType } from "../domain";
import type { createApi } from "./api";

// FastAPI wraps all collection resources in data.items, including categories.
export async function getCategories(
  api: ReturnType<typeof createApi>,
  type: TransactionType,
): Promise<Category[]> {
  const { data } = await api<Page<Category>>("/categories?type=" + type);
  return data.items;
}
