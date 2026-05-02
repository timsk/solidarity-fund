export type ApplicationRow = {
	ref: string;
	id: string;
	applicantId: string;
	lotteryName: string;
	status: string;
	rank: number | null;
	paymentPreference: string;
	name: string | null;
	phone: string | null;
	rejectReason: string | null;
	appliedAt: string | null;
	acceptedAt: string | null;
	selectedAt: string | null;
	rejectedAt: string | null;
	email: string | null;
	meetingPlace: string | null;
	sortCode: string | null;
	accountNumber: string | null;
	poaRef: string | null;
	reviewedByVolunteerId: string | null;
};

export type ApplicationFilters = {
	status?: string;
	paymentPreference?: string;
};

export interface ApplicationRepository {
	getById(id: string): Promise<ApplicationRow | null>;
	getByRef(ref: string): Promise<ApplicationRow | null>;
	listByLottery(
		lotteryName: string,
		filters?: ApplicationFilters,
	): Promise<ApplicationRow[]>;
	listDistinctLotteries(): Promise<string[]>;
}
