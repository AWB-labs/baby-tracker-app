import apiClient from "./client";

export interface BagItem {
  id: number;
  babyId: number;
  label: string;
  checked: boolean;
  order: number;
  createdAt: string;
}

export async function getBagItems(babyId: number): Promise<BagItem[]> {
  const res = await apiClient.get<BagItem[]>("/bag-items", {
    params: { babyId },
  });
  return res.data;
}

export async function createBagItem(
  babyId: number,
  label: string
): Promise<BagItem> {
  const res = await apiClient.post<BagItem>("/bag-items", { babyId, label });
  return res.data;
}

export interface UpdateBagItemInput {
  label?: string;
  checked?: boolean;
  order?: number;
}

export async function updateBagItem(
  id: number,
  data: UpdateBagItemInput
): Promise<BagItem> {
  const res = await apiClient.patch<BagItem>(`/bag-items/${id}`, data);
  return res.data;
}

export async function deleteBagItem(id: number): Promise<void> {
  await apiClient.delete(`/bag-items/${id}`);
}
