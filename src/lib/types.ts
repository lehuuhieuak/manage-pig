export type Farm = { id: string; name: string; version: number };
export type Batch = { id: string; farmId: string; name: string; startDate: string; endDate: string | null; pigCount: number; pigCost: string; version: number };
export type FeedType = { id: string; name: string; lastPrice: string; lastDiscount: string };
export type FeedLine = { feedTypeId: string; name: string; bags: number; price: string; discount: string };
export type Entry = { id: string; batchId: string; kind: 'feed' | 'sale' | 'labor' | 'other'; date: string; month?: string; description: string; amount: string; version: number; lines?: FeedLine[]; pigCount?: number; kg?: string; price?: string };
export type Snapshot = { farms: Farm[]; batches: Batch[]; feedTypes: FeedType[]; entries: Entry[] };
export type Mutation = { requestId: string; action: 'createFarm' | 'deleteFarm' | 'createBatch' | 'updateBatch' | 'deleteBatch' | 'endBatch' | 'createFeedType' | 'saveEntry' | 'deleteEntry'; data: Record<string, unknown> };
export type ApiError = { error: string; code?: string };
