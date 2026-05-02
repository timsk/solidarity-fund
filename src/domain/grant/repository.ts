export type GrantRow = {
	id: string;
	applicationId: string;
	applicantId: string;
	lotteryName: string;
	rank: number;
	status: string;
	paymentPreference: string;
	sortCode: string | null;
	accountNumber: string | null;
	proofOfAddressRef: string | null;
	volunteerId: string | null;
	volunteerName: string | null;
	applicantName: string | null;
	applicantPhone: string | null;
	poaAttempts: number;
	amount: number | null;
	paymentMethod: string | null;
	paidBy: string | null;
	paidAt: string | null;
	expenseReference: string | null;
	reimbursedAt: string | null;
	releasedReason: string | null;
	releasedAt: string | null;
	notes: string | null;
	createdAt: string;
	updatedAt: string;
};

export interface GrantRepository {
	getById(id: string): Promise<GrantRow | null>;
	getByApplicationId(applicationId: string): Promise<GrantRow | null>;
	listByLottery(lotteryName: string): Promise<GrantRow[]>;
	listDistinctLotteries(): Promise<string[]>;
	updateNotes(id: string, notes: string): Promise<void>;
}
