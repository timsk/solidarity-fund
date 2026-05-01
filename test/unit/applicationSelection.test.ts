import { describe, expect, test } from "bun:test";
import { IllegalStateError } from "@event-driven-io/emmett";
import {
	decide,
	evolve,
	initialState,
} from "../../src/domain/application/decider.ts";
import type { ApplicationState } from "../../src/domain/application/types.ts";

function acceptedState(monthCycle = "2026-03"): ApplicationState {
	return {
		status: "accepted",
		applicationId: "app-1",
		applicantId: "applicant-1",
		monthCycle,
	};
}

function confirmedState(monthCycle = "2026-03"): ApplicationState {
	return {
		status: "confirmed",
		applicationId: "app-1",
		applicantId: "applicant-1",
		monthCycle,
	};
}

describe("application selection", () => {
	test("accepted → SelectApplication → ApplicationSelected", () => {
		const events = decide(
			{
				type: "SelectApplication",
				data: {
					applicationId: "app-1",
					lotteryMonthCycle: "2026-03",
					rank: 1,
					selectedAt: "2026-04-01T10:00:00Z",
				},
			},
			acceptedState(),
		);
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("ApplicationSelected");
		expect(events[0]!.data).toMatchObject({
			applicationId: "app-1",
			applicantId: "applicant-1",
			rank: 1,
		});
	});

	test("confirmed → SelectApplication → ApplicationSelected", () => {
		const events = decide(
			{
				type: "SelectApplication",
				data: {
					applicationId: "app-1",
					lotteryMonthCycle: "2026-03",
					rank: 2,
					selectedAt: "2026-04-01T10:00:00Z",
				},
			},
			confirmedState(),
		);
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("ApplicationSelected");
	});

	test("accepted → RejectFromLottery → ApplicationNotSelected", () => {
		const events = decide(
			{
				type: "RejectFromLottery",
				data: {
					applicationId: "app-1",
					lotteryMonthCycle: "2026-03",
					rejectedAt: "2026-04-01T10:00:00Z",
				},
			},
			acceptedState(),
		);
		expect(events).toHaveLength(1);
		expect(events[0]!.type).toBe("ApplicationNotSelected");
	});

	test("cannot select from initial state", () => {
		expect(() =>
			decide(
				{
					type: "SelectApplication",
					data: {
						applicationId: "app-1",
						lotteryMonthCycle: "2026-03",
						rank: 1,
						selectedAt: "2026-04-01T10:00:00Z",
					},
				},
				initialState(),
			),
		).toThrow(IllegalStateError);
	});

	test("cannot select already-selected application", () => {
		const selected: ApplicationState = {
			status: "selected",
			applicationId: "app-1",
			applicantId: "applicant-1",
			monthCycle: "2026-03",
			rank: 1,
		};
		expect(() =>
			decide(
				{
					type: "SelectApplication",
					data: {
						applicationId: "app-1",
						lotteryMonthCycle: "2026-03",
						rank: 1,
						selectedAt: "2026-04-01T10:00:00Z",
					},
				},
				selected,
			),
		).toThrow(IllegalStateError);
	});

	test("evolve: ApplicationSelected → selected state", () => {
		const state = evolve(acceptedState(), {
			type: "ApplicationSelected",
			data: {
				applicationId: "app-1",
				applicantId: "applicant-1",
				monthCycle: "2026-03",
				rank: 1,
				selectedAt: "2026-04-01T10:00:00Z",
			},
		});
		expect(state).toEqual({
			status: "selected",
			applicationId: "app-1",
			applicantId: "applicant-1",
			monthCycle: "2026-03",
			rank: 1,
		});
	});

  test("evolve: ApplicationNotSelected → not_selected state", () => {
    const state = evolve(acceptedState(), {
      type: "ApplicationNotSelected",
      data: {
        applicationId: "app-1",
        applicantId: "applicant-1",
        monthCycle: "2026-03",
        notSelectedAt: "2026-04-01T10:00:00Z",
      },
    });
    expect(state).toEqual({
      status: "not_selected",
      applicationId: "app-1",
      applicantId: "applicant-1",
      monthCycle: "2026-03",
    });
  });
});

describe("cancel due to lottery", () => {
  test("accepted → CancelApplicationDueToLottery → ApplicationLotteryCancelled", () => {
    const events = decide(
      {
        type: "ApplicationLotteryCancelled",
        data: {
          applicationId: "app-1",
          lotteryMonthCycle: "2026-03",
          cancelledAt: "2026-04-01T10:00:00Z",
        },
      },
      acceptedState(),
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("ApplicationLotteryCancelled");
    expect(events[0]!.data).toMatchObject({
      applicationId: "app-1",
      previousStatus: "accepted",
    });
  });

  test("confirmed → CancelApplicationDueToLottery → ApplicationLotteryCancelled", () => {
    const events = decide(
      {
        type: "ApplicationLotteryCancelled",
        data: {
          applicationId: "app-1",
          lotteryMonthCycle: "2026-03",
          cancelledAt: "2026-04-01T10:00:00Z",
        },
      },
      confirmedState(),
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("ApplicationLotteryCancelled");
    expect(events[0]!.data).toMatchObject({
      applicationId: "app-1",
      previousStatus: "confirmed",
    });
  });

  test("cannot cancel from initial state", () => {
    expect(() =>
      decide(
        {
          type: "ApplicationLotteryCancelled",
          data: {
            applicationId: "app-1",
            lotteryMonthCycle: "2026-03",
            cancelledAt: "2026-04-01T10:00:00Z",
          },
        },
        initialState(),
      ),
    ).toThrow(IllegalStateError);
  });

  test("cannot cancel from selected state", () => {
    const selected: ApplicationState = {
      status: "selected",
      applicationId: "app-1",
      applicantId: "applicant-1",
      monthCycle: "2026-03",
      rank: 1,
    };
    expect(() =>
      decide(
        {
          type: "ApplicationLotteryCancelled",
          data: {
            applicationId: "app-1",
            lotteryMonthCycle: "2026-03",
            cancelledAt: "2026-04-01T10:00:00Z",
          },
        },
        selected,
      ),
    ).toThrow(IllegalStateError);
  });

  test("cannot cancel from not_selected state", () => {
    const notSelected: ApplicationState = {
      status: "not_selected",
      applicationId: "app-1",
      applicantId: "applicant-1",
      monthCycle: "2026-03",
    };
    expect(() =>
      decide(
        {
          type: "ApplicationLotteryCancelled",
          data: {
            applicationId: "app-1",
            lotteryMonthCycle: "2026-03",
            cancelledAt: "2026-04-01T10:00:00Z",
          },
        },
        notSelected,
      ),
    ).toThrow(IllegalStateError);
  });

  test("evolve: ApplicationLotteryCancelled → cancelled", () => {
    const state = evolve(acceptedState(), {
      type: "ApplicationLotteryCancelled",
      data: {
        applicationId: "app-1",
        lotteryMonthCycle: "2026-03",
        previousStatus: "accepted",
        cancelledAt: "2026-04-01T10:00:00Z",
      },
    });
    expect(state).toEqual({
      status: "cancelled",
      applicationId: "app-1",
    });
  });
});
